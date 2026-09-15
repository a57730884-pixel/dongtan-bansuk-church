/* ============================================================
   동탄반석교회 — 앨범
   ------------------------------------------------------------
   · 함께 보는 자리이므로 성도 누구나 올립니다. 다만 올리려면 로그인해야
     합니다 — 누가 올렸는지 남지 않는 사진은 아무도 책임지지 않게 됩니다.
   · 보는 것은 누구나. 좋아요는 로그인한 분만.
   · 지우는 것은 올린 본인과 최고관리자입니다.
   · 사진은 격자로 늘어놓고(표지 한 장), 누르면 그 묶음의 사진을
     한 장씩 넘겨 봅니다.
   ============================================================ */
(function () {
  var SB = window.SUPABASE_URL || "", AK = window.SUPABASE_ANON_KEY || "";
  var grid = document.getElementById("albumGrid");
  if (!SB || !AK || !grid) return;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  function ymd(d) { var s = String(d || "").slice(0, 10).split("-"); return s.length === 3 ? s.join(".") : ""; }

  function session() {
    try {
      var ref = new URL(SB).hostname.split(".")[0];
      var raw = localStorage.getItem("sb-" + ref + "-auth-token");
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && s.currentSession) ? s.currentSession : s;
    } catch (e) { return null; }
  }
  function me() { var s = session(); return (s && s.user) || null; }
  function token() { var s = session(); return window.__sbToken || (s && s.access_token) || null; }

  function api(method, path, body, prefer) {
    var h = { apikey: AK, "Content-Type": "application/json" };
    var t = token(); if (t) h.Authorization = "Bearer " + t;
    if (prefer) h.Prefer = prefer;
    var o = { method: method, headers: h };
    if (body != null) o.body = JSON.stringify(body);
    return fetch(SB + "/rest/v1/" + path, o).then(function (r) {
      if (!r.ok) return r.text().then(function (x) {
        if (/relation .* does not exist|schema cache|Could not find the function/i.test(x)) {
          throw new Error("앨범 표가 아직 없습니다. (관리자: supabase/11_album_notices.sql 실행)");
        }
        if (/row-level security|permission denied/i.test(x)) throw new Error("권한이 없습니다.");
        throw new Error(x || "요청이 거부되었습니다.");
      });
      return r.status === 204 ? null : r.text().then(function (x) { return x ? JSON.parse(x) : null; });
    }, function () { throw new Error("서버에 연결하지 못했습니다."); });
  }

  var feed = [];

  function load() {
    return api("POST", "rpc/album_feed", { p_limit: 60, p_offset: 0 })
      .then(function (r) { feed = r || []; draw(); })
      .catch(function (e) {
        grid.innerHTML = '<p class="help" style="grid-column:1/-1;padding:18px 0">' + esc(e.message) + "</p>";
      });
  }

  function draw() {
    if (!feed.length) {
      grid.innerHTML = '<div class="al-empty"><p>아직 올라온 사진이 없습니다.</p>' +
        "<p>교회 행사 사진을 올려 함께 나눠 주세요.</p></div>";
      return;
    }
    grid.innerHTML = feed.map(function (p) {
      return '<button type="button" class="al-tile" data-id="' + p.id + '">' +
          (p.cover
            ? '<img src="' + esc(p.cover) + '" alt="' + esc(p.title) + '" loading="lazy" />'
            : '<span class="al-nopic">사진 없음</span>') +
          (p.photos > 1 ? '<span class="al-multi" aria-hidden="true">' + p.photos + "장</span>" : "") +
          '<span class="al-cap">' +
            '<span class="al-cap-title">' + esc(p.title) + "</span>" +
            '<span class="al-cap-meta">' + esc(ymd(p.taken_on)) +
              (p.likes ? ' · ♥ ' + p.likes : "") + "</span>" +
          "</span>" +
        "</button>";
    }).join("");
    Array.prototype.forEach.call(grid.querySelectorAll(".al-tile"), function (b) {
      b.addEventListener("click", function () { open(+b.getAttribute("data-id")); });
    });
  }

  /* ── 한 묶음 펼쳐 보기 ── */
  var viewer = null, cur = null, idx = 0, photos = [];

  function open(id) {
    cur = feed.filter(function (p) { return p.id === id; })[0];
    if (!cur) return;
    idx = 0;
    mountViewer();
    api("GET", "album_photos?post_id=eq." + id + "&select=id,url&order=sort,id")
      .then(function (r) { photos = r || []; paint(); })
      .catch(function (e) { photos = []; paint(e.message); });
  }

  function mountViewer() {
    close();
    viewer = document.createElement("div");
    viewer.className = "al-viewer";
    viewer.innerHTML = '<div class="al-backdrop" data-x></div><div class="al-box" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(viewer);
    document.body.style.overflow = "hidden";
    viewer.querySelector("[data-x]").addEventListener("click", close);
    document.addEventListener("keydown", keys);
  }
  function close() {
    if (!viewer) return;
    viewer.remove(); viewer = null; photos = []; cur = null;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", keys);
  }
  function keys(e) {
    if (!viewer) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") move(1);
    if (e.key === "ArrowLeft") move(-1);
  }
  function move(d) {
    if (!photos.length) return;
    idx = (idx + d + photos.length) % photos.length;
    paint();
  }

  function paint(err) {
    if (!viewer || !cur) return;
    var box = viewer.querySelector(".al-box");
    var p = photos[idx];
    var canDel = cur.mine || (window.__perm && window.__perm.isAdmin);
    box.innerHTML =
      '<button type="button" class="al-close" data-x aria-label="닫기">&times;</button>' +
      '<div class="al-stage">' +
        (err ? '<p class="al-err">' + esc(err) + "</p>"
             : (p ? '<img src="' + esc(p.url) + '" alt="' + esc(cur.title) + '" />'
                  : '<p class="al-err">사진을 불러오는 중…</p>')) +
        (photos.length > 1
          ? '<button type="button" class="al-nav prev" aria-label="이전 사진">‹</button>' +
            '<button type="button" class="al-nav next" aria-label="다음 사진">›</button>' +
            '<span class="al-count">' + (idx + 1) + " / " + photos.length + "</span>"
          : "") +
      "</div>" +
      '<div class="al-info">' +
        "<h3>" + esc(cur.title) + "</h3>" +
        '<p class="al-meta">' + esc(ymd(cur.taken_on)) + " · " + esc(cur.author || "성도") + "</p>" +
        (cur.content ? '<p class="al-text">' + esc(cur.content) + "</p>" : "") +
        '<div class="al-acts">' +
          '<button type="button" class="al-like' + (cur.liked ? " on" : "") + '" id="alLike">' +
            '<span class="al-heart">' + (cur.liked ? "♥" : "♡") + "</span>" +
            '<span class="al-likes">' + (cur.likes || 0) + "</span>" +
          "</button>" +
          (canDel ? '<button type="button" class="al-del" id="alDel">지우기</button>' : "") +
        "</div>" +
      "</div>";

    var prev = box.querySelector(".al-nav.prev"), next = box.querySelector(".al-nav.next");
    if (prev) prev.onclick = function () { move(-1); };
    if (next) next.onclick = function () { move(1); };
    box.querySelector("[data-x]").onclick = close;
    box.querySelector("#alLike").onclick = like;
    var del = box.querySelector("#alDel");
    if (del) del.onclick = remove;
  }

  /* ── 좋아요 ── */
  function like() {
    var u = me();
    if (!u) {
      if (window.__openAuthView) window.__openAuthView("login");
      else window.alert("좋아요를 누르시려면 로그인해 주세요.");
      return;
    }
    var want = !cur.liked;
    cur.liked = want;
    cur.likes = Math.max(0, (cur.likes || 0) + (want ? 1 : -1));
    paint();
    var p = want
      ? api("POST", "album_likes", { post_id: cur.id, user_id: u.id }, "return=minimal")
      : api("DELETE", "album_likes?post_id=eq." + cur.id + "&user_id=eq." + u.id);
    p.catch(function (e) {
      cur.liked = !want;
      cur.likes = Math.max(0, (cur.likes || 0) + (want ? -1 : 1));
      paint(e.message);
    }).then(draw);
  }

  /* ── 지우기 ── */
  function remove() {
    if (!window.confirm('"' + cur.title + '" 묶음을 지웁니다. 사진이 모두 사라지며 되돌릴 수 없습니다.')) return;
    var id = cur.id;
    api("DELETE", "album_posts?id=eq." + id).then(function () {
      feed = feed.filter(function (x) { return x.id !== id; });
      close(); draw();
    }).catch(function (e) { window.alert("지우지 못했습니다.\n" + e.message); });
  }

  /* ── 올리기 ── */
  function upload() {
    var u = me();
    if (!u) {
      if (window.__openAuthView) window.__openAuthView("login");
      else window.alert("사진을 올리시려면 로그인해 주세요.");
      return;
    }
    if (!window.__openEditForm) return;
    var today = new Date().toISOString().slice(0, 10);
    var meta = u.user_metadata || {};
    var name = meta.name || meta.full_name || (u.email ? u.email.split("@")[0] : "성도");

    window.__openEditForm({
      title: "사진 올리기",
      fields:
        '<p class="edit-help">한 번에 여러 장을 고르실 수 있습니다. 사진은 올리기 전에 자동으로 줄여 저장합니다.</p>' +
        '<div class="form-field"><label>제목</label><input type="text" name="title" required placeholder="여름 성경학교" /></div>' +
        '<div class="form-field"><label>날짜</label><input type="date" name="taken_on" required value="' + today + '" /></div>' +
        '<div class="form-field"><label>한 줄 설명 (없으면 비워 두세요)</label><input type="text" name="content" /></div>' +
        '<div class="form-field"><label>사진</label><input type="file" name="files" accept="image/*" multiple required /></div>' +
        '<p class="al-progress" id="alProg" hidden></p>',
      after: load,
      onSave: function (fd, modal) {
        var files = Array.prototype.slice.call(modal.querySelector('input[name="files"]').files || []);
        if (!files.length) throw new Error("사진을 한 장 이상 골라 주세요.");
        if (!(window.ChurchUpload && window.ChurchUpload.isReady())) throw new Error("사진 저장소 설정이 아직입니다.");
        var prog = modal.querySelector("#alProg");
        prog.hidden = false;

        var done = 0;
        function step() { done++; prog.textContent = "사진 올리는 중… " + done + " / " + files.length; }
        prog.textContent = "사진 올리는 중… 0 / " + files.length;

        // 한 장씩 차례로 — 한꺼번에 보내면 휴대폰에서 자주 끊긴다
        var uploaded = [];
        var chain = files.reduce(function (acc, f) {
          return acc.then(function () {
            return window.ChurchUpload.upload(f, { folder: "album", compress: true })
              .then(function (r) { uploaded.push(r); step(); });
          });
        }, Promise.resolve());

        return chain.then(function () {
          prog.textContent = "저장하는 중…";
          return api("POST", "album_posts", {
            user_id: u.id,
            author_name: name,
            title: String(fd.get("title") || "").trim(),
            content: String(fd.get("content") || "").trim() || null,
            taken_on: String(fd.get("taken_on") || today)
          }, "return=representation");
        }).then(function (res) {
          var post = res && res[0];
          if (!post) throw new Error("저장하지 못했습니다.");
          return api("POST", "album_photos", uploaded.map(function (r, i) {
            return { post_id: post.id, url: r.url, storage_key: r.key, sort: i };
          }), "return=minimal");
        });
      }
    });
  }

  var btn = document.getElementById("albumUpload");
  if (btn) btn.addEventListener("click", upload);

  load();
})();
