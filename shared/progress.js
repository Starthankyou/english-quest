// 全站共用：單字學習紀錄＋字體設定。Story Quest 和 Reading Lab 都載入這支。
// 紀錄沿用故事端的 localStorage key（esq:v1），每個字多一個 ctx：在哪條路線遇見、哪天。
// 「換情境遇見」= 同一個字在 story 和 lab 都遇見過。
(function () {
  const KEY = "esq:v1";
  const FONT_KEY = "erl-font-size";   // 沿用 Reading Lab 原本的 key，兩邊字體一致
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const store = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; } };
  const rec = (s, w) => {
    const r = ((s.words ||= {})[w] ||= { seen: null, hinted: [], recalled: [] });
    r.ctx ||= {};
    return r;
  };

  window.EWProgress = {
    KEY, today,
    // 標記遇見；回傳 { transfer: true } 代表這次剛好構成「換情境遇見」
    markSeen(word, where) {
      const s = load(); const r = rec(s, word.toLowerCase());
      const before = !!(r.ctx.story && r.ctx.lab);
      r.seen ||= today();
      r.ctx[where] ||= today();
      store(s);
      return { transfer: !before && !!(r.ctx.story && r.ctx.lab), record: r };
    },
    get(word) { return (load().words || {})[word.toLowerCase()] || null; },
    stats() {
      const ws = Object.values(load().words || {});
      return {
        seen: ws.filter(r => r.seen).length,
        recalled: ws.filter(r => r.recalled?.length).length,
        crossDay: ws.filter(r => r.recalled?.length >= 2).length,
        transfer: ws.filter(r => r.ctx?.story && r.ctx?.lab).length,
      };
    },
    getFont(fallback) { try { return +localStorage.getItem(FONT_KEY) || fallback; } catch { return fallback; } },
    setFont(px) { try { localStorage.setItem(FONT_KEY, String(px)); } catch {} },
  };
})();
