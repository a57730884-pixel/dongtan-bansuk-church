/* ============================================================
   동탄반석교회 — 오늘의 큐티
   ------------------------------------------------------------
   · 큐티 '본문' 은 외부 큐티 자료(js/config.js 의 QT_SOURCE)에서 읽어 옵니다.
     복사해 두는 것이 아니라 그때그때 읽어 오므로, 원본이 고쳐지면 함께 고쳐집니다.
   · 큐티 '기록' — 누가 언제 아멘 했는가 — 은 이 교회 데이터베이스에 남습니다.
     성도의 신앙 기록은 이 교회 안에 둡니다.
   · 쓰는 곳: 첫 화면(히어로 아래) · 나의 신앙생활
   ============================================================ */
(function () {
  var SRC = window.QT_SOURCE || null;
  var homeEl = document.getElementById("qtToday");
  var mineEl = document.getElementById("qtMine");
  // 나의 신앙생활에서는 큐티 칸이 나중에 만들어지므로, 여기서 물러나면 안 된다.
  // 출처 설정이 없을 때만 통째로 쉰다.
  if (!SRC || !SRC.url || !SRC.key) return;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  function ymd(d) { var s = String(d || "").slice(0, 10).split("-"); return s.length === 3 ? s.join(".") : ""; }
  function seoulToday() {
    return new Date().toLocaleString("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
  }

  /* 밖에서 온 글이므로 그대로 넣지 않는다.
     문단·강조·목록만 남기고 스크립트와 속성은 모두 떼어 낸다. */
  var OK_TAGS = { P: 1, BR: 1, B: 1, STRONG: 1, EM: 1, I: 1, U: 1, BLOCKQUOTE: 1, UL: 1, OL: 1, LI: 1, H3: 1, H4: 1, SPAN: 1, DIV: 1 };
  function clean(html) {
    var box = document.createElement("div");
    box.innerHTML = String(html || "");
    (function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (n) {
        if (n.nodeType === 1) {
          if (!OK_TAGS[n.tagName]) {
            if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/.test(n.tagName)) { n.remove(); return; }
            var t = document.createElement("p");
            while (n.firstChild) t.appendChild(n.firstChild);
            n.replaceWith(t);
            n = t;
          }
          Array.prototype.slice.call(n.attributes || []).forEach(function (a) { n.removeAttribute(a.name); });
          walk(n);
        }
      });
    })(box);
    return box.innerHTML;
  }

  /* ── 큐티 가져오기 (읽기만 합니다) ── */
  var COLS = "sermon_date,title,scripture,qt_bible_text,content,prayer";
  function fetchQt(limit) {
    var base = String(SRC.url).replace(/\/$/, "");
    var url = base + "/rest/v1/" + (SRC.table || "qt_published") +
      "?select=" + COLS + "&order=sermon_date.desc&limit=" + (limit || 1);
    return fetch(url, { headers: { apikey: SRC.key } }).then(function (r) {
      if (!r.ok) throw new Error("큐티를 불러오지 못했습니다.");
      return r.json();
    });
  }

  /* ── 우리 집 데이터베이스 (아멘 기록) ── */
  function token() {
    if (window.__sbToken) return window.__sbToken;
    try {
      var ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      var raw = localStorage.getItem("sb-" + ref + "-auth-token");
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && (s.access_token || (s.currentSession && s.currentSession.access_token))) || null;
    } catch (e) { return null; }
  }
  function rpc(fn, params) {
    var h = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    var t = token(); if (t) h.Authorization = "Bearer " + t;
    return fetch(window.SUPABASE_URL + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: h, body: JSON.stringify(params || {})
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (x) {
        if (/relation .* does not exist|schema cache|Could not find the function/i.test(x)) {
          throw new Error("큐티 기록 표가 아직 없습니다. (관리자: supabase/12_qt.sql 실행)");
        }
        throw new Error(x || "요청이 거부되었습니다.");
      });
      return r.text().then(function (x) { return x ? JSON.parse(x) : null; });
    }, function () { throw new Error("서버에 연결하지 못했습니다."); });
  }

  /* ── 첫 화면 — 오늘의 큐티 ── */
  var today = null;

  function drawHome() {
    if (!homeEl || !today) return;
    homeEl.innerHTML =
      '<div class="qt-card">' +
        '<div class="qt-head">' +
          '<span class="qt-eyebrow">오늘의 큐티</span>' +
          '<span class="qt-date">' + esc(ymd(today.sermon_date)) + "</span>" +
        "</div>" +
        "<h3>" + esc(today.title || "") + "</h3>" +
        (today.scripture ? '<p class="qt-ref">' + esc(today.scripture) + "</p>" : "") +
        '<div class="qt-peek">' + clean(today.content || "") + "</div>" +
        '<div class="qt-acts">' +
          '<button type="button" class="btn btn-solid" id="qtOpen">큐티 전문 보기</button>' +
          '<button type="button" class="btn btn-line" id="qtListen">🔊 음성으로 듣기</button>' +
        "</div>" +
        '<div class="qt-player" id="qtPlayer" hidden></div>' +
        '<p class="rp-note" id="qtPlayNote" hidden></p>' +
        '<div id="qtAmen"></div>' +
      "</div>";
    document.getElementById("qtOpen").onclick = openModal;
    bindListen();
    drawAmen();
  }

  function openModal() {
    var m = document.createElement("div");
    m.className = "modal qt-modal";
    m.innerHTML =
      '<div class="modal-backdrop" data-x></div>' +
      '<div class="modal-box qt-box" role="dialog" aria-modal="true">' +
        '<button class="modal-close" data-x aria-label="닫기">&times;</button>' +
        '<p class="qt-eyebrow">' + esc(ymd(today.sermon_date)) + " 큐티</p>" +
        "<h3>" + esc(today.title || "") + "</h3>" +
        (today.scripture ? '<p class="qt-ref">' + esc(today.scripture) + "</p>" : "") +
        (today.qt_bible_text ? '<div class="qt-bible">' + esc(today.qt_bible_text).replace(/\n/g, "<br />") + "</div>" : "") +
        '<div class="qt-body">' + clean(today.content || "") + "</div>" +
        (today.prayer ? '<div class="qt-prayer"><p class="qt-prayer-label">기도</p>' +
            esc(today.prayer).replace(/\n/g, "<br />") + "</div>" : "") +
      "</div>";
    document.body.appendChild(m);
    document.body.style.overflow = "hidden";
    Array.prototype.forEach.call(m.querySelectorAll("[data-x]"), function (el) {
      el.addEventListener("click", function () { m.remove(); document.body.style.overflow = ""; });
    });
  }

  /* ── 음성으로 듣기 ── */
  var listening = false;
  function bindListen() {
    var btn = document.getElementById("qtListen");
    if (!btn || !window.QT_AUDIO) { if (btn) btn.hidden = true; return; }
    btn.onclick = function () {
      var box = document.getElementById("qtPlayer");
      var note = document.getElementById("qtPlayNote");
      if (listening) {
        window.QT_AUDIO.stop();
        listening = false;
        box.hidden = true; note.hidden = true; box.innerHTML = "";
        btn.textContent = "🔊 음성으로 듣기";
        return;
      }
      listening = true;
      btn.textContent = "🔊 듣기 그만";
      box.hidden = false;
      window.QT_AUDIO.play(box, today, function (msg) {
        note.hidden = !msg;
        note.textContent = msg || "";
      });
    };
  }

  /* ── 아멘 체크 ── */
  function drawAmen(checked) {
    var box = document.getElementById("qtAmen");
    if (!box || !today) return;
    if (!token()) {
      box.innerHTML = '<p class="qt-amen-note"><b>로그인</b>하시면 오늘의 큐티에 <b>아멘</b>을 남기실 수 있습니다.</p>';
      return;
    }
    if (checked) {
      box.innerHTML = '<p class="qt-amen done">✓ 오늘의 큐티를 마치고 아멘 하셨습니다</p>';
      box.querySelector(".qt-amen").onclick = function () { setAmen(false); };
      return;
    }
    box.innerHTML = '<label class="qt-amen"><input type="checkbox" id="qtAmenBox" /> ' +
      "<span>기도문까지 읽고, 오늘의 큐티에 <b>아멘</b> 합니다</span></label>";
    document.getElementById("qtAmenBox").onchange = function () { setAmen(true); };
  }

  function setAmen(on) {
    var d = String(today.sermon_date).slice(0, 10);
    rpc("toggle_qt", { p_date: d, p_on: on, p_title: today.title || null, p_scripture: today.scripture || null })
      .then(function () { drawAmen(on); })
      .catch(function (e) {
        var box = document.getElementById("qtAmen");
        if (box) box.innerHTML = '<p class="qt-amen-note err">' + esc(e.message) + "</p>";
      });
  }

  function loadAmenState() {
    if (!token() || !today) return;
    rpc("my_qt_days", { p_from: String(today.sermon_date).slice(0, 10), p_to: String(today.sermon_date).slice(0, 10) })
      .then(function (days) { drawAmen(!!(days && days.length)); })
      .catch(function () {});
  }

  /* ── 성경 본문 표기를 책·장으로 읽어 낸다 ──────────────
     "역대상 7:1~40"    → 역대상 7장
     "역대상 4:1-6:81"  → 역대상 4~6장
     "시편 119:169-176" → 시편 119장
     한 절씩까지 따지지 않고 장 단위로 셉니다. 큐티는 한 장을 붙들고
     묵상하는 것이지 절을 세는 일이 아니기 때문입니다. */
  var BOOKS = (window.BIBLE_BOOKS || []).slice();
  var BY_NAME = BOOKS.slice().sort(function (a, b) { return b.n.length - a.n.length; });

  function parseRef(text) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return null;
    var book = null, rest = "";
    for (var i = 0; i < BY_NAME.length; i++) {
      var b = BY_NAME[i];
      var at = s.indexOf(b.n);
      if (at >= 0) { book = b; rest = s.slice(at + b.n.length); break; }
    }
    if (!book) {   // 이름이 없으면 약어로 한 번 더
      var sorted = BOOKS.slice().sort(function (a, b) { return b.a.length - a.a.length; });
      for (var j = 0; j < sorted.length; j++) {
        var k = s.indexOf(sorted[j].a);
        if (k >= 0) { book = sorted[j]; rest = s.slice(k + sorted[j].a.length); break; }
      }
    }
    if (!book) return null;

    var chaps = [], m, re = /(\d+)\s*[:：]/g;
    while ((m = re.exec(rest))) chaps.push(+m[1]);
    if (!chaps.length) { re = /\d+/g; while ((m = re.exec(rest))) chaps.push(+m[0]); }
    if (!chaps.length) return null;

    var from = Math.max(1, Math.min.apply(null, chaps));
    var to = Math.min(book.c, Math.max.apply(null, chaps));
    if (to < from) to = from;
    return { a: book.a, from: from, to: to };
  }

  // 내가 묵상한 큐티들 → 책별로 몇 장을 묵상했는가
  function qtProgress(history) {
    var got = {}, unknown = 0;
    (history || []).forEach(function (h) {
      var r = parseRef(h.scripture);
      if (!r) { if (h.scripture) unknown++; return; }
      var m = got[r.a] || (got[r.a] = {});
      for (var c = r.from; c <= r.to; c++) m[c] = true;
    });
    var books = BOOKS.map(function (b) {
      var m = got[b.a] || {};
      var n = 0;
      for (var c = 1; c <= b.c; c++) if (m[c]) n++;
      return { a: b.a, n: b.n, c: b.c, t: b.t, got: n };
    });
    return { books: books, unknown: unknown };
  }

  function qtBookTable(books) {
    function section(title, t) {
      var part = books.filter(function (b) { return b.t === t; });
      var touched = part.filter(function (b) { return b.got > 0; }).length;
      return '<div class="bk-sec ' + (t ? "nt" : "ot") + '"><p class="bk-sec-head">' + title +
          " <em>" + part.length + "권 중 " + touched + "권 묵상</em></p>" +
        '<div class="bk-grid">' + part.map(function (b) {
          var p = Math.round(b.got / b.c * 100);
          var cls = b.got >= b.c ? "full" : (b.got ? "part" : "");
          return '<span class="bk ' + cls + '" title="' + esc(b.n) + ' ' + b.got + "/" + b.c + '장">' +
              '<span class="bk-name">' + esc(b.n) + (b.got >= b.c ? " ✓" : "") + "</span>" +
              '<span class="bk-num">' + b.got + "/" + b.c + "</span>" +
              '<span class="bk-bar"><i style="width:' + p + '%"></i></span>' +
            "</span>";
        }).join("") + "</div></div>";
    }
    return section("구약", 0) + section("신약", 1);
  }

  /* ── 나의 신앙생활 — 내 큐티 내역 ── */
  function drawMine(sum, hist) {
    var prog = qtProgress(hist);
    if (!mineEl) return;
    var recent = (sum && sum.qt_recent) || [];
    var have = {};
    recent.forEach(function (d) { have[String(d).slice(0, 10)] = true; });

    // 최근 한 달 달력 — 빠진 날이 눈에 들어오도록
    var t = seoulToday().split("-");
    var cells = "";
    for (var back = 29; back >= 0; back--) {
      var dt = new Date(Date.UTC(+t[0], +t[1] - 1, +t[2] - back));
      var key = dt.toISOString().slice(0, 10);
      cells += '<span class="qt-cell' + (have[key] ? " on" : "") + '" title="' + key + '"></span>';
    }

    mineEl.innerHTML =
      '<div class="fin-card">' +
        '<div class="rd-head">' +
          '<h3 class="sub-title" style="margin:0">큐티</h3>' +
          '<span class="rd-year">날마다 드리는 묵상</span>' +
        "</div>" +
        '<div class="qt-stats">' +
          '<div class="qt-stat"><b>' + (sum.qt_total || 0) + "</b><span>아멘 한 날</span></div>" +
          '<div class="qt-stat"><b>' + (sum.qt_streak || 0) + "</b><span>이어 가는 날</span></div>" +
          '<div class="qt-stat"><b>' + (sum.qt_month || 0) + "</b><span>이번 달</span></div>" +
          '<div class="qt-stat"><b>' + (sum.bible_days || 0) + "</b><span>성경 읽은 날</span></div>" +
        "</div>" +
        '<p class="qt-cal-label">최근 한 달</p>' +
        '<div class="qt-cal">' + cells + "</div>" +
        (hist && hist.length
          ? '<p class="qt-cal-label" style="margin-top:22px">묵상한 큐티</p>' +
            '<ul class="qt-list">' + hist.slice(0, 12).map(function (q) {
              return "<li class=\"on\">" +
                '<span class="ql-date">' + esc(ymd(q.date)) + "</span>" +
                '<span class="ql-title">' + esc(q.title || "(제목 없음)") + "</span>" +
                '<span class="ql-ref">' + esc(q.scripture || "") + "</span></li>";
            }).join("") + "</ul>" +
            (hist.length > 12 ? '<p class="help" style="margin:8px 0 0">그 밖에 ' + (hist.length - 12) + "편이 더 있습니다.</p>" : "")
          : '<p class="help" style="margin-top:18px">아직 아멘 한 큐티가 없습니다.</p>') +

        /* 성경 66권 가운데 어디를 묵상했는가 */
        '<div class="bk-wrap">' +
          '<p class="bk-title">성경 66권 묵상 자취</p>' +
          (prog.unknown ? '<p class="help" style="margin:-8px 0 12px">본문 표기를 읽어 내지 못한 큐티 ' + prog.unknown + "편은 셈에서 뺐습니다.</p>" : "") +
          qtBookTable(prog.books) +
        "</div>" +
      "</div>";
  }

  /* ── 시작 ── */
  if (homeEl) {
    homeEl.innerHTML = '<div class="qt-card"><p class="qt-loading">오늘의 큐티를 불러오는 중…</p></div>';
    fetchQt(1).then(function (rows) {
      today = rows && rows[0];
      if (!today) { homeEl.innerHTML = ""; return; }
      drawHome();
      loadAmenState();
    }).catch(function (e) {
      homeEl.innerHTML = '<div class="qt-card"><p class="help">' + esc(e.message) + "</p></div>";
    });
  }

  window.__mountQt = function (root) {
    mineEl = root;
    if (!mineEl) return;
    mineEl.innerHTML = '<div class="fin-card"><p class="qt-loading">큐티 기록을 불러오는 중…</p></div>';
    Promise.all([
      rpc("my_faith_summary", { p_plan_year: null }),
      rpc("my_qt_history").catch(function () { return []; })
    ]).then(function (r) {
      drawMine(r[0] || {}, r[1] || []);
    }).catch(function (e) {
      mineEl.innerHTML = '<div class="fin-card"><h3 class="sub-title">큐티</h3><p class="help">' +
        esc(e.message) + "</p></div>";
    });
  };
})();
