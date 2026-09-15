/* ============================================================
   동탄반석교회 — 성경 읽기 (나의 신앙생활)
   ------------------------------------------------------------
   · 읽기표는 운평장로교회에서 쓰는 '구속사적 성경읽기 365' 입니다(js/bible-plan.js).
   · 온 교회가 같은 날 같은 본문을 읽습니다. 그래서 오늘의 진도는
     '올해 몇째 날인가' 로 정해지고, 기록에는 며칠째인지만 남습니다.
   · 본문은 우리말성경(data/urm/<약어>.json)에서 그날 필요한 책만 내려받습니다.
     성경 한 권을 통째로 받지 않습니다.
   · 읽음 표시는 정회원만. 준회원은 교적 인증을 먼저 하셔야 합니다.
   ============================================================ */
(function () {
  var PLAN = window.BIBLE_PLAN;
  if (!PLAN) return;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  /* ── 오늘은 읽기표의 며칠째인가 ── */
  function seoulNow() {
    // 표준시 차이로 자정 무렵에 날짜가 어긋나지 않도록 한국 시각으로 센다
    var s = new Date().toLocaleString("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
    var p = s.split("-");
    return { y: +p[0], m: +p[1], d: +p[2] };
  }
  /* 읽기표의 첫날은 교회가 이 읽기를 시작한 날입니다(js/config.js 의 BIBLE_PLAN_START).
     달력의 1월 1일이 아닙니다 — 9월에 시작한 교회가 258일째부터 읽을 수는 없으니까요.
     온 교회가 같은 날 같은 본문을 읽도록, 이 날짜 하나를 함께 씁니다. */
  var START = (function () {
    var s = String(window.BIBLE_PLAN_START || "").slice(0, 10).split("-");
    if (s.length === 3) return { y: +s[0], m: +s[1], d: +s[2] };
    var t = seoulNow();
    return { y: t.y, m: t.m, d: t.d };     // 지정하지 않았으면 오늘이 첫날
  })();
  function todayDay() {
    var t = seoulNow();
    var n = Math.floor((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(START.y, START.m - 1, START.d)) / 86400000) + 1;
    return Math.min(365, Math.max(1, n));
  }
  // 기록을 묶는 이름 — 읽기표를 시작한 해. 해가 바뀌어도 한 바퀴는 이어진다
  var YEAR = START.y;

  /* ── 본문 내려받기 (책 단위, 한 번 받으면 기억해 둔다) ── */
  var cache = {};
  function loadBook(abbr) {
    if (cache[abbr]) return Promise.resolve(cache[abbr]);
    return fetch("data/urm/" + encodeURIComponent(abbr) + ".json")
      .then(function (r) {
        if (!r.ok) throw new Error("본문을 불러오지 못했습니다 (" + abbr + ")");
        return r.json();
      })
      .then(function (j) { cache[abbr] = j; return j; });
  }

  function passageHTML(day) {
    var refs = day.refs || [];
    return Promise.all(refs.map(function (r) { return loadBook(r[0]); })).then(function (books) {
      return refs.map(function (r, i) {
        var abbr = r[0], from = r[1], to = r[2];
        var name = PLAN.names[abbr] || abbr;
        var chapters = books[i] || [];
        var out = "";
        for (var c = from; c <= to; c++) {
          var verses = chapters[c - 1] || [];
          out += '<h4 class="rd-chap">' + esc(name) + " " + c + "장</h4>";
          out += '<ol class="rd-verses">' + verses.map(function (v) {
            return "<li>" + esc(v) + "</li>";
          }).join("") + "</ol>";
        }
        return out;
      }).join("");
    });
  }

  /* ── 서버와 주고받기 ── */
  function rpc(fn, params) {
    var h = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    var t = window.__sbToken || (window.WPF && WPF.token && WPF.token());
    if (t) h.Authorization = "Bearer " + t;
    return fetch(window.SUPABASE_URL + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: h, body: JSON.stringify(params || {})
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (x) {
        if (/relation .* does not exist|schema cache|function/i.test(x)) {
          throw new Error("성경 읽기 표가 아직 없습니다. (관리자: supabase/09_reading.sql 실행)");
        }
        throw new Error(x || "요청이 거부되었습니다.");
      });
      return r.text().then(function (x) { return x ? JSON.parse(x) : null; });
    }, function () { throw new Error("서버에 연결하지 못했습니다."); });
  }

  /* ── 음성으로 듣기 ─────────────────────────────────────
     교회가 마련해 둔 낭독 음원을 장 단위로 이어 재생합니다
     (bible-<책번호>-<장>.mp3). 음원이 없거나 열리지 않는 장은
     브라우저에 들어 있는 음성으로 대신 읽어 줍니다 — 그 편이
     "소리가 안 나요" 하고 멈추는 것보다 낫습니다. */
  var AUDIO_BASE = (window.BIBLE_AUDIO_BASE || "").replace(/\/?$/, "/");
  var bookNo = {};
  (window.BIBLE_BOOKS || []).forEach(function (b, i) { bookNo[b.a] = i + 1; });

  // 그날 읽을 장을 차례로 늘어놓는다
  function chaptersOf(day) {
    var out = [];
    (day.refs || []).forEach(function (r) {
      for (var c = r[1]; c <= r[2]; c++) {
        out.push({ a: r[0], name: PLAN.names[r[0]] || r[0], ch: c, no: bookNo[r[0]] || 0 });
      }
    });
    return out;
  }

  var audio = null, aList = [], aIdx = 0, aRoot = null;

  function stopAudio() {
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    state.audio = false;
  }

  function startAudio(root) {
    aRoot = root;
    aList = chaptersOf(PLAN.days[state.day - 1]);
    aIdx = 0;
    state.audio = true;
    render(root);
    playChapter();
  }

  function playerBox() { return aRoot && aRoot.querySelector("#rdPlayer"); }

  function drawPlayer(note) {
    var box = playerBox();
    if (!box) return;
    var c = aList[aIdx];
    box.innerHTML =
      '<div class="rp-head">' +
        '<button type="button" class="rp-move" id="rpPrev" aria-label="앞 장">‹</button>' +
        '<span class="rp-now">' + (c ? esc(c.name) + " " + c.ch + "장" : "") +
          '<em>' + (aIdx + 1) + " / " + aList.length + "</em></span>" +
        '<button type="button" class="rp-move" id="rpNext" aria-label="다음 장">›</button>' +
      "</div>" +
      '<div id="rpSlot"></div>' +
      (note ? '<p class="rp-note">' + esc(note) + "</p>" : "");
    var p = box.querySelector("#rpPrev"), n = box.querySelector("#rpNext");
    if (p) p.onclick = function () { if (aIdx > 0) { aIdx--; playChapter(); } };
    if (n) n.onclick = function () { if (aIdx < aList.length - 1) { aIdx++; playChapter(); } };
  }

  function playChapter() {
    var c = aList[aIdx];
    if (!c) { stopAudio(); render(aRoot); return; }
    drawPlayer();
    var slot = playerBox() && playerBox().querySelector("#rpSlot");
    if (!slot) return;

    if (!AUDIO_BASE || !c.no) { speakChapter(c); return; }

    var el = document.createElement("audio");
    el.controls = true; el.autoplay = true; el.preload = "auto"; el.className = "rp-audio";
    el.src = AUDIO_BASE + "bible-" + c.no + "-" + c.ch + ".mp3";
    el.addEventListener("ended", function () {
      if (aIdx < aList.length - 1) { aIdx++; playChapter(); }
      else { drawPlayer("오늘 본문을 다 들으셨습니다."); }
    });
    // 음원이 없거나 막히면 브라우저 음성으로 갈아탄다
    el.addEventListener("error", function () { speakChapter(c, true); });
    slot.innerHTML = "";
    slot.appendChild(el);
    audio = el;
    var pr = el.play();
    if (pr && pr.catch) pr.catch(function () { drawPlayer("재생 단추를 눌러 주세요."); });
  }

  /* 브라우저에 들어 있는 음성 — 절 단위로 끊어 읽어 호흡이 자연스럽다 */
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

  function speakChapter(c, fellBack) {
    var slot = playerBox() && playerBox().querySelector("#rpSlot");
    if (!window.speechSynthesis) {
      drawPlayer("이 기기에서는 음성으로 읽어 드릴 수 없습니다.");
      return;
    }
    drawPlayer(fellBack ? "낭독 음원이 없어 기기 음성으로 읽어 드립니다." : "기기 음성으로 읽어 드립니다.");
    slot = playerBox().querySelector("#rpSlot");
    slot.innerHTML = '<p class="rp-speaking">읽는 중…</p>';

    loadBook(c.a).then(function (chapters) {
      var verses = (chapters[c.ch - 1] || []).slice();
      if (!verses.length) { drawPlayer("본문을 찾지 못했습니다."); return; }
      var v = bestVoice(), i = 0;
      try { speechSynthesis.cancel(); } catch (e) {}
      (function next() {
        if (!state.audio || i >= verses.length) {
          if (state.audio && aIdx < aList.length - 1) { aIdx++; playChapter(); }
          else if (state.audio) drawPlayer("오늘 본문을 다 들으셨습니다.");
          return;
        }
        var u = new SpeechSynthesisUtterance(verses[i]);
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "ko-KR";
        u.rate = 0.95;
        u.onend = function () { i++; next(); };
        u.onerror = function () { i++; next(); };
        try { speechSynthesis.speak(u); } catch (e) { drawPlayer("음성을 낼 수 없습니다."); }
      })();
    }).catch(function () { drawPlayer("본문을 불러오지 못했습니다."); });
  }

  /* ── 화면 ── */
  var state = { day: todayDay(), done: [], open: false, member: false, book: null, audio: false };

  function isDone(d) { return state.done.indexOf(d) >= 0; }
  function pct() { return Math.round(state.done.length / 365 * 1000) / 10; }

  function render(root) {
    var day = PLAN.days[state.day - 1];
    var theme = PLAN.themes[day.t] || "";
    var today = todayDay();
    var behind = today - state.done.length;
    var books = bookProgress();
    var picked = state.book ? books.filter(function (b) { return b.a === state.book; })[0] : null;
    var chRead = books.reduce(function (n, b) { return n + b.got; }, 0);
    var bkDone = books.filter(function (b) { return b.got >= b.c; }).length;

    root.innerHTML =
      '<div class="fin-card rd-card">' +
        '<div class="rd-head">' +
          '<h3 class="sub-title" style="margin:0">성경 읽기</h3>' +
          '<span class="rd-year">구속사적 성경읽기 365</span>' +
        "</div>" +

        /* 진행률 */
        '<div class="rd-bar"><span style="width:' + (chRead / TOTAL_CH * 100) + '%"></span></div>' +
        '<p class="rd-sum"><b>' + chRead + "</b>장 읽음 · 전체 " + TOTAL_CH + "장 중 <b>" +
            (Math.round(chRead / TOTAL_CH * 1000) / 10) + "%</b> · <b>" + bkDone + "</b>권 마침" +
          (state.member ? (behind > 0 ? ' · <span class="rd-behind">' + behind + "일 밀렸습니다</span>"
                                      : ' · <span class="rd-ok">잘 따라오고 계십니다</span>') : "") +
        "</p>" +

        /* 오늘의 본문 */
        '<div class="rd-day">' +
          '<button type="button" class="rd-move" id="rdPrev" aria-label="앞날">‹</button>' +
          "<div>" +
            '<p class="rd-theme">' + esc(theme) + "</p>" +
            '<p class="rd-title"><b>' + state.day + "일째</b> · " + esc(day.r) + "</p>" +
          "</div>" +
          '<button type="button" class="rd-move" id="rdNext" aria-label="다음날">›</button>' +
        "</div>" +

        (state.day !== today
          ? '<p class="rd-note">오늘은 <b>' + today + '일째</b>입니다. <button type="button" class="rd-today" id="rdToday">오늘로</button></p>'
          : "") +

        '<div class="rd-actions">' +
          '<button type="button" class="btn btn-line" id="rdOpen">' + (state.open ? "본문 접기" : "본문 읽기") + "</button>" +
          '<button type="button" class="btn btn-line rd-listen" id="rdListen">' +
            (state.audio ? "🔊 듣기 그만" : "🔊 음성으로 듣기") + "</button>" +
          (state.member
            ? '<button type="button" class="btn ' + (isDone(state.day) ? "btn-line rd-undo" : "btn-solid") + '" id="rdCheck">' +
                (isDone(state.day) ? "✓ 읽었습니다 (취소)" : "읽었습니다") + "</button>"
            : '<span class="rd-lock">정회원으로 인증하시면 읽은 날을 기록할 수 있습니다</span>') +
        "</div>" +
        '<p class="auth-msg" id="rdMsg" hidden></p>' +
        '<div class="rd-player" id="rdPlayer"' + (state.audio ? "" : " hidden") + "></div>" +
        '<div class="rd-text" id="rdText"' + (state.open ? "" : " hidden") + "></div>" +

        /* 66권 — 어느 책을 얼마나 읽었는지 한눈에 */
        '<div class="bk-wrap" id="bkWrap">' +
          '<p class="bk-title">성경 66권 진도</p>' +
          bookTable(books) +
          bookDetail(picked, books) +
        "</div>" +
      "</div>";

    bind(root);
    if (state.open) fillText(root);
  }

  /* ── 권별 진도 ──────────────────────────────────────────
     읽기표의 하루는 "어느 책 몇 장부터 몇 장까지" 를 가리킨다.
     그러므로 읽은 날들을 모으면 어느 책 몇 장을 읽었는지가 저절로 나온다.
     장을 따로 기록할 필요가 없다. ─────────────────────── */
  var BOOKS = window.BIBLE_BOOKS || [];
  var TOTAL_CH = BOOKS.reduce(function (s, b) { return s + b.c; }, 0);

  // 책+장 → 그 장을 읽는 날이 며칠째인가 (한 번만 만들어 둔다)
  var dayOfChapter = (function () {
    var m = {};
    PLAN.days.forEach(function (day) {
      (day.refs || []).forEach(function (r) {
        for (var c = r[1]; c <= r[2]; c++) {
          var k = r[0] + "|" + c;
          if (m[k] == null) m[k] = day.d;
        }
      });
    });
    return m;
  })();

  // 그 책에서 아직 읽지 않은 첫 장이 읽기표 며칠째인가 (다 읽었으면 그 책의 첫날)
  function firstDayOf(abbr) {
    var b = bookProgress().filter(function (x) { return x.a === abbr; })[0];
    if (!b) return 0;
    var want = b.rest.length ? b.rest[0] : 1;
    return dayOfChapter[abbr + "|" + want] || dayOfChapter[abbr + "|1"] || 0;
  }

  // 읽은 날들로부터 책별로 읽은 장을 센다
  function bookProgress() {
    var read = {};   // 약어 → { 장번호: true }
    state.done.forEach(function (d) {
      var day = PLAN.days[d - 1];
      if (!day) return;
      (day.refs || []).forEach(function (r) {
        var m = read[r[0]] || (read[r[0]] = {});
        for (var c = r[1]; c <= r[2]; c++) m[c] = true;
      });
    });
    return BOOKS.map(function (b) {
      var m = read[b.a] || {};
      var got = 0, rest = [];
      for (var c = 1; c <= b.c; c++) { if (m[c]) got++; else rest.push(c); }
      return { a: b.a, n: b.n, c: b.c, t: b.t, got: got, rest: rest };
    });
  }

  function bookTable(list) {
    function section(title, t) {
      var part = list.filter(function (b) { return b.t === t; });
      var done = part.filter(function (b) { return b.got >= b.c; }).length;
      return '<div class="bk-sec"><p class="bk-sec-head">' + title +
          ' <em>' + part.length + '권 중 ' + done + '권 마침</em></p>' +
        '<div class="bk-grid">' + part.map(function (b) {
          var p = Math.round(b.got / b.c * 100);
          var cls = b.got >= b.c ? "full" : (b.got ? "part" : "");
          return '<button type="button" class="bk ' + cls + '" data-a="' + esc(b.a) + '">' +
              '<span class="bk-name">' + esc(b.n) + (b.got >= b.c ? " ✓" : "") + "</span>" +
              '<span class="bk-num">' + b.got + "/" + b.c + "</span>" +
              '<span class="bk-bar"><i style="width:' + p + '%"></i></span>' +
            "</button>";
        }).join("") + "</div></div>";
    }
    return section("구약", 0) + section("신약", 1);
  }

  // 책 하나를 누르면 — 얼마나 읽었고 몇 장이 남았는지, 남은 곳이 며칠째인지
  function bookDetail(b, list) {
    if (!b) return "";
    var leftBooks = list.filter(function (x) { return x.got < x.c; }).length;
    var days = {};
    b.rest.forEach(function (c) { var d = dayOfChapter[b.a + "|" + c]; if (d) days[d] = true; });
    var dayList = Object.keys(days).map(Number).sort(function (x, y) { return x - y; });
    var first = dayList[0];

    return '<div class="bk-detail">' +
      '<div class="bk-detail-head">' +
        "<h4>" + esc(b.n) + "</h4>" +
        '<button type="button" class="bk-close" id="bkClose" aria-label="닫기">&times;</button>' +
      "</div>" +
      (b.got >= b.c
        ? '<p class="bk-done">' + esc(b.n) + " " + b.c + "장을 <b>모두 읽으셨습니다.</b></p>"
        : '<p class="bk-left">' + b.c + "장 가운데 <b>" + b.got + "장</b>을 읽으시고 <b>" + b.rest.length + "장</b>이 남았습니다." +
          (b.rest.length ? ' <span class="bk-rest">남은 곳 · ' + rangeText(b.rest) + "장</span>" : "") + "</p>") +
      '<p class="bk-meta">성경 66권 가운데 <b>' + leftBooks + "권</b>이 남았습니다." +
        (first ? ' 다음 차례는 읽기표 <b>' + first + '일째</b>입니다. <button type="button" class="rd-today" id="bkGo" data-d="' + first + '">그 날로 가기</button>' : "") +
      "</p></div>";
  }

  // 1,2,3,7,8 → "1~3, 7~8"
  function rangeText(arr) {
    var out = [], s = null, p = null;
    arr.forEach(function (n) {
      if (s === null) { s = p = n; return; }
      if (n === p + 1) { p = n; return; }
      out.push(s === p ? s : s + "~" + p); s = p = n;
    });
    if (s !== null) out.push(s === p ? s : s + "~" + p);
    return out.slice(0, 12).join(", ") + (out.length > 12 ? " …" : "");
  }

  function bind(root) {
    var $ = function (id) { return root.querySelector("#" + id); };
    var msg = $("rdMsg");
    function show(t, ok) { msg.hidden = false; msg.textContent = t; msg.className = "auth-msg " + (ok ? "ok" : "err"); }

    $("rdPrev").onclick = function () { if (state.day > 1) { stopAudio(); state.day--; render(root); } };
    $("rdNext").onclick = function () { if (state.day < 365) { stopAudio(); state.day++; render(root); } };
    if ($("rdToday")) $("rdToday").onclick = function () { stopAudio(); state.day = todayDay(); render(root); };

    $("rdOpen").onclick = function () { state.open = !state.open; render(root); };
    $("rdListen").onclick = function () {
      if (state.audio) { stopAudio(); render(root); }
      else startAudio(root);
    };

    if ($("rdCheck")) $("rdCheck").onclick = function () {
      var btn = this, want = !isDone(state.day), d = state.day;
      btn.disabled = true;
      rpc("toggle_reading", { p_year: YEAR, p_day: d, p_read: want })
        .then(function () {
          if (want) { if (!isDone(d)) state.done.push(d); }
          else state.done = state.done.filter(function (x) { return x !== d; });
          render(root);
        })
        .catch(function (e) { show(e.message, false); btn.disabled = false; });
    };

    /* 권별 진도표 — 책을 누르면 위 본문 칸도 그 책으로 함께 옮긴다.
       창세기를 눌렀는데 아모스가 떠 있으면 누구라도 어리둥절하다. */
    Array.prototype.forEach.call(root.querySelectorAll(".bk"), function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-a");
        if (state.book === a) { state.book = null; render(root); return; }
        state.book = a;
        var d = firstDayOf(a);
        if (d) { stopAudio(); state.day = d; state.open = false; }
        render(root);
        var t = root.querySelector(".rd-day");
        if (t) t.scrollIntoView({ block: "center", behavior: "smooth" });
      };
    });
    var bkClose = root.querySelector("#bkClose");
    if (bkClose) bkClose.onclick = function () { state.book = null; render(root); };
    var bkGo = root.querySelector("#bkGo");
    if (bkGo) bkGo.onclick = function () {
      state.day = +bkGo.getAttribute("data-d");
      state.open = false;
      render(root);
      var t = root.querySelector(".rd-day");
      if (t) t.scrollIntoView({ block: "center", behavior: "smooth" });
    };
  }

  /* 구속사 파노라마 — 오늘 본문이 성경 전체 이야기의 어디쯤인지,
     어떤 눈으로 읽을 것인지. 구속사적 읽기표이므로 본문보다 먼저 온다. */
  function panoramaHTML(day) {
    var N = window.BIBLE_NOTES;
    if (!N) return "";
    var t = (N.themes || [])[day.t] || "";
    var d = (N.days || [])[day.d - 1] || "";
    if (!t && !d) return "";
    return '<div class="rd-pano">' +
      '<p class="rp-badge">구속사 파노라마 · 주제 ' + (day.t + 1) + "/38</p>" +
      (t ? '<p class="rp-theme">' + esc(t) + "</p>" : "") +
      (d ? '<p class="rp-day">' + esc(d) + "</p>" : "") +
      "</div>";
  }

  function fillText(root) {
    var box = root.querySelector("#rdText");
    var day = PLAN.days[state.day - 1];
    box.innerHTML = panoramaHTML(day) + '<p class="qt-loading">본문을 불러오는 중…</p>';
    passageHTML(day)
      .then(function (html) { box.innerHTML = panoramaHTML(day) + html; })
      .catch(function (e) { box.innerHTML = panoramaHTML(day) + '<p class="rd-err">' + esc(e.message) + "</p>"; });
  }

  /* ── 시작 ── */
  window.__mountReading = function (root, opts) {
    if (!root) return;
    state.member = !!(opts && opts.member);
    root.innerHTML = '<div class="fin-card"><p class="qt-loading">성경 읽기를 불러오는 중…</p></div>';
    if (!state.member) { state.done = []; render(root); return; }
    rpc("my_reading_days", { p_year: YEAR })
      .then(function (days) { state.done = days || []; render(root); })
      .catch(function (e) {
        state.done = [];
        render(root);
        var m = root.querySelector("#rdMsg");
        if (m) { m.hidden = false; m.textContent = e.message; m.className = "auth-msg err"; }
      });
  };
})();
