// 全站共用字卡：底部彈出，不擋閱讀（可關閉、Esc 關閉）。
// 資料來源：shared/lexicon.json（CEEC 字表：詞性、級別、中文、KK）＋ story/content/characters.json（英語世界居民設定）。
// 呼叫端可再加自己的欄位（例如 Lab 的例句、字族）和按鈕（例如收藏）。
(function () {
  const base = (document.currentScript && new URL(".", document.currentScript.src).href) || "../shared/";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let lexicon = null, chars = null;
  const loadLexicon = () => lexicon || (lexicon = fetch(base + "lexicon.json").then(r => r.ok ? r.json() : {}).catch(() => ({})));
  const loadChars = () => chars || (chars = fetch(base + "../story/content/characters.json").then(r => r.ok ? r.json() : {}).catch(() => ({})));

  // 樣式只注入一次；顏色用各頁自己的 CSS 變數，沒有就用預設值
  const style = document.createElement("style");
  style.textContent = `
  .ew-card{position:fixed;left:0;right:0;bottom:0;z-index:60;max-width:680px;margin:0 auto;background:var(--paper,#fffdf9);color:var(--ink,#2a2622);
    border:1px solid var(--line,#e7dfd3);border-bottom:0;border-radius:18px 18px 0 0;padding:22px 26px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.14);
    max-height:46vh;overflow:auto;-webkit-overflow-scrolling:touch;font:16px/1.6 -apple-system,"PingFang TC","Noto Sans TC",system-ui,sans-serif}
  .ew-card[hidden]{display:none}
  .ew-card::before{content:"";position:absolute;left:50%;top:8px;width:40px;height:4px;margin-left:-20px;border-radius:4px;background:var(--line,#e7dfd3)}
  .ew-card .ew-x{position:absolute;right:12px;top:10px;font-size:28px;line-height:1;padding:4px 8px;background:none;border:0;color:var(--muted,#7a726a);cursor:pointer}
  .ew-card h3{margin:0;font-size:1.4rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .ew-card .ew-meta{color:var(--muted,#7a726a);font-size:14px}
  .ew-card .ew-badge{display:inline-block;font-size:12px;color:#fff;border-radius:99px;padding:1px 9px;margin:6px 4px 0 0}
  .ew-card dl{margin:8px 0 0;font-size:15px}.ew-card dt{color:var(--muted,#7a726a);font-size:13px;margin-top:8px}.ew-card dd{margin:0}
  .ew-card .ew-sub{display:block;font-size:.85em;opacity:.75}
  .ew-card .ew-btn{font:inherit;font-size:14px;border:1px solid var(--line,#e7dfd3);background:var(--bg,#faf7f1);color:var(--ink,#2a2622);border-radius:8px;padding:2px 10px;cursor:pointer}
  .ew-card .ew-actions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
  @media(min-width:900px){.ew-card{max-height:40vh;padding-left:32px;padding-right:32px}}
  body.dark .ew-card{--paper:#1f2937;--ink:#f3f4f6;--line:#374151;--muted:#9ca3af;--bg:#111827}`;
  document.head.appendChild(style);

  const el = document.createElement("aside");
  el.className = "ew-card"; el.hidden = true; el.setAttribute("aria-live", "polite");
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el));
  if (document.body) document.body.appendChild(el);
  // 記住最後點的字，字卡打開後把它捲到字卡上方，不讓字卡蓋住正在讀的那一行
  let lastTap = null;
  document.addEventListener("click", e => { if (!el.contains(e.target)) lastTap = e.target; }, true);
  const close = () => { el.hidden = true; document.body.style.paddingBottom = ""; };
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  window.EWCard = {
    close,
    // opts: { word, extraRows:[{dt,dd(html)}], actions:[{label, onClick}], newContext:bool }
    async open(opts) {
      const w = opts.word.toLowerCase();
      const [lx, ch] = await Promise.all([loadLexicon(), loadChars()]);
      const x = lx[w];                                   // [pos, level, zh, kk]
      const r = (ch.residents || {})[w] || {};
      const badges = [].concat(r.badge || []).map(k => (ch.badges || {})[k]).filter(Boolean);
      const zh = x?.[2] || r.zh, kk = x?.[3] || r.kk;
      const rows = [
        zh && { dt: "Meaning · 意思", dd: esc(zh) },
        r.look && { dt: "In English World · 在英語世界長這樣", dd: esc(r.look) },
        r.trait && { dt: "Personality = meaning · 個性＝字義", dd: esc(r.trait) },
        r.usage && { dt: "Real-world usage · 真實英文怎麼用", dd: esc(r.usage) },
        ...(opts.extraRows || []),
        opts.newContext && { dt: "New context · 換情境遇見", dd: `You’ve met this word in both Story Quest and Reading Lab. ✓<span class="ew-sub">你在故事和 Lab 文章裡都遇過這個字。</span>` },
      ].filter(Boolean);
      el.innerHTML = `<button type="button" class="ew-x" aria-label="Close">×</button>
        <h3>${esc(opts.label || opts.word)}${window.EWSpeech?.available() ? `<button type="button" class="ew-btn" data-ew-say>🔊 Listen</button>` : ""}</h3>
        <div class="ew-meta">${kk ? `/${esc(kk)}/　` : ""}${esc(x?.[0] || opts.pos || "")}${x?.[1] ? `　CEEC Level ${esc(x[1])}` : ""}</div>
        ${badges.map(b => `<span class="ew-badge" style="background:${b.color}">${esc(b.zh)}・${esc(b.label)}</span>`).join("")}
        <dl>${rows.map(r => `<dt>${r.dt}</dt><dd>${r.dd}</dd>`).join("")}</dl>
        ${(opts.actions || []).length ? `<div class="ew-actions">${opts.actions.map((a, i) => `<button type="button" class="ew-btn" data-ew-act="${i}">${a.label}</button>`).join("")}</div>` : ""}`;
      el.querySelector(".ew-x").onclick = close;
      el.querySelector("[data-ew-say]")?.addEventListener("click", () => window.EWSpeech.speak(opts.label || opts.word));
      el.querySelectorAll("[data-ew-act]").forEach(b => b.onclick = () => opts.actions[+b.dataset.ewAct].onClick());
      el.hidden = false;
      // 底部留出字卡高度，最後一段也能捲到字卡上方
      document.body.style.paddingBottom = el.offsetHeight + "px";
      const tapBox = lastTap && lastTap.isConnected ? lastTap.getBoundingClientRect() : null;
      const cardTop = window.innerHeight - el.offsetHeight;
      if (tapBox && tapBox.bottom > cardTop - 16) window.scrollBy({ top: tapBox.bottom - cardTop + 72, behavior: "smooth" });
    },
  };
})();
