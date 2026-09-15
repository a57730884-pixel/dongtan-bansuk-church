/* ============================================================
   동탄반석교회 — 화면에 올리는 내용 (설교 · 첫 화면 큰 제목)
   ------------------------------------------------------------
   · 읽기는 누구나. 로그인하지 않아도 설교 목록이 보인다.
   · 고치기는 최고관리자만. 버튼은 권한을 확인한 뒤에야 나타나고,
     실제 차단은 데이터베이스의 접근 규칙(supabase/08_content.sql)이 한다.
   · 설교 표 하나가 '이번 주 설교'와 '설교 아카이브', 그리고 첫 화면의
     설교 칸까지 함께 채운다. 같은 내용을 여러 곳에 적어 넣지 않기 위함이다.
   · 첫 화면 큰 제목(히어로)만은 설교와 따로 둔다. 시리즈 제목은
     설교 한 편보다 오래가기 때문이다.
   ============================================================ */
(function () {
  var SB = window.SUPABASE_URL || "";
  var AK = window.SUPABASE_ANON_KEY || "";
  var CH = window.CHURCH || {};
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  /* ── 데이터베이스 ─────────────────────────────────────── */
  function token() {
    if (window.__sbToken) return window.__sbToken;
    try {
      var ref = new URL(SB).hostname.split(".")[0];
      var raw = localStorage.getItem("sb-" + ref + "-auth-token");
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && (s.access_token || (s.currentSession && s.currentSession.access_token))) || null;
    } catch (e) { return null; }
  }
  function api(method, path, body, prefer) {
    var h = { apikey: AK, "Content-Type": "application/json" };
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    if (prefer) h.Prefer = prefer;
    var opt = { method: method, headers: h };
    if (body != null) opt.body = JSON.stringify(body);
    return fetch(SB + "/rest/v1/" + path, opt).then(function (r) {
      if (!r.ok) return r.text().then(function (t2) { throw new Error(friendly(t2, r.status)); });
      return r.status === 204 ? null : r.text().then(function (t2) { return t2 ? JSON.parse(t2) : null; });
    }, function () {
      // 연결 자체가 안 될 때 — 영어 오류를 그대로 보여 주지 않는다
      throw new Error("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    });
  }
  function rpc(fn, params) {
    return api("POST", "rpc/" + fn, params || {});
  }
  function friendly(raw, status) {
    if (/row-level security|permission denied/i.test(raw)) return "권한이 없습니다. 최고관리자만 고칠 수 있습니다.";
    if (/relation .* does not exist|schema cache/i.test(raw)) return "설교 표가 아직 없습니다. (관리자: supabase/08_content.sql 실행)";
    if (/sermons_one_featured/i.test(raw)) return "이번 주 설교는 한 편만 지정할 수 있습니다.";
    try { var j = JSON.parse(raw); if (j.message) return j.message; } catch (e) {}
    return raw || ("오류 " + status);
  }

  /* ── 작은 도구들 ──────────────────────────────────────── */
  // 유튜브 주소에서 영상 번호만 골라낸다 (watch · youtu.be · embed · shorts 모두)
  function youtubeId(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    var m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(u) ? u : "");
  }
  function ymd(d) {
    if (!d) return "";
    var s = String(d).slice(0, 10).split("-");
    return s.length === 3 ? s[0] + "." + s[1] + "." + s[2] : String(d);
  }
  // *별표* 사이를 굵고 크게. 강조 표시를 쓰는 곳은 첫 화면 제목뿐이다.
  function emphasize(text) {
    return esc(text).replace(/\*([^*]+)\*/g, '<span class="big">$1</span>');
  }
  function stripStars(text) { return String(text || "").replace(/\*/g, ""); }

  /* ── 모달 ────────────────────────────────────────────── */
  var modal = null;
  function openForm(opts) {
    closeForm();
    modal = document.createElement("div");
    modal.className = "modal edit-modal";
    modal.innerHTML =
      '<div class="modal-backdrop" data-x></div>' +
      '<div class="modal-box modal-box-edit" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
        '<button class="modal-close" data-x aria-label="닫기">&times;</button>' +
        '<h3 class="edit-title">' + esc(opts.title) + "</h3>" +
        '<form class="edit-form">' + opts.fields +
          '<p class="auth-msg" id="editMsg" hidden></p>' +
          '<div class="edit-actions">' +
            (opts.onDelete ? '<button type="button" class="edit-del" id="editDel">삭제</button>' : "") +
            '<span class="edit-spacer"></span>' +
            '<button type="button" class="btn btn-line" data-x>취소</button>' +
            '<button type="submit" class="btn btn-solid" id="editSave">저장</button>' +
          "</div>" +
        "</form>" +
      "</div>";
    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    Array.prototype.forEach.call(modal.querySelectorAll("[data-x]"), function (el) {
      el.addEventListener("click", closeForm);
    });
    document.addEventListener("keydown", escClose);

    var form = modal.querySelector(".edit-form");
    var msg = modal.querySelector("#editMsg");
    var save = modal.querySelector("#editSave");
    function show(t, ok) { msg.hidden = false; msg.textContent = t; msg.className = "auth-msg " + (ok ? "ok" : "err"); }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      save.disabled = true; show("저장하는 중…", true);
      Promise.resolve(opts.onSave(new FormData(form), modal))
        .then(function () { closeForm(); if (opts.after) opts.after(); })
        .catch(function (err) { show(err.message || "저장하지 못했습니다.", false); save.disabled = false; });
    });

    var del = modal.querySelector("#editDel");
    if (del) del.addEventListener("click", function () {
      if (!window.confirm("정말 지울까요? 되돌릴 수 없습니다.")) return;
      del.disabled = true; show("지우는 중…", true);
      Promise.resolve(opts.onDelete())
        .then(function () { closeForm(); if (opts.after) opts.after(); })
        .catch(function (err) { show(err.message || "지우지 못했습니다.", false); del.disabled = false; });
    });

    if (opts.ready) opts.ready(modal);
  }
  function closeForm() {
    if (!modal) return;
    modal.remove(); modal = null;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", escClose);
  }
  function escClose(e) { if (e.key === "Escape") closeForm(); }

  function field(label, name, type, value, extra) {
    return '<div class="form-field"><label>' + esc(label) + "</label>" +
      '<input type="' + type + '" name="' + name + '" value="' + esc(value || "") + '" ' + (extra || "") + " /></div>";
  }

  /* ============================================================
     ① 설교
     ============================================================ */
  var SERVICES = ["주일 낮 예배", "주일 오후 예배", "수요 기도회", "새벽 기도회", "특별집회"];
  var sermons = [];

  function loadSermons() {
    return api("GET", "sermons?select=*&order=preached_on.desc,id.desc&limit=200")
      .then(function (rows) { sermons = rows || []; return sermons; })
      .catch(function (e) { sermons = []; throw e; });
  }

  function sermonForm(s) {
    s = s || {};
    var today = new Date().toISOString().slice(0, 10);
    return '<div class="form-field"><label>예배 구분</label><select name="service">' +
        SERVICES.map(function (v) {
          return '<option value="' + esc(v) + '"' + ((s.service || "주일 낮 예배") === v ? " selected" : "") + ">" + esc(v) + "</option>";
        }).join("") +
      "</select></div>" +
      field("제목", "title", "text", s.title, 'required placeholder="반석 위에 지은 집"') +
      field("영문 제목 (없으면 비워 두세요)", "title_en", "text", s.title_en, 'placeholder="A House Built on the Rock"') +
      field("성경 본문", "ref", "text", s.ref, 'placeholder="마태복음 7:24–27"') +
      field("시리즈 (없으면 비워 두세요)", "series", "text", s.series, 'placeholder="마태복음 강해"') +
      field("설교자", "preacher", "text", s.preacher || (CH.pastor ? CH.pastor + " 목사" : ""), "") +
      field("설교 일자", "preached_on", "date", (s.preached_on || today).slice(0, 10), "required") +
      field("유튜브 주소", "video_url", "url", s.video_url, 'placeholder="https://www.youtube.com/watch?v=..."') +
      '<div class="form-field"><label>한 줄 요약 (없으면 비워 두세요)</label>' +
        '<textarea name="summary" rows="2" placeholder="말씀을 듣고 행하는 사람은…">' + esc(s.summary || "") + "</textarea></div>" +
      '<label class="auth-check"><input type="checkbox" name="featured"' + (s.is_featured ? " checked" : "") +
        " /> <span>이번 주 설교로 올립니다 <em>(말씀 페이지와 첫 화면 맨 위에 나옵니다)</em></span></label>";
  }

  function readSermon(fd) {
    var v = function (k) { return String(fd.get(k) || "").trim(); };
    return {
      service: v("service") || "주일 낮 예배",
      title: v("title"),
      title_en: v("title_en") || null,
      ref: v("ref") || null,
      series: v("series") || null,
      preacher: v("preacher") || null,
      preached_on: v("preached_on"),
      video_url: v("video_url") || null,
      summary: v("summary") || null,
      updated_at: new Date().toISOString()
    };
  }

  function editSermon(s, after) {
    openForm({
      title: s ? "설교 고치기" : "설교 추가하기",
      fields: sermonForm(s),
      onDelete: s ? function () { return api("DELETE", "sermons?id=eq." + s.id); } : null,
      after: after,
      onSave: function (fd) {
        var row = readSermon(fd);
        var wantFeatured = !!fd.get("featured");
        var p = s
          ? api("PATCH", "sermons?id=eq." + s.id, row, "return=representation")
          : api("POST", "sermons", row, "return=representation");
        return p.then(function (res) {
          var id = s ? s.id : (res && res[0] && res[0].id);
          if (wantFeatured && id) return rpc("set_featured_sermon", { p_id: id });
          if (!wantFeatured && s && s.is_featured) return api("PATCH", "sermons?id=eq." + s.id, { is_featured: false });
        });
      }
    });
  }

  /* ── 이번 주 설교 (말씀 페이지 · 첫 화면 공용) ── */
  function featured() {
    for (var i = 0; i < sermons.length; i++) if (sermons[i].is_featured) return sermons[i];
    return sermons[0] || null;
  }

  function mediaHTML(s) {
    var id = youtubeId(s && s.video_url);
    if (id) {
      return '<iframe src="https://www.youtube.com/embed/' + esc(id) + '" title="' + esc(s.title || "설교 영상") +
        '" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    }
    return '<div class="placeholder">유튜브 주소를 넣으면 이 자리에 재생 화면이 나옵니다.</div>';
  }

  function featureHTML(s, opts) {
    opts = opts || {};
    if (!s) {
      return '<div class="empty-card"><p>아직 등록된 설교가 없습니다.</p></div>';
    }
    var meta = [s.ref, s.preacher, ymd(s.preached_on)].filter(Boolean).join(" · ");
    return '<div class="feature">' +
      '<div class="feature-media">' + mediaHTML(s) + "</div>" +
      '<div class="feature-info">' +
        '<p class="cat">' + esc(s.service || "") + (s.series ? " · " + esc(s.series) : "") + "</p>" +
        "<h3>" + esc(s.title) + "</h3>" +
        (s.title_en ? '<p class="en">' + esc(s.title_en) + "</p>" : "") +
        (meta ? '<p class="ref">' + esc(meta) + "</p>" : "") +
        (s.summary ? "<blockquote>" + esc(s.summary) + "</blockquote>" : "") +
        (opts.more ? '<p style="margin-top:20px"><a class="btn btn-line" href="word.html">설교 다시 보기</a></p>' : "") +
      "</div></div>";
  }

  function cardHTML(s) {
    var id = youtubeId(s.video_url);
    var thumb = id
      ? '<div class="card-thumb has-img"><img src="https://i.ytimg.com/vi/' + esc(id) + '/hqdefault.jpg" alt="" loading="lazy" /></div>'
      : '<div class="card-thumb">설교 영상</div>';
    var inner =
      '<div class="card-body">' +
        '<span class="card-tag">' + esc(s.service || "") + "</span>" +
        "<h3>" + esc(s.title) + "</h3>" +
        (s.title_en ? '<p class="en">' + esc(s.title_en) + "</p>" : "") +
        (s.ref ? "<p>" + esc(s.ref) + "</p>" : "") +
        '<p class="card-meta">' + esc(ymd(s.preached_on)) + (s.preacher ? " · " + esc(s.preacher) : "") + "</p>" +
      "</div>";
    var body = thumb + inner;
    return s.video_url
      ? '<a class="card" href="' + esc(s.video_url) + '" target="_blank" rel="noopener" data-id="' + s.id + '">' + body + "</a>"
      : '<article class="card" data-id="' + s.id + '">' + body + "</article>";
  }

  /* ============================================================
     ② 첫 화면 큰 제목
     ============================================================ */
  var hero = null;
  function loadHero() {
    return api("GET", "site_hero?id=eq.1&select=*").then(function (rows) {
      hero = (rows && rows[0]) || null;
      return hero;
    });
  }

  function paintHero(h) {
    if (!h) return;
    var series = document.querySelector(".hero-series");
    var h1 = document.querySelector(".hero h1");
    var en = document.querySelector(".hero-en");
    if (series && h.series) series.textContent = String(h.series).split("").join("/");
    if (h1) {
      h1.innerHTML = emphasize(h.line1 || "") +
        (h.ref ? '<span class="ref">' + esc(h.ref) + "</span>" : "") +
        (h.line2 ? '<span class="l2">' + emphasize(h.line2) + "</span>" : "");
    }
    if (en) en.textContent = h.subtitle_en || "";
    document.title = document.title; // 제목은 건드리지 않는다
  }

  function heroForm(h) {
    h = h || {};
    return '<p class="edit-help">제목에서 <b>크게 보이게 할 말</b>은 별표로 감싸 주세요. ' +
        '예) <code>나는 *반석* 위에</code> → 나는 <b>반석</b> 위에</p>' +
      field("시리즈", "series", "text", h.series, 'placeholder="마태복음 강해"') +
      field("제목 첫째 줄", "line1", "text", h.line1, 'required placeholder="나는 *반석* 위에"') +
      field("제목 둘째 줄 (없으면 비워 두세요)", "line2", "text", h.line2, 'placeholder="*집을 짓는* 사람"') +
      field("성경 본문", "ref", "text", h.ref, 'placeholder="마 7:24–27"') +
      field("영문 한 줄", "subtitle_en", "text", h.subtitle_en, 'placeholder="I Build My House upon the Rock"') +
      '<div class="hero-preview" id="heroPreview"><span class="hp-label">미리 보기</span><div class="hp-box"></div></div>';
  }

  function editHero(after) {
    openForm({
      title: "첫 화면 편집",
      fields: heroForm(hero),
      after: after,
      ready: function (m) {
        var box = m.querySelector("#heroPreview .hp-box");
        var f = m.querySelector(".edit-form");
        function draw() {
          var g = function (n) { return (f.querySelector('[name="' + n + '"]') || {}).value || ""; };
          box.innerHTML =
            '<p class="hp-series">' + esc(g("series").split("").join("/")) + "</p>" +
            '<p class="hp-h1">' + emphasize(g("line1")) +
              (g("ref") ? '<span class="hp-ref">' + esc(g("ref")) + "</span>" : "") +
              (g("line2") ? '<span class="hp-l2">' + emphasize(g("line2")) + "</span>" : "") + "</p>" +
            (g("subtitle_en") ? '<p class="hp-en">' + esc(g("subtitle_en")) + "</p>" : "");
        }
        f.addEventListener("input", draw);
        draw();
      },
      onSave: function (fd) {
        var v = function (k) { return String(fd.get(k) || "").trim(); };
        var row = {
          id: 1, series: v("series") || null, line1: v("line1"), line2: v("line2") || null,
          ref: v("ref") || null, subtitle_en: v("subtitle_en") || null, updated_at: new Date().toISOString()
        };
        return api("POST", "site_hero", row, "resolution=merge-duplicates,return=minimal");
      }
    });
  }

  /* ============================================================
     ③ 화면에 붙이기
     ============================================================ */
  var isAdmin = false;
  function adminBtn(label, onClick, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "admin-btn" + (cls ? " " + cls : "");
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function renderWordPage() {
    var featRoot = document.getElementById("featuredRoot");
    var arcRoot = document.getElementById("archiveRoot");
    if (!featRoot && !arcRoot) return;
    if (featRoot) featRoot.innerHTML = featureHTML(featured());
    if (arcRoot) {
      var rest2 = sermons.filter(function (s) { var f = featured(); return !f || s.id !== f.id; });
      arcRoot.innerHTML = rest2.length
        ? rest2.map(cardHTML).join("")
        : '<div class="empty-card" style="grid-column:1/-1"><p>아직 쌓인 설교가 없습니다.</p></div>';
      if (isAdmin) addCardTools(arcRoot, rest2);
    }
    if (isAdmin) addFeaturedTools(featRoot);
  }

  function addFeaturedTools(root) {
    if (!root) return;
    var f = featured();
    if (!f) return;
    var wrap = document.createElement("div");
    wrap.className = "admin-row";
    wrap.appendChild(adminBtn("이번 주 설교 고치기", function () { editSermon(f, refreshAll); }));
    root.appendChild(wrap);
  }

  function addCardTools(root, list) {
    list.forEach(function (s) {
      var el = root.querySelector('[data-id="' + s.id + '"]');
      if (!el) return;
      var t = adminBtn("고치기", function (e) {
        e.preventDefault(); e.stopPropagation();
        editSermon(s, refreshAll);
      }, "card-edit");
      el.style.position = "relative";
      el.appendChild(t);
    });
  }

  function mountAdminBars() {
    if (!isAdmin) return;
    // 말씀 페이지 — 설교 추가
    var slot = document.getElementById("thisActions");
    if (slot && !slot.querySelector(".admin-btn")) {
      slot.appendChild(adminBtn("＋ 설교 추가하기", function () { editSermon(null, refreshAll); }, "primary"));
    }
    // 첫 화면 — 히어로 편집
    var heroSlot = document.getElementById("heroEdit");
    if (heroSlot && !heroSlot.querySelector(".admin-btn")) {
      heroSlot.appendChild(adminBtn("✎ 첫 화면 편집하기", function () {
        editHero(function () { loadHero().then(paintHero); });
      }, "on-hero"));
    }
  }

  function refreshAll() {
    return loadSermons().then(function () {
      renderWordPage();
      var home = document.getElementById("homeFeature");
      if (home) {
        home.innerHTML = featureHTML(featured(), { more: true });
        if (isAdmin) {
          var wrap = document.createElement("div");
          wrap.className = "admin-row";
          var f = featured();
          wrap.appendChild(adminBtn(f ? "이번 주 설교 고치기" : "＋ 설교 추가하기", function () { editSermon(f, refreshAll); }));
          home.appendChild(wrap);
        }
      }
    }).catch(function (e) {
      var msg = '<div class="empty-card"><p>' + esc(e.message) + "</p></div>";
      ["featuredRoot", "homeFeature", "archiveRoot"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = msg;
      });
    });
  }

  /* 다른 화면에서도 부를 수 있게 열어 둔다 */
  // 편집 모달은 공지사항·앨범도 함께 씁니다(js/notices.js, js/album.js)
  window.__openEditForm = openForm;
  window.__closeEditForm = closeForm;

  window.CONTENT = {
    editSermon: function (s) { editSermon(s || null, refreshAll); },
    editHero: function () { editHero(function () { loadHero().then(paintHero); }); },
    refresh: refreshAll,
    sermons: function () { return sermons.slice(); }
  };

  /* ── 시작 ── */
  if (!SB || !AK) return;   // Supabase 설정 전에는 원래 화면을 그대로 둔다

  if (document.querySelector(".hero h1")) loadHero().then(paintHero).catch(function () {});
  // 설교 자리가 있는 화면에서만 설교를 부른다(공지·앨범 화면은 편집 모달만 빌려 쓴다)
  if (document.getElementById("featuredRoot") || document.getElementById("homeFeature") ||
      document.getElementById("archiveRoot")) refreshAll();

  document.addEventListener("perm-ready", function (e) {
    var was = isAdmin;
    isAdmin = !!(e.detail && e.detail.isAdmin);
    if (!isAdmin || was) return;
    mountAdminBars();
    renderWordPage();
    var home = document.getElementById("homeFeature");
    if (home) refreshAll();
  });
})();
