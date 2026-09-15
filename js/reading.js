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
  function todayDay() {
    var t = seoulNow();
    var start = Date.UTC(t.y, 0, 1);
    var now = Date.UTC(t.y, t.m - 1, t.d);
    var n = Math.floor((now - start) / 86400000) + 1;
    return Math.min(365, Math.max(1, n));   // 윤년의 366일째는 365일째로 본다
  }
  var YEAR = seoulNow().y;

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

  /* ── 화면 ── */
  var state = { day: todayDay(), done: [], open: false, member: false, book: null };

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
          '<span class="rd-year">' + YEAR + ' · 구속사적 성경읽기 365</span>' +
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
          (state.member
            ? '<button type="button" class="btn ' + (isDone(state.day) ? "btn-line rd-undo" : "btn-solid") + '" id="rdCheck">' +
                (isDone(state.day) ? "✓ 읽었습니다 (취소)" : "읽었습니다") + "</button>"
            : '<span class="rd-lock">정회원으로 인증하시면 읽은 날을 기록할 수 있습니다</span>') +
        "</div>" +
        '<p class="auth-msg" id="rdMsg" hidden></p>' +
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

    $("rdPrev").onclick = function () { if (state.day > 1) { state.day--; render(root); } };
    $("rdNext").onclick = function () { if (state.day < 365) { state.day++; render(root); } };
    if ($("rdToday")) $("rdToday").onclick = function () { state.day = todayDay(); render(root); };

    $("rdOpen").onclick = function () { state.open = !state.open; render(root); };

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

    // 권별 진도표 — 책을 누르면 아래에 남은 장이 펼쳐진다
    Array.prototype.forEach.call(root.querySelectorAll(".bk"), function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-a");
        state.book = (state.book === a) ? null : a;
        render(root);
        var d = root.querySelector(".bk-detail");
        if (d) d.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

  function fillText(root) {
    var box = root.querySelector("#rdText");
    box.innerHTML = '<p class="qt-loading">본문을 불러오는 중…</p>';
    passageHTML(PLAN.days[state.day - 1])
      .then(function (html) { box.innerHTML = html; })
      .catch(function (e) { box.innerHTML = '<p class="rd-err">' + esc(e.message) + "</p>"; });
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
