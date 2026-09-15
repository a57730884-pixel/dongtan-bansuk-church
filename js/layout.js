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
    /* 교회 행정 — 권한에 따라 보이는 것이 다르다.
         최고관리자   교적관리 + 재정관리
         재정권한자   재정관리 하나만 (메뉴 이름도 '재정관리' 로 바뀐다)
         그 외        아예 없음
       실제 차단은 화면이 아니라 데이터베이스의 접근 규칙(RLS)이 한다.
       메뉴를 감추는 것은 헛걸음을 막기 위한 배려일 뿐이다. */
    { href: "gyojeok.html", label: "교회 행정", adminOnly: true, sub: [
      { href: "gyojeok.html", label: "교적관리", id: "navGyojeok" },
      { href: "finance.html", label: "재정관리", id: "navFinance" }
    ] }
  ];

  var path = location.pathname.split("/").pop() || "index.html";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  /* ===== 헤더 ===== */
  var navLinks = NAV.map(function (n) {
    var active = path === n.href.split("#")[0] ? ' class="active"' : "";
    var attr = n.adminOnly ? ' id="navAdmin" hidden' : (n.memberOnly ? ' id="navMember" hidden' : "");
    if (!n.sub) return '<div class="nav-item"' + attr + '><a href="' + n.href + '"' + active + ">" + n.label + "</a></div>";
    var subs = n.sub.map(function (s) {
      return '<a href="' + s.href + '"' + (s.id ? ' id="' + s.id + '"' : "") + ">" + s.label + "</a>";
    }).join("");
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

  /* ===== 가입 동의 항목 =====================================
     개인정보 보호법 제15조(수집·이용)·제22조(동의를 받는 방법)에 따라
      · 필수와 선택을 나누어 각각 동의를 받고
      · 항목마다 "무엇을 · 왜 · 얼마나" 를 그 자리에서 보여 주며
      · 동의를 거부할 수 있다는 사실과 그 결과를 함께 알린다.
     여기 적힌 내용은 privacy.html 의 본문과 같아야 합니다.
     ------------------------------------------------------- */
  var CONSENT_VERSION = "2026-09-15";      // 방침 시행일 = 동의서 판 번호
  window.CONSENT_VERSION = CONSENT_VERSION;

  var CONSENTS = [
    { key: "terms", required: true, label: "홈페이지 이용약관",
      detail:
        "<p>홈페이지를 함께 쓰기 위한 약속입니다. 회원 등급(준회원·정회원), 게시물, 탈퇴에 관한 내용을 담고 있습니다.</p>" +
        '<p class="consent-link"><a href="terms.html" target="_blank" rel="noopener">이용약관 전문 보기 ↗</a></p>' },

    { key: "privacy", required: true, label: "개인정보 수집·이용",
      detail:
        '<table class="consent-table">' +
          "<tr><th>수집 항목</th><td>이름, 이메일, 비밀번호(암호로 바꾸어 저장)<br />정회원 연결을 신청하실 때 생년월일을 추가로 받습니다. <b>주민등록번호는 받지 않습니다.</b></td></tr>" +
          "<tr><th>이용 목적</th><td>회원 확인과 로그인, 교적 연결과 회원 등급 관리, 본인·가정의 헌금 내역 조회, 교회 안내</td></tr>" +
          "<tr><th>보유 기간</th><td>회원 탈퇴 시까지. 다만 헌금·기부금영수증 기록은 관계 법령이 정한 기간 동안 교회 장부로 보관합니다.</td></tr>" +
        "</table>" +
        '<p class="consent-note">동의를 거부하실 수 있으나, 필수 항목에 동의하지 않으시면 회원 가입이 어렵습니다.</p>' +
        '<p class="consent-link"><a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침 전문 보기 ↗</a></p>' },

    { key: "age14", required: true, label: "만 14세 이상입니다",
      detail:
        "<p>만 14세 미만 아동은 법정대리인의 동의가 있어야 가입할 수 있어, 홈페이지에서는 직접 가입을 받지 않습니다. 교회 사무실로 문의해 주세요.</p>" },

    { key: "news", required: false, label: "교회 소식 받기",
      detail:
        '<table class="consent-table">' +
          "<tr><th>수집 항목</th><td>이메일</td></tr>" +
          "<tr><th>이용 목적</th><td>주보·공지·행사 등 교회 소식 안내</td></tr>" +
          "<tr><th>보유 기간</th><td>수신을 거부하시거나 탈퇴하실 때까지</td></tr>" +
        "</table>" +
        '<p class="consent-note">동의하지 않으셔도 가입과 서비스 이용에 아무런 제한이 없습니다. 가입 뒤 <b>나의 기록</b> 화면에서 언제든 바꾸실 수 있습니다.</p>' }
  ];
  window.CONSENTS = CONSENTS;

  var consentItems = CONSENTS.map(function (c) {
    var tag = c.required ? '<em class="req">[필수]</em>' : '<em class="opt">[선택]</em>';
    return '<li class="consent-item" data-key="' + c.key + '">' +
        '<div class="consent-row">' +
          '<label class="consent-label"><input type="checkbox" class="consent-cb" data-key="' + c.key + '"' + (c.required ? ' data-required="1"' : "") + ' />' +
            "<span>" + tag + " " + esc(c.label) + "</span></label>" +
          '<button type="button" class="consent-more" aria-expanded="false">보기</button>' +
        "</div>" +
        '<div class="consent-detail" hidden>' + c.detail + "</div>" +
      "</li>";
  }).join("");
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

    /* 로그인 · 회원가입 모달 ------------------------------------
       회원가입은 「개인정보 보호법」 제15·22조에 따라
       ① 약관 동의 → ② 정보 입력 → ③ 가입 완료 의 세 단계로 나눕니다.
       필수·선택 동의를 따로 받고, 각 항목의 수집 항목·목적·보유 기간을
       그 자리에서 펼쳐 볼 수 있게 했습니다. */
    '<div class="modal" id="authModal" hidden>' +
      '<div class="modal-backdrop" data-close></div>' +
      '<div class="modal-box modal-box-auth" role="dialog" aria-modal="true" aria-labelledby="authTitle">' +
        '<button class="modal-close" data-close aria-label="닫기">&times;</button>' +
        '<div class="auth-head"><h3 id="authTitle">로그인</h3>' +
          '<p id="authSubtitle">' + esc(CH.name || "") + " 성도 공간입니다.</p></div>" +

        /* 가입 진행 표시 */
        '<ol class="auth-steps" id="authSteps" hidden>' +
          '<li id="step1">약관 동의</li><li id="step2">정보 입력</li><li id="step3">가입 완료</li>' +
        "</ol>" +

        /* ① 약관 동의 */
        '<div class="consent-pane" id="authConsent" hidden>' +
          '<label class="consent-all"><input type="checkbox" id="consentAll" />' +
            "<span>아래 내용에 <b>모두 동의</b>합니다</span></label>" +
          '<p class="consent-all-note">선택 항목까지 한 번에 동의합니다. 항목별로 따로 고르셔도 됩니다.</p>' +
          '<ul class="consent-list">' + consentItems + "</ul>" +
          '<p class="auth-msg" id="consentMsg" hidden></p>' +
          '<button type="button" class="btn btn-solid auth-submit" id="consentNext">동의하고 계속하기</button>' +
          '<p class="auth-switch">이미 회원이신가요? <button type="button" id="consentToLogin">로그인하기</button></p>' +
        "</div>" +

        /* ② 로그인 · 정보 입력 */
        '<form id="authForm" class="auth-form">' +
          '<div class="form-field" id="nameField" hidden><label>이름</label><input type="text" name="name" placeholder="홍길동" autocomplete="name" /></div>' +
          '<div class="form-field"><label>이메일</label><input type="email" name="email" required placeholder="name@example.com" autocomplete="email" /></div>' +
          '<div class="form-field"><label>비밀번호</label><input type="password" name="password" id="authPassword" required minlength="6" placeholder="비밀번호" autocomplete="current-password" /></div>' +
          '<div class="form-field" id="password2Field" hidden><label>비밀번호 확인</label><input type="password" name="password2" id="authPassword2" placeholder="한 번 더 입력해 주세요" autocomplete="new-password" /></div>' +
          '<label class="auth-check auth-peek"><input type="checkbox" id="authPeek" /> <span>비밀번호 보기</span></label>' +
          '<p class="consent-recap" id="authRecap" hidden></p>' +
          '<p class="auth-msg" id="authMsg" hidden></p>' +
          '<button type="submit" class="btn btn-solid auth-submit" id="authSubmit">로그인</button>' +
          '<button type="button" class="auth-back" id="authBack" hidden>← 동의 화면으로</button>' +
        "</form>" +
        '<p class="auth-forgot" id="authForgotWrap"><button type="button" id="authForgot">비밀번호를 잊으셨나요?</button></p>' +
        '<p class="auth-switch" id="authSwitchWrap">처음이신가요? <button type="button" id="authToggle">회원가입</button></p>' +

        /* ③ 가입 완료 */
        '<div class="auth-done" id="authDone" hidden>' +
          '<div class="done-mark">✓</div>' +
          '<h4>가입 신청이 접수되었습니다</h4>' +
          '<p id="authDoneMsg">보내 드린 <b>가입 확인 메일</b>의 링크를 눌러 주시면 로그인할 수 있습니다.<br />메일이 보이지 않으면 스팸함도 확인해 주세요.</p>' +
          '<button type="button" class="btn btn-solid auth-submit" id="authDoneClose">확인</button>' +
        "</div>" +
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

  function openAuth() {
    if (window.__openAuthView) return window.__openAuthView("login");   // auth.js 가 붙은 뒤에는 로그인 화면부터
    var m = document.getElementById("authModal");
    if (m) { m.hidden = false; document.body.style.overflow = "hidden"; }
  }
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

    /* 최고관리자 뱃지 — admins 에 있는 계정에만 이름 옆에 붙는다.
       화면 장식이 아니라 "지금 내가 교적·재정까지 열 수 있는 상태"라는
       표시다. 남의 개인정보를 보는 자리에 들어와 있음을 잊지 않도록. */
    function markAdmin() {
      var nameEl = slot && slot.querySelector(".auth-name");
      if (!nameEl || slot.querySelector(".auth-badge")) return;
      var b = document.createElement("span");
      b.className = "auth-badge";
      b.textContent = "최고관리자";
      b.title = "교적과 재정을 모두 열 수 있는 계정입니다";
      nameEl.insertAdjacentElement("afterend", b);
    }

    /* 권한에 따라 '교회 행정' 메뉴를 세운다.
       최고관리자면 교적·재정 둘 다, 재정권한만 있으면 재정 하나만 보인다. */
    function applyAdminNav(isAdmin, canFinance) {
      var parent = document.getElementById("navAdmin");
      if (!parent) return;
      var top = parent.querySelector("a");
      var gy = document.getElementById("navGyojeok");
      var fi = document.getElementById("navFinance");
      var drop = parent.querySelector(".nav-dropdown");

      if (!isAdmin && !canFinance) { parent.hidden = true; return; }
      parent.hidden = false;

      if (isAdmin) {
        if (gy) gy.hidden = false;
        if (fi) fi.hidden = false;
        if (drop) drop.hidden = false;
        parent.classList.add("has-sub");
        if (top) { top.href = "gyojeok.html"; top.innerHTML = '교회 행정<span class="nav-caret" aria-hidden="true">⌄</span>'; }
      } else {
        // 재정권한만 받은 분 — 교적은 열리지 않으므로 메뉴에서 지우고 이름도 바꾼다
        if (gy) gy.hidden = true;
        if (fi) fi.hidden = false;
        if (drop) drop.hidden = true;
        parent.classList.remove("has-sub");
        if (top) { top.href = "finance.html"; top.textContent = "재정관리"; }
      }
    }

    function revealMenus(uid) {
      if (!uid) return;
      var h = { apikey: window.SUPABASE_ANON_KEY };
      var tok = window.__sbToken || cachedToken;   // 갱신된 토큰이 있으면 그것을 쓴다
      if (tok) h.Authorization = "Bearer " + tok;
      var get = function (path) {
        return fetch(window.SUPABASE_URL + "/rest/v1/" + path, { headers: h })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; });
      };

      // 두 질문을 함께 묻고 한 번에 결정한다 — 메뉴가 두 번 깜빡이지 않도록
      Promise.all([
        get("admins?uid=eq." + uid + "&select=uid"),
        get("member_links?user_id=eq." + uid + "&select=can_finance")
      ]).then(function (res) {
        var isAdmin = !!(res[0] && res[0].length);
        var canFinance = !!(res[1] && res[1][0] && res[1][0].can_finance);
        applyAdminNav(isAdmin, canFinance);
        if (isAdmin) markAdmin();
      });

      var el = document.getElementById("navMember");
      if (el) el.hidden = false;   // 나의 기록 — 로그인한 분이면 누구나(교적 인증도 여기서 한다)

      // 직분(집사·권사·장로·담임목사)이 교적에 등록돼 있으면 머리말의 호칭을 그것으로 바꾼다
      get("profiles?id=eq." + uid + "&select=name,role").then(function (rows) {
        var p = rows && rows[0];
        if (!p || !p.role) return;
        var n = document.querySelector(".auth-name");
        if (n) n.innerHTML = withTitle(p.name || "", p.role);
      });
    }
    window.__revealMenus = revealMenus;

    /* 이름 옆에 직분을 붙인다 — "강명우 담임목사님".
       교회에서는 이름만 부르지 않는다. 직분은 profiles.role 에서 가져오고,
       아직 비어 있으면 담임목사님만은 config 의 이름으로 알아본다. */
    function withTitle(name, role) {
      if (!role && CH.pastor && name === CH.pastor) role = "담임목사";
      return esc(name) + (role ? " " + esc(role) : "") + "님";
    }

    function drawLoggedIn(user) {
      var meta = user.user_metadata || {};
      var name = meta.name || meta.full_name || meta.nickname || (user.email ? user.email.split("@")[0] : "성도");
      slot.innerHTML =
        '<a class="auth-name" href="mypage.html">' + withTitle(name, meta.role) + "</a>" +
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
      a.src = "js/auth.js?v=7";
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
