/* ============================================================
   동탄반석교회 — 큐티 음성 듣기
   ------------------------------------------------------------
   큐티 음원은 이미 만들어져 저장돼 있습니다. 파일 이름이
     qt-<날짜>-<지문>.wav
   인데, 여기서 '지문' 은 낭독 텍스트를 특정 방식으로 조립해 만든 짧은 해시입니다.
   그러므로 텍스트를 글자 하나까지 똑같이 조립해야 같은 이름이 나오고,
   그래야 이미 있는 음원을 찾아 들을 수 있습니다.
   아래 조립 규칙은 원본과 동일하게 옮겨 온 것입니다 — 손대면 음원을 못 찾습니다.

   음원이 없으면(아직 만들어지지 않은 날) 기기에 들어 있는 음성으로 읽어 줍니다.
   ============================================================ */
window.QT_AUDIO = (function () {
  var BASE = (window.QT_AUDIO_BASE || "").replace(/\/?$/, "/");
  var RULES_VER = "2";   // 낭독 규칙 판. 원본과 같아야 파일 이름이 맞는다

  /* ── 낭독 텍스트 조립 (원본 그대로) ───────────────────── */
  function fmtKakaoDateFromIso(iso) {
    if (!iso) return "";
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return iso;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var dow = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][d.getDay()];
    return m[1] + "." + m[2] + "." + m[3] + " " + dow;
  }
  function qtHtmlToText(html) {
    if (html == null) return "";
    var s = String(html);
    if (!/<[a-z!][\s\S]*>/i.test(s)) return s;
    var d = document.createElement("div");
    d.innerHTML = s.replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "$&\n").replace(/<br\s*\/?>/gi, "\n");
    return (d.textContent || "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
  }
  function rowToQtContent(r) {
    var dateStr = fmtKakaoDateFromIso(r.sermon_date);
    var out = [];
    out.push("📖 샬롬! 오늘의 QT입니다.");
    out.push("");
    out.push("📅 날짜: " + dateStr);
    out.push("");
    if (r.title) out.push(r.title);
    if (r.scripture) out.push(r.scripture);
    out.push("");
    out.push("📖 성경 본문 (우리말 성경)");
    out.push((r.qt_bible_text || "").trim());
    out.push("");
    out.push("📝 묵상");
    out.push("");
    out.push(qtHtmlToText(r.content).trim());
    var prayer = qtHtmlToText(r.prayer).trim();
    if (prayer) { out.push(""); out.push("🙏 기도"); out.push(""); out.push(prayer); }
    return out.join("\n");
  }
  function parseQt(raw) {
    var lines = (raw || "").split("\n").map(function (s) { return s.replace(/\s+$/g, ""); });
    var date = "", title = "", ref = "";
    var sections = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) { if (cur) cur.body.push(""); continue; }
      if (/^📖/.test(t) && /(샬롬|오늘의\s*QT)/.test(t)) continue;
      var dm = t.match(/^📅\s*날짜\s*[:：]?\s*(.+)$/);
      if (dm) { date = dm[1].trim(); continue; }
      var hm = t.match(/^(?:📖|📝|🙏|💡|✏️|🕊️|✨|🌱|📌|✝️?)\s*(.+)$/);
      if (hm) { cur = { head: hm[1].trim(), body: [] }; sections.push(cur); continue; }
      if (!cur) {
        if (!title) { title = t; continue; }
        if (!ref && /\d/.test(t) && /[:：~∼\-장절,\s]/.test(t) && t.length <= 32) { ref = t; continue; }
        title += " " + t; continue;
      }
      cur.body.push(t);
    }
    return { date: date, title: title, ref: ref, sections: sections };
  }
  function readTextFromParsed(p, fallback) {
    var parts = [];
    if (p.title) parts.push(p.title);
    if (p.ref) parts.push(p.ref);
    (p.sections || []).forEach(function (s) {
      var h = String(s.head || "").replace(/[^가-힣A-Za-z0-9\s]/g, " ").trim();
      if (h) parts.push(h);
      if (s.body) parts.push(s.body);
    });
    var readText = parts.join(". ");
    if (!readText.trim()) readText = fallback || "";
    return readText;
  }
  function readTextFromRow(r) {
    var content = rowToQtContent(r);
    return readTextFromParsed(parseQt(content), content);
  }
  function textSig(s) {
    var h = 2166136261 >>> 0; s = String(s || "");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }

  function urlFor(row) {
    if (!BASE || !row || !row.sermon_date) return null;
    var d = String(row.sermon_date).slice(0, 10);
    return BASE + "qt-" + d + "-" + textSig(RULES_VER + "|" + readTextFromRow(row)) + ".wav";
  }

  /* ── 재생 ─────────────────────────────────────────────── */
  var audio = null, speaking = false;

  function stop() {
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
    if (speaking) { try { speechSynthesis.cancel(); } catch (e) {} speaking = false; }
  }

  function bestVoice() {
    var vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    var ko = vs.filter(function (v) { return /^ko/i.test(v.lang || ""); });
    ko.sort(function (a, b) {
      function score(v) {
        var n = (v.name || "").toLowerCase();
        if (/google/.test(n)) return 4;
        if (/natural|neural|premium|enhanced|heami|yuna|sora/.test(n)) return 3;
        if (!v.localService) return 2;
        return 1;
      }
      return score(b) - score(a);
    });
    return ko[0] || null;
  }

  // 기기 음성 — 문장 단위로 끊어 읽는다
  function speak(row, onNote) {
    if (!window.speechSynthesis) { onNote("이 기기에서는 음성으로 읽어 드릴 수 없습니다."); return; }
    var text = readTextFromRow(row);
    var chunks = text.split(/(?<=[.!?。])\s+|\n+/).filter(function (s) { return s.trim(); });
    if (!chunks.length) chunks = [text];
    var v = bestVoice(), i = 0;
    speaking = true;
    try { speechSynthesis.cancel(); } catch (e) {}
    (function next() {
      if (!speaking || i >= chunks.length) { speaking = false; onNote("다 들으셨습니다."); return; }
      var u = new SpeechSynthesisUtterance(chunks[i]);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "ko-KR";
      u.rate = 0.96;
      u.onend = function () { i++; next(); };
      u.onerror = function () { i++; next(); };
      try { speechSynthesis.speak(u); } catch (e) { speaking = false; onNote("음성을 낼 수 없습니다."); }
    })();
  }

  /* 큐티 한 편을 들려준다.
     mount  — 재생기를 놓을 자리
     row    — qt_published 한 행
     onNote — 안내 문구를 받아 보여 주는 함수 */
  function play(mount, row, onNote) {
    stop();
    var url = urlFor(row);
    onNote = onNote || function () {};
    if (!url) { onNote("기기 음성으로 읽어 드립니다."); speak(row, onNote); return; }

    var el = document.createElement("audio");
    el.controls = true; el.preload = "auto"; el.className = "rp-audio";
    el.src = url;
    var settled = false;
    el.addEventListener("canplay", function () { settled = true; onNote(""); });
    el.addEventListener("ended", function () { onNote("다 들으셨습니다."); });
    el.addEventListener("error", function () {
      if (settled) return;
      settled = true;
      mount.innerHTML = "";
      onNote("저장된 낭독이 없어 기기 음성으로 읽어 드립니다.");
      speak(row, onNote);
    });
    // 응답이 없이 멈추는 경우에도 갇히지 않도록
    setTimeout(function () {
      if (settled || !audio) return;
      settled = true;
      mount.innerHTML = "";
      onNote("저장된 낭독을 불러오지 못해 기기 음성으로 읽어 드립니다.");
      speak(row, onNote);
    }, 8000);

    mount.innerHTML = "";
    mount.appendChild(el);
    audio = el;
    onNote("음성을 불러오는 중…");
    var p = el.play();
    if (p && p.catch) p.catch(function () { onNote("재생 단추를 눌러 주세요."); });
  }

  return { play: play, stop: stop, urlFor: urlFor, readText: readTextFromRow };
})();
