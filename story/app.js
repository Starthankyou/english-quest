// English Story Quest — 靜態網頁，內容全部來自 content/*.json，不需建置。介面英文優先，中文用 .sub 小字放下方。
const KEY = "esq:v1";
const app = document.getElementById("app");
const tally = document.getElementById("tally");

/* ---------- 本機紀錄（localStorage 可能被擋，失敗時仍可閱讀） ---------- */
let saveOk = true;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { saveOk = false; return {}; } };
const state = Object.assign({ words: {}, done: {}, choices: {} }, load());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); saveOk = true; } catch { saveOk = false; } renderTally(); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const rec = w => { const r = (state.words[w] ||= { seen: null, hinted: [], recalled: [] }); r.ctx ||= {}; return r; };
// 在故事裡遇見：記 seen，並記下 ctx.story（Reading Lab 會記 ctx.lab，兩邊都有＝換情境遇見）
const seenHere = w => { const r = rec(w); r.seen ||= today(); r.ctx.story ||= today(); return r; };
const markSeen = w => { const r = rec(w); if (!r.seen || !r.ctx.story) { seenHere(w); save(); } };
// 另一個分頁（Reading Lab）可能寫過紀錄：每次換頁前重讀
const reload = () => { const fresh = load(); state.words = fresh.words || state.words; };
const addDate = (list, d) => { if (!list.includes(d)) list.push(d); };

function stats() {
  const ws = Object.values(state.words);
  return {
    seen: ws.filter(r => r.seen).length,
    recalled: ws.filter(r => r.recalled.length).length,
    crossDay: ws.filter(r => r.recalled.length >= 2).length,
    transfer: ws.filter(r => r.ctx?.story && r.ctx?.lab).length,
  };
}
function renderTally() {
  const s = stats();
  tally.innerHTML = `Met ${s.seen} · Recalled ${s.recalled} · ` +
    (s.crossDay ? `Next-day recall ${s.crossDay}` : "Next-day recall: not checked yet") + (s.transfer ? ` · New context ${s.transfer}` : "") + (saveOk ? "" : " · ⚠ Progress can’t be saved in this browser") +
    `<span class="sub">遇見 ${s.seen} 字｜自己想起 ${s.recalled} 字｜` + (s.crossDay ? `隔天想起 ${s.crossDay} 字` : "隔天想起：尚未檢核") + (s.transfer ? `｜換情境遇見 ${s.transfer} 字` : "") +
    (saveOk ? "" : "｜這個瀏覽器無法儲存紀錄") + `</span>`;
}

