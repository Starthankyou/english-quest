// 全站唯一的朗讀播放器（瀏覽器 TTS）。Story Quest 和 Reading Lab 都用這一個：
// 開始新的朗讀會先停掉舊的，所以永遠不會兩路同時播；換頁、離開頁面也會停。
(function () {
  const ok = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let token = 0;          // 每次 stop／新播放都 +1，舊的回呼看到 token 不同就不再動作
  let voice = null;
  const pickVoice = () => {
    if (!ok) return;
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => v.lang === "en-US" && v.localService) || vs.find(v => v.lang === "en-US") ||
            vs.find(v => v.lang && v.lang.startsWith("en")) || null;
  };
  if (ok) { pickVoice(); speechSynthesis.addEventListener?.("voiceschanged", pickVoice); }

  const api = {
    available: () => ok,
    speaking: false,
    // texts：一段字串或字串陣列，依序朗讀。opts.onStart(i)／onEnd(i)／onDone()
    speak(texts, opts = {}) {
      if (!ok) { opts.onUnavailable?.(); return false; }
      api.stop();
      const my = ++token;
      const list = [].concat(texts).filter(Boolean);
      const next = i => {
        if (my !== token) return;
        if (i >= list.length) { api.speaking = false; opts.onDone?.(); return; }
        const u = new SpeechSynthesisUtterance(list[i]);
        u.lang = "en-US"; u.rate = opts.rate || 0.9;
        if (voice) u.voice = voice;
        u.onend = () => { if (my !== token) return; opts.onEnd?.(i); next(i + 1); };
        u.onerror = () => { if (my !== token) return; opts.onEnd?.(i); api.speaking = false; opts.onDone?.(); };
        opts.onStart?.(i);
        speechSynthesis.speak(u);
      };
      api.speaking = true;
      next(0);
      return true;
    },
    stop() {
      token++;
      api.speaking = false;
      if (ok) speechSynthesis.cancel();
      document.dispatchEvent(new CustomEvent("ew:speech-stop"));
    },
  };
  window.addEventListener("pagehide", api.stop);
  window.addEventListener("hashchange", api.stop);
  window.EWSpeech = api;
})();
