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
  var state = { day: todayDay(), done: [], open: false, member: false };

  function isDone(d) { return state.done.indexOf(d) >= 0; }
  function pct() { return Math.round(state.done.length / 365 * 1000) / 10; }

  function render(root) {
    var day = PLAN.days[state.day - 1];
    var theme = PLAN.themes[day.t] || "";
    var today = todayDay();
    var behind = today - state.done.length;

    root.innerHTML =
      '<div class="fin-card rd-card">' +
        '<div class="rd-head">' +
          '<h3 class="sub-title" style="margin:0">성경 읽기</h3>' +
          '<span class="rd-year">' + YEAR + ' · 구속사적 성경읽기 365</span>' +
        "</div>" +

        /* 진행률 */
        '<div class="rd-bar"><span style="width:' + pct() + '%"></span></div>' +
        '<p class="rd-sum"><b>' + state.done.length + "</b>일 읽음 · 365일 중 <b>" + pct() + "%</b>" +
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

        /* 365칸 — 한 해가 한눈에 */
        '<div class="rd-grid" id="rdGrid">' + gridHTML(today) + "</div>" +
      "</div>";

    bind(root);
    if (state.open) fillText(root);
  }

  function gridHTML(today) {
    var out = "";
    for (var d = 1; d <= 365; d++) {
      var cls = isDone(d) ? "on" : (d === today ? "today" : (d < today ? "miss" : ""));
      out += '<button type="button" class="rd-cell ' + cls + '" data-d="' + d + '" title="' +
        d + '일째 · ' + esc(PLAN.days[d - 1].r) + '"></button>';
    }
    return out;
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

    Array.prototype.forEach.call(root.querySelectorAll(".rd-cell"), function (c) {
      c.onclick = function () { state.day = +c.getAttribute("data-d"); state.open = false; render(root); };
    });
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
