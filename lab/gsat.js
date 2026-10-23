// 學測模擬（GSAT mock reading）：每篇文章的「學測模擬」分頁。
// 資料在文章 JSON 的 gsat 欄位：paras[[en,zh]]、questions（4 題單選）、mixed（填空／多選／簡答）、minutes。
// 配分照大考中心：單選每題 2 分；填空每格 2 分（字形或拼字錯 1 分）；多選 4 分，答錯 k 個選項得 (n−2k)/n；簡答 2 分。
// 成績存在本機（erl-v1-gsat），在「我的學習」顯示。
(function () {
  const KEY = "erl-v1-gsat";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const sessions = {};           // 本次瀏覽的作答狀態，切換分頁再回來不會遺失
  let timerId = null;
  const LETTERS = "ABCDEF";
  const TYPE_ZH = { MI: "主旨／目的", TF: "細節－正確敘述", SD: "細節－特定資訊", NOT: "細節－未提及", WD: "字詞推敲", REF: "指涉", INF: "推論", ORG: "篇章結構／作者手法", SEQ: "順序", VIS: "圖像對應", INS: "句子插入", FO: "事實或意見", SYN: "同義指稱" };

  const style = document.createElement("style");
  style.textContent = `
  .gs-timer{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin:0 0 16px}
  .gs-clock{font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.04em}
  .gs-clock.over{color:#bb5047}
  .gs-passage p{font-family:Georgia,'Noto Serif',serif;font-size:var(--article-size,18px);line-height:1.9;margin:0 0 16px;text-indent:2em}
  .gs-passage p.zh{font-family:inherit;font-size:14px;line-height:1.8;text-indent:0;color:var(--muted);background:var(--soft);border-radius:8px;padding:8px 12px;margin-top:-8px}
  .gs-passage mark{background:#fff0d1;border-radius:3px;padding:0 2px}
  .dark .gs-passage mark{background:#644c28;color:inherit}
  .gs-q{border:0;padding:14px 0;margin:0;border-top:1px solid var(--line)}
  .gs-q legend{font-weight:700;padding:0;margin-bottom:6px;line-height:1.6}
  .gs-blank{display:inline-block;width:9.5em;max-width:60%;padding:3px 8px!important;margin:2px 3px;border-radius:7px!important;font-size:16px;vertical-align:baseline}
  .gs-fill{line-height:2.1}
  .gs-res{margin:6px 0 2px;padding:10px 12px;border-radius:10px;background:var(--soft);font-size:14px;line-height:1.7}
  .gs-res .ok{color:#16715a;font-weight:700}.gs-res .no{color:#bb5047;font-weight:700}
  .gs-traps{margin:6px 0 0;padding-left:1.2em;font-size:13px;color:var(--muted)}
  .gs-traps strong,.gs-res strong{font-size:inherit}
  .gs-score{font-size:30px;font-weight:800}
  .gs-tag{font-size:11px;color:var(--accent);border:1px solid var(--line);border-radius:20px;padding:1px 8px;margin-left:6px;font-weight:400;white-space:nowrap}
  @media(max-width:760px){.gs-passage p{text-indent:1.2em}.gs-blank{width:7.5em}}`;
  document.head.appendChild(style);

  const norm = s => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[“”".,!?;:()]/g, "").replace(/\s+/g, " ").trim();
  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  const fmt = s => { const a = Math.abs(s); return (s < 0 ? "+" : "") + String(Math.floor(a / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0"); };

  // 配分
  function scoreAll(g, ans) {
    const parts = [];
    g.questions.forEach((q, i) => { const c = ans["q" + i]; parts.push({ pts: c === q.a ? 2 : 0, max: 2 }); });
    let mixedPts = 0, mixedMax = 0;
    (g.mixed || []).forEach((it, k) => {
      if (it.kind === "fill") it.blanks.forEach((b, j) => {
        const v = norm(ans[`m${k}_${j}`]);
        const full = b.answer.some(a => norm(a) === v);
        const half = !full && v && (b.partial || []).concat(b.answer).some(a => norm(a) === v || lev(norm(a), v) <= 1);
        const p = full ? 2 : half ? 1 : 0; mixedPts += p; mixedMax += 2; parts.push({ pts: p, max: 2 });
      });
      if (it.kind === "multi") {
        const pick = ans["m" + k] || [], n = it.options.length;
        const wrong = it.options.reduce((w, _, j) => w + ((pick.includes(j) !== it.a.includes(j)) ? 1 : 0), 0);
        const p = pick.length ? Math.max(0, Math.round(4 * (n - 2 * wrong) / n * 100) / 100) : 0;
        mixedPts += p; mixedMax += 4; parts.push({ pts: p, max: 4 });
      }
      if (it.kind === "short") {
        const p = it.answer.some(a => norm(a) === norm(ans["m" + k])) ? 2 : 0; mixedPts += p; mixedMax += 2; parts.push({ pts: p, max: 2 });
      }
    });
    const total = parts.reduce((s, p) => s + p.pts, 0), max = parts.reduce((s, p) => s + p.max, 0);
    const mc = g.questions.reduce((s, q, i) => s + (ans["q" + i] === q.a ? 1 : 0), 0);
    return { total: Math.round(total * 100) / 100, max, mc, mixedPts: Math.round(mixedPts * 100) / 100, mixedMax };
  }

  function passageHTML(g, s) {
    const marks = s.submitted ? g.questions.map(q => q.evidence).filter(Boolean) : [];
    return g.paras.map(([en, zh]) => {
      let h = esc(en);
      marks.forEach(m => { const e = esc(m); if (h.includes(e)) h = h.replace(e, `<mark>${e}</mark>`); });
      return `<p>${h}</p>` + (s.submitted && s.showZh ? `<p class="zh">${esc(zh)}</p>` : "");
    }).join("");
  }

  function render(el, x) {
    const g = x.gsat; if (!g) { el.innerHTML = "<p class='muted'>這篇還沒有學測模擬。</p>"; return; }
    const s = sessions[x.id] || (sessions[x.id] = { started: false, submitted: false, ans: {}, showZh: false });
    const mcCount = g.questions.length, n0 = mcCount + 1;
    if (timerId) { clearInterval(timerId); timerId = null; }

    if (!s.started) {
      const rec = load()[x.id];
      el.innerHTML = `<h2>學測模擬<span class="gs-tag">GSAT mock</span></h2>
        <p>把本篇主題改寫成<strong>學測閱讀測驗的文體</strong>：用學測常見句構（倒裝、分裂句、分詞構句、同位語、插入語），詞彙級別對齊 108–115 學測，長度約 400 字（比 115 年平均 363 字再長一點，練耐力）。題目照學測題型出，每個錯誤選項都是陷阱，交卷後會告訴你用的是哪一招。</p>
        <div class="notice small" style="margin:12px 0">
          <p style="margin:0 0 6px"><strong>題型與配分</strong>（比照大考中心）</p>
          <p style="margin:0">・單選 ${mcCount} 題，每題 2 分<br>・混合題：填空每格 2 分（字形或拼字錯得 1 分）；多選 4 分，答錯一個選項扣 (2/n)×4；簡答 2 分<br>・建議時間 <strong>${g.minutes || 9} 分鐘</strong>，時間到不會強制交卷</p>
        </div>
        ${rec ? `<p class="muted small">上次成績：${rec.last.total} / ${rec.last.max}（${new Date(rec.last.at).toLocaleDateString()}）· 最佳 ${rec.best} · 共做 ${rec.attempts} 次</p>` : ""}
        <button class="primary" id="gsStart">開始作答 · Start</button>`;
      el.querySelector("#gsStart").onclick = () => { s.started = true; s.startAt = Date.now(); render(el, x); };
      return;
    }

    let mixedHTML = "", blankNo = n0, mixedNos = [];
    (g.mixed || []).forEach((it, k) => {
      if (it.kind === "fill") {
        let j = 0;
        const nos = [];
        const body = esc(it.prompt).replace(/\[(\d+)\]/g, () => {
          const no = blankNo++, key = `m${k}_${j++}`; nos.push(no);
          return `(${no}) <input type="text" class="gs-blank" data-key="${key}" aria-label="第 ${no} 格" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.ans[key] || "")}" ${s.submitted ? "disabled" : ""}>`;
        });
        mixedNos.push(nos);
        mixedHTML += `<fieldset class="gs-q"><legend>第 ${nos.join("、")} 題<span class="gs-tag">填充</span></legend>
          <p class="small muted" style="margin:0 0 6px">下列簡短敘述摘記上方文章重點。請從文章中找出最適當的單詞（word）填入空格，並視句型結構需要做適當的字形變化。每格限填一個單詞。</p>
          <p class="gs-fill">${body}</p>${s.submitted ? resultFill(it, k, s, nos) : ""}</fieldset>`;
      } else if (it.kind === "multi") {
        const no = blankNo++; mixedNos.push([no]); const pick = s.ans["m" + k] || [];
        mixedHTML += `<fieldset class="gs-q"><legend>${no}. ${esc(it.q)}<span class="gs-tag">多選</span></legend>
          ${it.options.map((o, j) => `<label class="option"><input type="checkbox" data-multi="${k}" value="${j}" ${pick.includes(j) ? "checked" : ""} ${s.submitted ? "disabled" : ""}>(${LETTERS[j]}) ${esc(o)}</label>`).join("")}
          ${s.submitted ? resultMulti(it, k, s) : ""}</fieldset>`;
      } else if (it.kind === "short") {
        const no = blankNo++; mixedNos.push([no]);
        mixedHTML += `<fieldset class="gs-q"><legend>${no}. ${esc(it.q)}<span class="gs-tag">簡答</span></legend>
          <input type="text" data-key="m${k}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.ans["m" + k] || "")}" ${s.submitted ? "disabled" : ""} placeholder="請從文章中找出答案">
          ${s.submitted ? resultShort(it, k, s) : ""}</fieldset>`;
      }
    });

    const mcHTML = g.questions.map((q, i) => `<fieldset class="gs-q"><legend>${i + 1}. ${esc(q.q)}${s.submitted ? `<span class="gs-tag">${TYPE_ZH[q.type] || q.type}</span>` : ""}</legend>
      ${q.options.map((o, j) => `<label class="option"><input type="radio" name="gs${i}" value="${j}" ${s.ans["q" + i] === j ? "checked" : ""} ${s.submitted ? "disabled" : ""}>(${LETTERS[j]}) ${esc(o)}</label>`).join("")}
      ${s.submitted ? resultMC(q, i, s) : ""}</fieldset>`).join("");

    const res = s.submitted ? s.result : null;
    el.innerHTML = `
      <div class="gs-timer" role="timer"><span class="small muted">${s.submitted ? "作答時間" : "剩餘時間"}</span><span class="gs-clock" id="gsClock"></span>
        ${s.submitted ? `<button class="softbtn small" id="gsZh">${s.showZh ? "隱藏" : "顯示"}中文翻譯</button>` : `<button class="primary" id="gsSubmit">交卷 · Submit</button>`}</div>
      ${res ? `<div class="panel" style="margin:0 0 16px"><div class="gs-score">${res.total} / ${res.max}</div>
        <p class="small muted" style="margin:4px 0 0">單選 ${res.mc} / ${mcCount} 題答對（${res.mc * 2} 分）· 混合題 ${res.mixedPts} / ${res.mixedMax} 分 · 用時 ${fmt(res.secs)}</p>
        <p class="small" style="margin:8px 0 0">文章裡<mark>標黃</mark>的是單選題的答題依據。每題下方有解析，以及錯誤選項是用哪一招設下的陷阱。</p></div>` : ""}
      <p class="small muted">第 1 至 ${mcCount} 題為單選題；第 ${n0} 至 ${blankNo - 1} 題為混合題</p>
      <div class="gs-passage">${passageHTML(g, s)}</div>
      ${mcHTML}${mixedHTML}
      ${s.submitted ? `<p style="margin-top:18px"><button class="primary" id="gsAgain">再做一次 · Try again</button></p>` : `<p style="margin-top:18px"><button class="primary" id="gsSubmit2">交卷 · Submit</button></p>`}`;

    // 作答狀態同步到 session
    el.querySelectorAll('input[type=radio][name^="gs"]').forEach(r => r.onchange = () => { s.ans["q" + r.name.slice(2)] = Number(r.value); });
    el.querySelectorAll("input[data-key]").forEach(t => t.oninput = () => { s.ans[t.dataset.key] = t.value; });
    el.querySelectorAll("input[data-multi]").forEach(c => c.onchange = () => {
      const k = c.dataset.multi, v = Number(c.value), cur = new Set(s.ans["m" + k] || []);
      c.checked ? cur.add(v) : cur.delete(v); s.ans["m" + k] = [...cur].sort();
    });

    const submit = () => {
      const blank = g.questions.filter((_, i) => s.ans["q" + i] === undefined).length;
      if (blank && !confirm(`還有 ${blank} 題單選沒作答，確定交卷？`)) return;
      s.submitted = true; s.secs = Math.round((Date.now() - s.startAt) / 1000);
      const r = scoreAll(g, s.ans); r.secs = s.secs; s.result = r;
      const all = load(), prev = all[x.id];
      all[x.id] = { title: x.title, last: { total: r.total, max: r.max, mc: r.mc, secs: r.secs, at: Date.now() }, best: Math.max(r.total, prev ? prev.best : 0), attempts: (prev ? prev.attempts : 0) + 1 };
      save(all);
      render(el, x); el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    el.querySelector("#gsSubmit")?.addEventListener("click", submit);
    el.querySelector("#gsSubmit2")?.addEventListener("click", submit);
    el.querySelector("#gsAgain")?.addEventListener("click", () => { sessions[x.id] = { started: true, submitted: false, ans: {}, showZh: false, startAt: Date.now() }; render(el, x); el.scrollIntoView({ block: "start" }); });
    el.querySelector("#gsZh")?.addEventListener("click", () => { s.showZh = !s.showZh; render(el, x); });

    // 計時：倒數，超時變紅色繼續計
    const clock = el.querySelector("#gsClock"), limit = (g.minutes || 9) * 60;
    const tick = () => {
      if (!document.body.contains(clock)) { clearInterval(timerId); timerId = null; return; }
      if (s.submitted) { clock.textContent = fmt(s.secs); return; }
      const left = limit - Math.round((Date.now() - s.startAt) / 1000);
      clock.textContent = left >= 0 ? fmt(left) : "超時 " + fmt(-left).replace("+", "");
      clock.classList.toggle("over", left < 0);
    };
    tick(); if (!s.submitted) timerId = setInterval(tick, 1000);
  }

  // 「招式：說明」→ 招式加粗
  const trapLabel = t => { const i = t.indexOf("："); return i > 0 && i < 16 ? `<strong>${esc(t.slice(0, i))}</strong>：${esc(t.slice(i + 1))}` : esc(t); };
  function traps(q, chosen) {
    const list = q.options.map((o, j) => j !== q.a && q.traps && q.traps[j] ? `<li>(${LETTERS[j]}) ${trapLabel(q.traps[j])}</li>` : "").join("");
    return list ? `<ul class="gs-traps">${list}</ul>` : "";
  }
  function resultMC(q, i, s) {
    const c = s.ans["q" + i], ok = c === q.a;
    return `<div class="gs-res"><span class="${ok ? "ok" : "no"}">${ok ? "✓ 答對" : "✗ 答錯"}</span>　正解 (${LETTERS[q.a]})${c !== undefined && !ok ? `，你選 (${LETTERS[c]})` : c === undefined ? "，未作答" : ""}<br>${esc(q.why)}${traps(q, c)}</div>`;
  }
  function resultFill(it, k, s, nos) {
    return `<div class="gs-res">${it.blanks.map((b, j) => {
      const v = s.ans[`m${k}_${j}`] || "", nv = norm(v), full = b.answer.some(a => norm(a) === nv);
      const half = !full && nv && (b.partial || []).concat(b.answer).some(a => norm(a) === nv || lev(norm(a), nv) <= 1);
      return `(${nos[j]}) <span class="${full ? "ok" : "no"}">${full ? "✓ 2 分" : half ? "△ 1 分（字形或拼字）" : "✗ 0 分"}</span>　答案：<strong>${esc(b.answer[0])}</strong>${v && !full ? `，你寫 ${esc(v)}` : ""}`;
    }).join("<br>")}<br>${esc(it.why)}</div>`;
  }
  function resultMulti(it, k, s) {
    const pick = s.ans["m" + k] || [], n = it.options.length;
    const wrong = it.options.reduce((w, _, j) => w + ((pick.includes(j) !== it.a.includes(j)) ? 1 : 0), 0);
    const p = pick.length ? Math.max(0, Math.round(4 * (n - 2 * wrong) / n * 100) / 100) : 0;
    return `<div class="gs-res"><span class="${wrong ? "no" : "ok"}">${p} / 4 分</span>　正解 ${it.a.map(j => LETTERS[j]).join("")}${pick.length ? `，你選 ${pick.map(j => LETTERS[j]).join("")}` : "，未作答"}（錯 ${wrong} 個選項）<br>${esc(it.why)}</div>`;
  }
  function resultShort(it, k, s) {
    const ok = it.answer.some(a => norm(a) === norm(s.ans["m" + k]));
    return `<div class="gs-res"><span class="${ok ? "ok" : "no"}">${ok ? "✓ 2 分" : "✗ 0 分"}</span>　答案：<strong>${esc(it.answer[0])}</strong><br>${esc(it.why)}</div>`;
  }

  function summaryHTML() {
    const all = load(), rows = Object.entries(all).sort((a, b) => b[1].last.at - a[1].last.at);
    if (!rows.length) return "<p class='muted'>還沒做過學測模擬。打開有「學測模擬」分頁的文章試試看。</p>";
    return rows.map(([id, r]) => `<div class="item"><strong>${esc(r.title || id)}</strong>
      <p class="small muted" style="margin:4px 0 0">最近：${r.last.total} / ${r.last.max}（單選 ${r.last.mc} 題對 · 用時 ${fmt(r.last.secs)}）· 最佳 ${r.best} · 共 ${r.attempts} 次 · ${new Date(r.last.at).toLocaleDateString()}</p></div>`).join("");
  }

  // 給「閱讀測驗」分頁共用：單題檢討（題型、正解、依據、陷阱）
  function mcReview(q, c) {
    const ok = c === q.a;
    return `<div class="gs-res"><span class="${ok ? "ok" : "no"}">${ok ? "✓ 答對" : "✗ 答錯"}</span>　正解 (${LETTERS[q.a]}) ${esc(q.options[q.a])}${c !== undefined && c !== null && !ok ? `；你選 (${LETTERS[c]})` : c === undefined || c === null ? "；未作答" : ""}${q.type ? `<span class="gs-tag">${TYPE_ZH[q.type] || q.type}</span>` : ""}<br>${esc(q.why || "")}${q.evidence ? `<br><span class="small muted">依據：<mark>${esc(q.evidence)}</mark></span>` : ""}${traps(q, c)}</div>`;
  }

  window.LabGSAT = { render, summaryHTML, mcReview, LETTERS };
})();
