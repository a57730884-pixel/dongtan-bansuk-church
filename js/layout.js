/* ============================================================
   동탄반석교회 — 공통 레이아웃 (모든 페이지가 이 파일 하나를 씁니다)
   헤더(대메뉴+하위메뉴) · 푸터 · 로그인 모달 · 모바일 하단 고정바 주입
   ------------------------------------------------------------
   설계 원칙(설계서 5.1): 연세 드신 성도도 "두 번 안에" 목적지에 닿도록
   메뉴를 얕게 두고, 휴대폰에서는 하단 고정바로 네 곳만 크게 보여 줍니다.
   ============================================================ */
(function () {
  var CH = window.CHURCH || {};

  var NAV = [
    { href: "about.html", label: "교회 소개", sub: [
      { href: "about.html#greeting", label: "인사말" },
      { href: "about.html#worship", label: "예배 안내" },
      { href: "about.html#directions", label: "오시는 길" },
      { href: "about.html#history", label: "교회 연혁" }
    ] },
    { href: "word.html", label: "말씀", sub: [
      { href: "word.html#this", label: "이번 주 설교" },
      { href: "word.html#archive", label: "설교 아카이브" },
      { href: "word.html#bulletin", label: "주보" }
    ] },
    { href: "praise.html", label: "찬양", sub: [
      { href: "praise.html#choir", label: "찬양대" },
      { href: "praise.html#solo", label: "독창자 · 특송" }
    ] },
    { href: "news.html", label: "교회 소식", sub: [
      { href: "news.html#notice", label: "공지사항" },
      { href: "news.html#album", label: "앨범" },
      { href: "news.html#contact", label: "문의 · 새가족" }
    ] },
    { href: "mypage.html", label: "나의 기록", memberOnly: true },
    { href: "gyojeok.html", label: "교회 행정", adminOnly: true, sub: [
      { href: "gyojeok.html", label: "교적관리" },
      { href: "finance.html", label: "재정관리" }
    ] }
  ];

  var path = location.pathname.split("/").pop() || "index.html";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  /* ===== 헤더 ===== */
  var navLinks = NAV.map(function (n) {
    var active = path === n.href.split("#")[0] ? ' class="active"' : "";
    var attr = n.adminOnly ? ' id="navAdmin" hidden' : (n.memberOnly ? ' id="navMember" hidden' : "");
    if (!n.sub) return '<div class="nav-item"' + attr + '><a href="' + n.href + '"' + active + ">" + n.label + "</a></div>";
    var subs = n.sub.map(function (s) { return '<a href="' + s.href + '">' + s.label + "</a>"; }).join("");
    return '<div class="nav-item has-sub"' + attr + '>' +
      '<a href="' + n.href + '"' + active + ">" + n.label + '<span class="nav-caret" aria-hidden="true">⌄</span></a>' +
      '<div class="nav-dropdown"><div class="nav-dropdown-inner">' + subs + "</div></div></div>";
  }).join("");

  document.body.insertAdjacentHTML("afterbegin",
    '<header id="header">' +
      '<div class="nav-inner">' +
        '<a href="index.html" class="logo">' +
          '<img class="logo-mark" src="images/logo.svg" alt="" />' +
          '<span class="logo-kr">' + esc(CH.name || "교회") + "</span>" +
        "</a>" +
        '<nav class="nav-menu" id="navMenu">' + navLinks + "</nav>" +
        '<div class="auth-slot" id="authSlot"></div>' +
        '<button class="nav-toggle" id="navToggle" aria-label="메뉴 열기"><span></span><span></span><span></span></button>' +
      "</div>" +
    "</header>");

  /* ===== 푸터 · 모달 · 하단바 ===== */
  var acct = CH.account || {};
  var footerHTML =
    '<footer class="footer">' +
      '<div class="container footer-inner">' +
        '<div class="footer-brand"><img class="logo-mark" src="images/logo.svg" alt="" /><div><span class="logo-kr">' + esc(CH.name || "") + "</span>" +
          '<span class="logo-en">' + esc(CH.nameEn || "") + "</span></div></div>" +
        '<nav class="footer-nav">' +
          NAV.filter(function (n) { return !n.adminOnly && !n.memberOnly; })
             .map(function (n) { return '<a href="' + n.href + '">' + n.label + "</a>"; }).join("") +
          '<a href="privacy.html">개인정보처리방침</a><a href="terms.html">이용약관</a>' +
        "</nav>" +
        '<div class="footer-actions">' +
          (window.KAKAO_CHANNEL_ID ? '<a class="kakao-channel-btn" href="https://pf.kakao.com/' + esc(window.KAKAO_CHANNEL_ID) + '" target="_blank" rel="noopener">카카오톡 채널 추가</a>' : "") +
          (acct.no ? '<button type="button" class="give-btn" id="giveOnlineBtn">온라인 헌금</button>' : "") +
        "</div>" +
        '<div class="footer-meta">' +
          "<p>담임목사 " + esc(CH.pastor || "") + "</p>" +
          "<p>" + esc(CH.address || "") + (CH.phone ? ' · T. <a href="tel:' + esc(CH.phone) + '">' + esc(CH.phone) + "</a>" : "") + "</p>" +
          '<p class="copy">© ' + new Date().getFullYear() + " " + esc(CH.name || "") + ". All rights reserved.</p>" +
        "</div>" +
      "</div>" +
    "</footer>" +

    /* 모바일 하단 고정바 — 말씀 · 소식 · 나의 기록 · 로그인 */
    '<nav class="tabbar" id="tabbar">' +
      '<a href="word.html"><span class="tb-ico">📖</span>말씀</a>' +
      '<a href="news.html"><span class="tb-ico">🔔</span>소식</a>' +
      '<a href="mypage.html"><span class="tb-ico">🙏</span>나의 기록</a>' +
      '<button type="button" id="tabLogin"><span class="tb-ico">👤</span><span id="tabLoginLabel">로그인</span></button>' +
    "</nav>" +

    /* 맨 위로 */
    '<button class="to-top" id="toTop" aria-label="맨 위로">↑</button>' +

    /* 로그인 · 회원가입 모달 */
    '<div class="modal" id="authModal" hidden>' +
      '<div class="modal-backdrop" data-close></div>' +
      '<div class="modal-box modal-box-auth" role="dialog" aria-modal="true" aria-label="로그인">' +
        '<button class="modal-close" data-close aria-label="닫기">&times;</button>' +
        '<div class="auth-head"><h3 id="authTitle">로그인</h3>' +
          '<p id="authSubtitle">' + esc(CH.name || "") + " 성도 공간입니다.</p></div>" +
        '<form id="authForm" class="auth-form">' +
          '<div class="form-field" id="nameField" hidden><label>이름</label><input type="text" name="name" placeholder="홍길동" /></div>' +
          '<div class="form-field"><label>이메일</label><input type="email" name="email" required placeholder="name@example.com" /></div>' +
          '<div class="form-field"><label>비밀번호</label><input type="password" name="password" id="authPassword" required minlength="6" placeholder="비밀번호" /></div>' +
          '<label class="auth-check" id="termsField" hidden><input type="checkbox" name="terms" /> <span><a href="terms.html" target="_blank" rel="noopener">이용약관</a>과 <a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>에 동의합니다 <em>(필수)</em></span></label>' +
          '<p class="auth-msg" id="authMsg" hidden></p>' +
          '<button type="submit" class="btn btn-solid auth-submit" id="authSubmit">로그인</button>' +
        "</form>" +
        '<p class="auth-forgot" id="authForgotWrap"><button type="button" id="authForgot">비밀번호를 잊으셨나요?</button></p>' +
        '<p class="auth-switch">처음이신가요? <button type="button" id="authToggle">회원가입</button></p>' +
      "</div>" +
    "</div>" +

    /* 온라인 헌금 모달 */
    (acct.no ?
    '<div class="modal" id="giveModal" hidden>' +
      '<div class="modal-backdrop" data-give-close></div>' +
      '<div class="modal-box" role="dialog" aria-modal="true" aria-label="온라인 헌금">' +
        '<button class="modal-close" data-give-close aria-label="닫기">&times;</button>' +
        "<h3>온라인 헌금</h3><p>정성을 다해 드리는 헌금에 감사드립니다.</p>" +
        '<div class="give-acct"><span class="give-bank">' + esc(acct.bank || "") + '</span>' +
          '<span class="give-no">' + esc(acct.no) + '</span>' +
          '<span class="give-holder">예금주 · ' + esc(acct.holder || CH.name || "") + "</span></div>" +
        '<button type="button" class="btn btn-line" id="giveCopyBtn">계좌번호 복사</button>' +
      "</div>" +
    "</div>" : "");

  document.body.insertAdjacentHTML("beforeend", footerHTML);

  /* ===== 온라인 헌금 모달 ===== */
  (function () {
    var btn = document.getElementById("giveOnlineBtn"), m = document.getElementById("giveModal");
    if (!btn || !m) return;
    btn.addEventListener("click", function () { m.hidden = false; document.body.style.overflow = "hidden"; });
    Array.prototype.forEach.call(m.querySelectorAll("[data-give-close]"), function (el) {
      el.addEventListener("click", function () { m.hidden = true; document.body.style.overflow = ""; });
    });
    var copy = document.getElementById("giveCopyBtn");
    if (copy) copy.addEventListener("click", function () {
      var no = String((CH.account || {}).no || "").replace(/[^0-9]/g, "");
      var done = function () { var o = copy.textContent; copy.textContent = "✓ 복사되었습니다"; setTimeout(function () { copy.textContent = o; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(no).then(done, function () { window.prompt("계좌번호를 복사하세요", no); });
      else window.prompt("계좌번호를 복사하세요", no);
    });
  })();

  /* ===== 맨 위로 버튼 ===== */
  (function () {
    var t = document.getElementById("toTop");
    if (!t) return;
    t.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    window.addEventListener("scroll", function () {
      t.classList.toggle("on", window.scrollY > 420);
    }, { passive: true });
  })();

  /* ===== 헤더 스크롤 상태 ===== */
  var header = document.getElementById("header");
  var hasHero = !!document.querySelector(".hero, .page-hero");
  function onScroll() {
    if (window.scrollY > 40 || !hasHero) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ===== 모바일 메뉴 ===== */
  var navToggle = document.getElementById("navToggle"), navMenu = document.getElementById("navMenu");
  var backdrop = document.createElement("div");
  backdrop.className = "nav-backdrop";
  header.appendChild(backdrop);
  function closeMenu() { navMenu.classList.remove("open"); header.classList.remove("menu-open"); backdrop.classList.remove("show"); document.body.classList.remove("menu-lock"); }
  navToggle.addEventListener("click", function () {
    if (header.classList.contains("menu-open")) return closeMenu();
    navMenu.classList.add("open"); header.classList.add("menu-open"); backdrop.classList.add("show"); document.body.classList.add("menu-lock");
  });
  backdrop.addEventListener("click", closeMenu);
  Array.prototype.forEach.call(navMenu.querySelectorAll("a"), function (a) { a.addEventListener("click", closeMenu); });
  Array.prototype.forEach.call(navMenu.querySelectorAll(".nav-item.has-sub > a .nav-caret"), function (c) {
    c.addEventListener("click", function (e) {
      if (window.matchMedia("(max-width: 860px)").matches) {
        e.preventDefault(); e.stopPropagation();
        c.closest(".nav-item").classList.toggle("open");
      }
    });
  });

  /* ===== 안내 토스트(로그아웃 등) ===== */
  function showFlash(msg) {
    var t = document.createElement("div");
    t.className = "flash-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("on"); });
    setTimeout(function () { t.classList.remove("on"); setTimeout(function () { t.remove(); }, 300); }, 2400);
  }
  window.__flash = showFlash;
  try {
    var fm = sessionStorage.getItem("flashMsg");
    if (fm) { sessionStorage.removeItem("flashMsg"); showFlash(fm); }
  } catch (e) {}

  function openAuth() { var m = document.getElementById("authModal"); if (m) { m.hidden = false; document.body.style.overflow = "hidden"; } }
  window.__openAuth = openAuth;

  /* ===== 로그인 상태 반영 =====
     · 새로고침 때 깜빡이지 않도록 저장된 세션을 먼저 읽어 헤더를 그린다.
     · 관리자(admins)·정회원(member_links) 여부를 확인해 메뉴를 연다. */
  if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    var slot = document.getElementById("authSlot");
    var cached = null, cachedToken = null;
    try {
      var ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      var raw = localStorage.getItem("sb-" + ref + "-auth-token");
      if (raw) {
        var sess = JSON.parse(raw);
        var s = sess && sess.currentSession ? sess.currentSession : sess;
        cached = (s && s.user) || null;
        cachedToken = (s && s.access_token) || null;
      }
    } catch (e) {}

    function revealMenus(uid) {
      if (!uid) return;
      var h = { apikey: window.SUPABASE_ANON_KEY };
      if (cachedToken) h.Authorization = "Bearer " + cachedToken;
      fetch(window.SUPABASE_URL + "/rest/v1/admins?uid=eq." + uid + "&select=uid", { headers: h })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rows) { if (rows && rows.length) { var el = document.getElementById("navAdmin"); if (el) el.hidden = false; } })
        .catch(function () {});
      fetch(window.SUPABASE_URL + "/rest/v1/member_links?user_id=eq." + uid + "&select=member_status", { headers: h })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function () { var el = document.getElementById("navMember"); if (el) el.hidden = false; })
        .catch(function () {});
    }
    window.__revealMenus = revealMenus;

    function drawLoggedIn(user) {
      var meta = user.user_metadata || {};
      var name = meta.name || meta.full_name || meta.nickname || (user.email ? user.email.split("@")[0] : "성도");
      slot.innerHTML =
        '<a class="auth-name" href="mypage.html">' + esc(name) + "님</a>" +
        '<button class="auth-btn" id="logoutBtn">로그아웃</button>';
      document.getElementById("logoutBtn").addEventListener("click", function (ev) {
        var b = ev.currentTarget; b.disabled = true; b.textContent = "로그아웃 중…";
        try {
          var r2 = new URL(window.SUPABASE_URL).hostname.split(".")[0];
          localStorage.removeItem("sb-" + r2 + "-auth-token");
          for (var i = localStorage.length - 1; i >= 0; i--) {
            var k = localStorage.key(i);
            if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") !== -1) localStorage.removeItem(k);
          }
        } catch (e) {}
        if (window.__sb) { try { window.__sb.auth.signOut().catch(function () {}); } catch (e) {} }
        try { sessionStorage.setItem("flashMsg", "로그아웃되었습니다."); } catch (e) {}
        setTimeout(function () { location.href = "index.html"; }, 500);
      });
      var lbl = document.getElementById("tabLoginLabel");
      if (lbl) lbl.textContent = "내 정보";
      var tb = document.getElementById("tabLogin");
      if (tb) tb.onclick = function () { location.href = "mypage.html"; };
      revealMenus(user.id);
    }
    window.__drawLoggedIn = drawLoggedIn;

    if (cached) drawLoggedIn(cached);
    else {
      slot.innerHTML = '<button class="auth-btn" id="loginBtn">로그인</button>';
      document.getElementById("loginBtn").addEventListener("click", openAuth);
      var tb0 = document.getElementById("tabLogin");
      if (tb0) tb0.onclick = openAuth;
    }

    var sdk = document.createElement("script");
    sdk.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    sdk.onload = function () {
      var a = document.createElement("script");
      a.src = "js/auth.js?v=1";
      document.body.appendChild(a);
    };
    document.head.appendChild(sdk);
  } else {
    var slot2 = document.getElementById("authSlot");
    if (slot2) slot2.innerHTML = '<span class="auth-pending" title="로그인 기능 준비 중">로그인</span>';
    var tb1 = document.getElementById("tabLogin");
    if (tb1) tb1.onclick = function () { showFlash("로그인 기능은 준비 중입니다."); };
  }
})();
