/* ============================================================
   동탄반석교회 — 공지사항
   ------------------------------------------------------------
   읽기는 누구나, 쓰기는 최고관리자만. 차단은 화면이 아니라
   데이터베이스의 접근 규칙(supabase/11_album_notices.sql)이 한다.
   목록은 news.html(전체)과 index.html(최근 넷) 두 곳이 함께 쓴다.
   ============================================================ */
(function () {
  var SB = window.SUPABASE_URL || "", AK = window.SUPABASE_ANON_KEY || "";
  var listEl = document.getElementById("noticeList");
  var homeEl = document.getElementById("homeNotices");
  if (!SB || !AK || (!listEl && !homeEl)) return;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  function ymd(d) { var s = String(d || "").slice(0, 10).split("-"); return s.length === 3 ? s.join(".") : ""; }

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
    var t = token(); if (t) h.Authorization = "Bearer " + t;
    if (prefer) h.Prefer = prefer;
    var o = { method: method, headers: h };
    if (body != null) o.body = JSON.stringify(body);
    return fetch(SB + "/rest/v1/" + path, o).then(function (r) {
      if (!r.ok) return r.text().then(function (x) {
        if (/relation .* does not exist|schema cache/i.test(x)) throw new Error("공지사항 표가 아직 없습니다. (관리자: supabase/11_album_notices.sql 실행)");
        if (/row-level security|permission denied/i.test(x)) throw new Error("최고관리자만 고칠 수 있습니다.");
        throw new Error(x || "요청이 거부되었습니다.");
      });
      return r.status === 204 ? null : r.text().then(function (x) { return x ? JSON.parse(x) : null; });
    }, function () { throw new Error("서버에 연결하지 못했습니다."); });
  }

  var KINDS = ["공지", "소식", "행사"];
  var rows = [], isAdmin = false;

  function load() {
    var q = "notices?select=*&order=pinned.desc,published_on.desc,id.desc&limit=" + (listEl ? 100 : 4);
    return api("GET", q).then(function (r) { rows = r || []; draw(); })
      .catch(function (e) { fail(e.message); });
  }
  function fail(msg) {
    var m = '<p class="help" style="padding:18px 0">' + esc(msg) + "</p>";
    if (listEl) listEl.innerHTML = m;
    if (homeEl) homeEl.innerHTML = m;
  }

  function itemHTML(n, admin) {
    return '<div class="list-item" data-id="' + n.id + '">' +
      '<span class="li-tag">' + esc(n.kind || "공지") + "</span>" +
      '<span class="li-title">' + (n.pinned ? '<em class="li-pin">고정</em> ' : "") + esc(n.title) + "</span>" +
      (admin ? '<button type="button" class="admin-btn nt-edit">고치기</button>' : "") +
      '<span class="li-date">' + esc(ymd(n.published_on)) + "</span>" +
      (n.body ? '<p class="li-body">' + esc(n.body) + "</p>" : "") +
      "</div>";
  }

  function draw() {
    if (homeEl) {
      homeEl.innerHTML = rows.length
        ? rows.slice(0, 4).map(function (n) { return itemHTML(n, false); }).join("")
        : '<p class="help" style="padding:18px 0">아직 등록된 공지가 없습니다.</p>';
    }
    if (listEl) {
      listEl.innerHTML = rows.length
        ? rows.map(function (n) { return itemHTML(n, isAdmin); }).join("")
        : '<p class="help" style="padding:18px 0">아직 등록된 공지가 없습니다.</p>';
      if (isAdmin) {
        Array.prototype.forEach.call(listEl.querySelectorAll(".nt-edit"), function (b) {
          b.addEventListener("click", function () {
            var id = +b.parentNode.getAttribute("data-id");
            edit(rows.filter(function (x) { return x.id === id; })[0]);
          });
        });
      }
    }
  }

  /* ── 쓰기(최고관리자) ── */
  function edit(n) {
    if (!window.__openEditForm) return;
    n = n || {};
    var today = new Date().toISOString().slice(0, 10);
    window.__openEditForm({
      title: n.id ? "공지 고치기" : "공지 올리기",
      fields:
        '<div class="form-field"><label>구분</label><select name="kind">' +
          KINDS.map(function (k) {
            return '<option value="' + k + '"' + ((n.kind || "공지") === k ? " selected" : "") + ">" + k + "</option>";
          }).join("") + "</select></div>" +
        '<div class="form-field"><label>제목</label><input type="text" name="title" required value="' + esc(n.title || "") + '" /></div>' +
        '<div class="form-field"><label>내용 (없으면 비워 두세요)</label><textarea name="body" rows="5">' + esc(n.body || "") + "</textarea></div>" +
        '<div class="form-field"><label>날짜</label><input type="date" name="published_on" required value="' + esc((n.published_on || today).slice(0, 10)) + '" /></div>' +
        '<label class="auth-check"><input type="checkbox" name="pinned"' + (n.pinned ? " checked" : "") + " /> <span>맨 위에 고정합니다</span></label>",
      onDelete: n.id ? function () { return api("DELETE", "notices?id=eq." + n.id); } : null,
      after: load,
      onSave: function (fd) {
        var v = function (k) { return String(fd.get(k) || "").trim(); };
        var row = {
          kind: v("kind") || "공지", title: v("title"), body: v("body") || null,
          published_on: v("published_on"), pinned: !!fd.get("pinned"),
          author: (window.CHURCH && window.CHURCH.pastor) || null,
          updated_at: new Date().toISOString()
        };
        return n.id ? api("PATCH", "notices?id=eq." + n.id, row) : api("POST", "notices", row);
      }
    });
  }

  document.addEventListener("perm-ready", function (e) {
    if (!e.detail || !e.detail.isAdmin || isAdmin) return;
    isAdmin = true;
    draw();
    var slot = document.getElementById("noticeActions");
    if (slot && !slot.querySelector(".admin-btn")) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "admin-btn primary"; b.textContent = "＋ 공지 올리기";
      b.addEventListener("click", function () { edit(null); });
      slot.appendChild(b);
    }
  });

  load();
})();