/* ---------- 內容 ---------- */
const cache = new Map();
const getJSON = path => {
  if (!cache.has(path)) cache.set(path, fetch(`content/${path}`).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(path);
};
const lexicon = {};       // word -> {word, level, pos, zh, kk}
let chars = { badges: {}, residents: {} };
async function loadWeek(id) {
  const wk = await getJSON(`weeks/${id}/week.json`);
  if (wk) for (const d of wk.days) for (const w of d.words) lexicon[w.word] = w;
  return wk;
}

/* ---------- 小工具 ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// [[lemma]] 或 [[顯示文字|lemma]] -> 可點的字
const markup = (text, core) => esc(text).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, shown, lemma) => {
  const w = (lemma || shown).toLowerCase();
  return `<button type="button" class="w${core.includes(w) ? "" : " review"}" data-w="${esc(w)}">${shown}</button>`;
});
const bi = (en, zh) => `${en}<span class="sub">${zh}</span>`;   // 英文優先，中文小字在下
const norm = s => s.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");

/* ---------- 字卡（全站共用 shared/wordcard.js） ---------- */
function openCard(w) {
  markSeen(w);
  const r = state.words[w];
  EWCard.open({ word: w, newContext: !!(r?.ctx?.story && r?.ctx?.lab) });
}
app.addEventListener("click", e => { const b = e.target.closest("button.w"); if (b) openCard(b.dataset.w); });

/* ---------- 朗讀（全站共用 shared/speech.js） ---------- */
const plain = t => t.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1");
const clearSpeaking = () => document.querySelectorAll(".block.speaking").forEach(el => el.classList.remove("speaking"));
document.addEventListener("ew:speech-stop", clearSpeaking);
function readBlocks(ep, idxs) {
  EWSpeech.speak(idxs.map(i => plain(ep.blocks[i].en)), {
    onStart: k => { clearSpeaking(); document.querySelector(`.block[data-b="${idxs[k]}"]`)?.classList.add("speaking"); },
    onDone: clearSpeaking,
    onUnavailable: () => alert("Speech playback is unavailable in this browser.／此瀏覽器不支援朗讀。"),
  });
}

/* ---------- 頁面 ---------- */
async function epExists(week, n) { return !!(await getJSON(`weeks/${week}/d${n}.json`)); }

async function viewWeek(id) {
  const wk = await loadWeek(id);
  if (!wk) return notFound();
  const days = wk.big_story ? [...wk.days, { day: 7, level: wk.big_story.level, plot: wk.big_story.plot, big: true }] : wk.days;
  const weeks = (await getJSON("index.json"))?.weeks || [];
  const ready = await Promise.all(days.map(d => epExists(id, d.day)));
  const eps = await Promise.all(days.map((d, i) => (ready[i] ? getJSON(`weeks/${id}/d${d.day}.json`) : null)));
  const next = days.find((d, i) => ready[i] && !state.done[`${id}-d${d.day}`]);
  app.innerHTML = `
    ${weeks.length > 1 ? `<nav class="weeks">${weeks.map((x, i) => `<a href="#/${x.id}" class="${x.id === id ? "on" : ""}">Week ${i + 1}</a>`).join("")}</nav>` : ""}
    <h1>${esc(wk.title.en)}</h1><p class="zh-title">${esc(wk.title.zh)}</p>
    ${next ? `<a class="btn" href="#/${id}/d${next.day}">${Object.keys(state.done).length ? bi(`Continue · Day ${next.day}`, "繼續故事") : bi(`Start · Day ${next.day}`, "開始故事")}</a>`
           : `<p class="muted">${bi("You’ve finished every story so far.", "已讀完目前所有篇章。")}</p>`}
    <ul class="days">${days.map((d, i) => `
      <li><a href="#/${id}/d${d.day}" class="${ready[i] ? "" : "soon"}">
        <span class="d">Day ${d.day}</span>
        <span class="t">${eps[i] ? esc(eps[i].title.en) : d.big ? bi("Big story", "本週大故事") : bi("Coming soon", "準備中")}</span>
        <span class="lv">${esc(d.level)}</span>
        ${state.done[`${id}-d${d.day}`] ? `<span class="done">✓</span>` : ""}
      </a></li>`).join("")}
    </ul>
    ${(wk.lab || []).filter(a => !a.day).map(a => `<a class="lab-pair" href="../lab/#article=${encodeURIComponent(a.id)}">
      <span class="lab-tag">This week in Reading Lab · 本週配對文章</span>
      <strong>${esc(a.title.en)}</strong><span class="sub">${esc(a.title.zh)}</span>
      ${a.note ? `<span class="muted" style="font-size:14px">${esc(a.note.en)}<span class="sub">${esc(a.note.zh)}</span></span>` : ""}</a>`).join("")}
    <p class="foot"><a href="#/records">My learning record · 我的學習紀錄</a>　<a href="../">← Home</a></p>`;
}

async function viewEpisode(week, n) {
  const wk = (await loadWeek(week)) || {};
  const ep = await getJSON(`weeks/${week}/d${n}.json`);
  if (!ep) return notFound();
  const core = ep.words;
  const blocks = ep.blocks.map((b, i) => b.choice ? choiceHTML(ep, b.choice) : `
    <div class="block" data-b="${i}"><p>${markup(b.en, core)}<button type="button" class="zh-toggle" data-zh="${i}" aria-expanded="false" aria-label="Show Chinese translation">中</button><button type="button" class="zh-toggle" data-play="${i}" aria-label="Play paragraph ${i + 1}">▶</button></p>
    <p class="zh" id="zh-${i}" hidden>${esc(b.zh)}</p></div>`).join("");
  const hasNext = await epExists(week, n + 1);
  app.innerHTML = `
    <p class="muted" style="margin:0"><a href="#/${week}" class="muted">← This week</a>　Day ${n}${ep.big ? " · Big story" : ""}　<span class="lv">${esc(ep.level)}</span></p>
    ${ep.big ? `<p class="muted" style="font-size:15px">${bi(`All ${ep.review.length} residents of this week are back. Tap a dotted word to review it.`, `本週 ${ep.review.length} 位居民全部回來了，點虛線的字可以複習。`)}</p>` : ""}
    <h1>${esc(ep.title.en)}</h1><p class="zh-title">${esc(ep.title.zh)}</p>
    <div class="readctl"><button type="button" class="btn ghost" id="play-all">▶ Play all</button><button type="button" class="btn ghost" id="stop-all">■ Stop</button></div>
    ${blocks}
    <div class="insight"><p>${esc(ep.insight.en)}</p><p class="zh" style="border:0;padding:0">${esc(ep.insight.zh)}</p>
      <p class="by">— ${esc(ep.insight.by)}</p></div>
    <blockquote class="quote"><p>${esc(ep.quote.en)}</p><p class="zh" style="border:0;padding:0">${esc(ep.quote.zh)}</p>
      <p class="src">— ${esc(ep.quote.author)}, <a href="${esc(ep.quote.url)}" target="_blank" rel="noopener">${esc(ep.quote.source)}</a></p></blockquote>
    ${(wk.lab || []).filter(a => a.day === n).map(a => `<a class="lab-pair" href="../lab/#article=${encodeURIComponent(a.id)}">
      <span class="lab-tag">Today in Reading Lab · 今天的配對文章</span>
      <strong>${esc(a.title.en)}</strong><span class="sub">${esc(a.title.zh)}</span></a>`).join("")}
    <div class="finish">
      <button type="button" class="btn${state.done[ep.id] ? " ghost" : ""}" id="finish">${state.done[ep.id] ? "Finished ✓" : bi("I’ve finished", "讀完了")}</button>
      ${hasNext ? `<a class="btn ghost" href="#/${week}/d${n + 1}">Next story →</a>` : ""}
    </div>
    <p id="finish-fb" class="fb" aria-live="polite"></p>
    ${ep.quiz?.length ? practiceHTML(ep) : ""}`;
  bindEpisode(ep);
}

function choiceHTML(ep, c) {
  const picked = state.choices[ep.id];
  const opt = c.options.find(o => o.id === picked);
  return `<section class="choice" aria-label="Choice">
    <p><strong>${esc(c.prompt.en)}</strong><br><span class="muted">${esc(c.prompt.zh)}</span></p>
    <div class="opts">${c.options.map(o => `<button type="button" class="btn${o.id === picked ? "" : " ghost"}" data-opt="${o.id}">${esc(o.label.en)}</button>`).join("")}</div>
    <div class="result" aria-live="polite">${opt ? resultHTML(ep, c, opt) : ""}</div></section>`;
}
const resultHTML = (ep, c, o) => `<p>${markup(o.en, ep.words)}</p><p class="zh">${esc(o.zh)}</p>
  <p style="margin-top:8px">${esc(c.after.en)}</p><p class="zh">${esc(c.after.zh)}</p>`;

function practiceHTML(ep) {
  return `<details class="practice"><summary>${bi(`Practice (optional): ${ep.quiz.length} recall questions`, `練習（選做）：${ep.quiz.length} 題回想`)}</summary>
    <p class="muted" style="font-size:15px">${bi("Without looking back at the story, which word fits the blank? Hints and answers are recorded honestly.", "遮住故事，想想看空格是哪個字。用了提示或看答案，紀錄會照實標示。")}</p>
    ${ep.quiz.map((q, i) => `<div class="q" data-q="${i}">
      <p style="margin:0">${i + 1}. ${esc(q.q)}</p>
      <div class="row"><input aria-label="Answer to question ${i + 1}" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button type="button" class="btn" data-act="check">Check</button>
        <button type="button" class="btn ghost" data-act="hint">Hint</button>
        <button type="button" class="btn ghost" data-act="show">Show answer</button></div>
      <p class="fb" aria-live="polite"></p></div>`).join("")}</details>`;
}

function bindEpisode(ep) {
  const choice = ep.blocks.find(b => b.choice)?.choice;
  const used = {}; // 題號 -> {hint, shown}
  app.onclick = e => {
    const pl = e.target.closest("[data-play]");
    if (pl) readBlocks(ep, [+pl.dataset.play]);
    if (e.target.id === "play-all") readBlocks(ep, ep.blocks.map((b, i) => (b.en ? i : -1)).filter(i => i >= 0));
    if (e.target.id === "stop-all") EWSpeech.stop();
    const z = e.target.closest("[data-zh]");
    if (z) { const p = document.getElementById(`zh-${z.dataset.zh}`); p.hidden = !p.hidden; z.setAttribute("aria-expanded", String(!p.hidden)); }
    const o = e.target.closest("[data-opt]");
    if (o && choice) {
      state.choices[ep.id] = o.dataset.opt; save();
      const sec = o.closest(".choice");
      sec.querySelectorAll("[data-opt]").forEach(b => b.classList.toggle("ghost", b !== o));
      sec.querySelector(".result").innerHTML = resultHTML(ep, choice, choice.options.find(x => x.id === o.dataset.opt)) +
        `<p class="muted" style="font-size:14px">${bi("Try the other option to see a different clue.", "也可以點另一個選項，看看另一條線索。")}</p>`;
    }
    if (e.target.id === "finish" && !state.done[ep.id]) {
      state.done[ep.id] = today(); ep.words.forEach(seenHere); save();
      e.target.textContent = "Finished ✓"; e.target.classList.add("ghost");
      document.getElementById("finish-fb").innerHTML = ep.words.length
        ? bi(`${ep.words.length} new residents added to “Met”. Want to check if you remember them? Open Practice below.`, `本篇 ${ep.words.length} 個新居民已加入「遇見」。想確認記不記得，可以點開下面的練習。`)
        : bi("You’ve finished this week! Open Practice below to check what you remember.", "本週讀完了！想確認記不記得，可以點開下面的練習。");
    }
    const act = e.target.closest("[data-act]");
    if (act) quiz(ep, act, used);
  };
  app.onkeydown = e => { if (e.key === "Enter" && e.target.matches(".q input")) e.target.closest(".q").querySelector('[data-act="check"]').click(); };
}

function quiz(ep, btn, used) {
  const box = btn.closest(".q"); const i = +box.dataset.q; const q = ep.quiz[i];
  const fb = box.querySelector(".fb"); const input = box.querySelector("input");
  const u = (used[i] ||= { hint: false, shown: false });
  const x = lexicon[q.word] || {};
  const say = (cls, html) => { fb.className = `fb ${cls}`; fb.innerHTML = html; };
  if (btn.dataset.act === "hint") {
    u.hint = true;
    return say("", bi(`Hint: it starts with <strong>${esc(q.answers[0][0])}</strong> and has ${esc(q.answers[0].length)} letters.`, `提示：開頭是 ${esc(q.answers[0][0])}，${esc(q.answers[0].length)} 個字母` + (x.zh ? `；意思是「${esc(x.zh)}」。` : "。")));
  }
  if (btn.dataset.act === "show") {
    u.shown = true;
    return say("", `Answer: <strong>${esc(q.answers.join(" / "))}</strong><span class="sub">${esc(q.explain)}</span>` + bi("<span class=\"muted\">Since you saw the answer, this doesn’t count as recall. Try again another day.</span>", "看過答案，這題不算自己想起；之後再試一次吧。"));
  }
  const a = norm(input.value);
  if (!a) return say("no", bi("Type the word you think of first.", "先寫下你想到的字。"));
  if (q.answers.map(norm).includes(a)) {
    const r = seenHere(q.word);
    let status;
    if (u.shown) status = bi("completed after seeing the answer (not counted)", "看過答案後完成（不算想起）");
    else if (u.hint) { addDate(r.hinted, today()); status = bi("recalled with a hint", "有提示想起"); }
    else { addDate(r.recalled, today()); status = r.recalled.length >= 2 ? bi("recalled again on a new day 🎉", "隔天仍想起") : bi("recalled on your own for the first time", "第一次自己想起"); }
    save();
    return say("ok", `✓ Correct!<span class="sub">${esc(q.explain)}</span><strong>${esc(q.word)}: </strong>${status}`);
  }
  if (a === q.word && !q.answers.includes(q.word)) return say("no", bi("Right word! But this sentence needs a different form (tense or part of speech). Try again.", "字想對了！但這句要換字形（時態或詞性），再試一次。"));
  say("no", bi("Not quite. Try again, or tap Hint.", "還不是這個字。可以再試，或點「提示」。"));
}

async function viewRecords() {
  await loadWeek("w01");
  const rows = Object.entries(state.words).sort();
  app.innerHTML = `<h1>My Learning Record</h1><p class="zh-title">我的學習紀錄</p>
    <p class="muted" style="font-size:15px">${bi("Meeting a word is not the same as knowing it. “Recalled” only counts answers without hints or answers shown; “next-day recall” needs recall on two different days. Records stay in this browser only.", "遇見 ≠ 學會。「自己想起」只計沒用提示、沒看答案的作答；「隔天仍想起」要在不同日期各想起一次。紀錄只存在這個瀏覽器。")}</p>
    ${rows.length ? `<table class="records"><tr><th>Word</th><th>Met</th><th>With hint</th><th>Recalled</th></tr>
      ${rows.map(([w, r]) => `<tr><td><button type="button" class="w" data-w="${esc(w)}">${esc(w)}</button></td><td>${r.seen || "—"}</td>
        <td>${r.hinted.length ? r.hinted.join("、") : "—"}</td><td>${r.recalled.length ? r.recalled.join("、") : "—"}</td></tr>`).join("")}</table>`
      : `<p>${bi("No records yet.", "還沒有紀錄。")} <a href="#/w01">Read the first story →</a></p>`}
    <p class="foot"><a href="#/w01">← This week</a></p>`;
}

const notFound = () => { app.innerHTML = `<p>${bi("Story not found.", "找不到這一篇。")} <a href="#/w01">← This week</a></p>`; };

// 沒指定週次時，打開第一個還沒讀完的週（新同學從 Week 1 開始）
async function firstUnfinishedWeek() {
  const ws = (await getJSON("index.json"))?.weeks || [{ id: "w01" }];
  for (const w of ws) {
    const wk = await getJSON(`weeks/${w.id}/week.json`);
    const total = (wk?.days?.length || 0) + (wk?.big_story ? 1 : 0);
    const done = Object.keys(state.done).filter(k => k.startsWith(w.id + "-")).length;
    if (done < total) return w.id;
  }
  return ws.at(-1).id;
}

async function route() {
  EWCard.close(); EWSpeech.stop();
  app.onclick = app.onkeydown = null;
  reload(); renderTally();
  const [week, ep] = location.hash.replace(/^#\/?/, "").split("/");
  if (week === "records") await viewRecords();
  else if (week && ep) await viewEpisode(week, parseInt(ep.replace("d", ""), 10));
  else await viewWeek(week || await firstUnfinishedWeek());
  app.focus(); window.scrollTo(0, 0);
}

/* ---------- 字體（和 Reading Lab 共用設定） ---------- */
const setFont = px => { px = Math.max(16, Math.min(30, px)); document.documentElement.style.setProperty("--fs", px + "px"); EWProgress.setFont(px); };
document.getElementById("font-minus").onclick = () => setFont(EWProgress.getFont(18) - 2);
document.getElementById("font-plus").onclick = () => setFont(EWProgress.getFont(18) + 2);
setFont(EWProgress.getFont(18));

(async () => {
  chars = (await getJSON("characters.json")) || chars;
  renderTally();
  window.addEventListener("hashchange", route);
  route();
})();
