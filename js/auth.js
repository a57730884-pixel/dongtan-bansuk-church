/* ============================================================
   동탄반석교회 — 인증 (Supabase Auth · 이메일 로그인/가입)
   layout.js 가 Supabase 키 설정을 확인한 뒤에만 이 파일을 불러옵니다.
   window.__sb 로 클라이언트를 노출하고 'sb-ready' 이벤트를 보냅니다.
   ------------------------------------------------------------
   회원가입은 세 화면으로 나뉩니다.
     ① consent — 약관·개인정보 동의 (필수/선택 따로)
     ② signup  — 이름·이메일·비밀번호 입력
     ③ done    — 가입 확인 메일 안내
   동의한 항목과 시각은 signUp 의 user_metadata 에 실어 보내고,
   데이터베이스 트리거(supabase/06_consents.sql)가 profiles 와
   consent_logs 에 남깁니다. 동의 화면을 거치지 않은 가입은 기록이 비어
   있으므로, 나중에 "언제 무엇에 동의했는지" 를 되짚을 수 있습니다.
   ============================================================ */
(function () {
  if (!window.supabase || !window.SUPABASE_URL) return;
  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  window.__sb = sb;

  var slot = document.getElementById("authSlot");
  var modal = document.getElementById("authModal");
  var form = document.getElementById("authForm");
  var msg = document.getElementById("authMsg");
  var titleEl = document.getElementById("authTitle");
  var subEl = document.getElementById("authSubtitle");
  var submitBtn = document.getElementById("authSubmit");
  var nameField = document.getElementById("nameField");
  var pw2Field = document.getElementById("password2Field");
  var toggleBtn = document.getElementById("authToggle");
  var switchWrap = document.getElementById("authSwitchWrap");
  var forgotWrap = document.getElementById("authForgotWrap");
  var stepsEl = document.getElementById("authSteps");
  var consentPane = document.getElementById("authConsent");
  var consentMsg = document.getElementById("consentMsg");
  var donePane = document.getElementById("authDone");
  var recapEl = document.getElementById("authRecap");
  var backBtn = document.getElementById("authBack");
  var peek = document.getElementById("authPeek");

  var CHURCH_NAME = (window.CHURCH && window.CHURCH.name) || "교회";
  var view = "login";     // 'login' | 'consent' | 'signup' | 'done'
  var consent = null;     // ① 단계에서 받은 동의 내역

  function openModal() { modal.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal() { modal.hidden = true; document.body.style.overflow = ""; hideMsg(); }
  function hideMsg() { if (msg) msg.hidden = true; if (consentMsg) consentMsg.hidden = true; }

  function showIn(el, text, ok) {
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className = "auth-msg " + (ok ? "ok" : "err");
  }
  function showMsg(text, ok) { showIn(msg, text, ok); }

  /* Supabase 오류를 성도님들이 알아볼 수 있는 말로 바꿔 보여 줍니다. */
  function friendly(err) {
    var m = (err && err.message) || "";
    if (/invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (/email not confirmed/i.test(m)) return "이메일 인증이 아직입니다. 가입 확인 메일의 링크를 눌러 주세요.";
    if (/already registered|user already/i.test(m)) return "이미 가입된 이메일입니다. 로그인해 주세요.";
    if (/password should be at least/i.test(m)) return "비밀번호는 8자 이상이어야 합니다.";
    if (/rate limit|too many|over_email_send/i.test(m)) return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    if (/banned/i.test(m)) return "이용이 제한된 계정입니다. 교회 사무실로 문의해 주세요.";
    return m || "다시 시도해 주세요.";
  }

  /* ===== 화면 전환 ===== */
  function setView(v) {
    view = v;
    var isSignup = v === "signup", isConsent = v === "consent", isDone = v === "done", isLogin = v === "login";

    titleEl.textContent = isLogin ? "로그인" : "회원가입";
    if (subEl) subEl.textContent = isLogin ? CHURCH_NAME + " 성도 공간입니다."
      : isConsent ? "먼저 아래 내용을 확인하고 동의해 주세요."
      : isSignup ? "로그인에 쓰실 정보를 입력해 주세요."
      : CHURCH_NAME + " 성도 공간입니다.";

    if (stepsEl) {
      stepsEl.hidden = isLogin;
      var on = isConsent ? 1 : isSignup ? 2 : 3;
      ["step1", "step2", "step3"].forEach(function (id, i) {
        var el = document.getElementById(id);
        if (el) el.className = (i + 1 === on) ? "on" : ((i + 1 < on) ? "done" : "");
      });
    }

    if (consentPane) consentPane.hidden = !isConsent;
    if (donePane) donePane.hidden = !isDone;
    form.hidden = !(isLogin || isSignup);
    if (forgotWrap) forgotWrap.hidden = !isLogin;
    if (switchWrap) switchWrap.hidden = !isLogin;
    if (nameField) nameField.hidden = !isSignup;
    if (pw2Field) pw2Field.hidden = !isSignup;
    if (backBtn) backBtn.hidden = !isSignup;
    if (recapEl) recapEl.hidden = !isSignup;

    submitBtn.textContent = isSignup ? "가입하기" : "로그인";
    var pw = document.getElementById("authPassword");
    if (pw) {
      pw.minLength = isSignup ? 8 : 6;
      pw.placeholder = isSignup ? "8자 이상" : "비밀번호";
      pw.autocomplete = isSignup ? "new-password" : "current-password";
    }
    var pw2 = document.getElementById("authPassword2");
    if (pw2) pw2.required = isSignup;
    hideMsg();

    // 단계가 바뀌면 모달을 맨 위로 — 긴 동의문을 읽다 넘어가도 제목부터 보이게
    var boxEl = modal && modal.querySelector(".modal-box");
    if (boxEl) boxEl.scrollTop = 0;
  }

  window.__openAuthView = function (v) { setView(v || "login"); openModal(); };

  /* ===== ① 동의 화면 ===== */
  if (consentPane) {
    var all = document.getElementById("consentAll");
    var boxes = Array.prototype.slice.call(consentPane.querySelectorAll(".consent-cb"));

    var syncAll = function () {
      if (!all) return;
      all.checked = boxes.length > 0 && boxes.every(function (b) { return b.checked; });
    };
    if (all) all.addEventListener("change", function () {
      boxes.forEach(function (b) { b.checked = all.checked; });
      if (consentMsg) consentMsg.hidden = true;
    });
    boxes.forEach(function (b) {
      b.addEventListener("change", function () { syncAll(); if (consentMsg) consentMsg.hidden = true; });
    });

    /* 항목별 "보기" — 무엇을·왜·얼마나 를 그 자리에서 펼친다 */
    Array.prototype.forEach.call(consentPane.querySelectorAll(".consent-more"), function (btn) {
      btn.addEventListener("click", function () {
        var item = btn.parentNode.parentNode;
        var box = item.querySelector(".consent-detail");
        var open = box.hidden;
        box.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        btn.textContent = open ? "접기" : "보기";
      });
    });

    var next = document.getElementById("consentNext");
    if (next) next.addEventListener("click", function () {
      var missing = boxes.filter(function (b) { return b.hasAttribute("data-required") && !b.checked; });
      if (missing.length) {
        showIn(consentMsg, "필수 항목에 모두 동의해 주셔야 가입할 수 있습니다.", false);
        var item = missing[0].parentNode.parentNode.parentNode;
        if (item) { item.classList.add("shake"); setTimeout(function () { item.classList.remove("shake"); }, 600); }
        missing[0].focus();
        return;
      }
      var now = new Date().toISOString();
      consent = { version: window.CONSENT_VERSION || "", agreed_at: now, source: "signup" };
      boxes.forEach(function (b) { consent[b.getAttribute("data-key")] = b.checked; });

      if (recapEl) {
        recapEl.innerHTML = "약관과 개인정보 수집·이용에 동의하셨습니다. 교회 소식 받기는 <b>" +
          (consent.news ? "받음" : "받지 않음") + "</b> 으로 저장됩니다. " +
          '<button type="button" class="recap-edit" id="recapEdit">고치기</button>';
        var re = document.getElementById("recapEdit");
        if (re) re.addEventListener("click", function () { setView("consent"); });
      }
      setView("signup");
      var nameInput = form.querySelector('input[name="name"]');
      if (nameInput) nameInput.focus();
    });

    var toLogin = document.getElementById("consentToLogin");
    if (toLogin) toLogin.addEventListener("click", function () { setView("login"); });
  }

  /* ===== 헤더 로그인 상태 ===== */
  function renderAuth() {
    sb.auth.getSession().then(function (res) {
      var user = res && res.data && res.data.session && res.data.session.user;
      if (!slot) return;
      if (user && window.__drawLoggedIn) { window.__drawLoggedIn(user); return; }
      if (!user) {
        slot.innerHTML = '<button class="auth-btn" id="loginBtn">로그인</button>';
        document.getElementById("loginBtn").addEventListener("click", function () { setView("login"); openModal(); });
        var lbl = document.getElementById("tabLoginLabel");
        if (lbl) lbl.textContent = "로그인";
        var tb = document.getElementById("tabLogin");
        if (tb) tb.onclick = function () { setView("login"); openModal(); };
      }
    });
  }

  /* ===== 모달 동작 ===== */
  if (modal) {
    modal.addEventListener("click", function (e) { if (e.target.hasAttribute("data-close")) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
    if (toggleBtn) toggleBtn.addEventListener("click", function () { setView("consent"); });
    if (backBtn) backBtn.addEventListener("click", function () { setView("consent"); });
    var doneClose = document.getElementById("authDoneClose");
    if (doneClose) doneClose.addEventListener("click", function () { closeModal(); setView("login"); });

    if (peek) peek.addEventListener("change", function () {
      var t = peek.checked ? "text" : "password";
      ["authPassword", "authPassword2"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.type = t;
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var email = String(fd.get("email") || "").trim();
      var password = String(fd.get("password") || "");
      var password2 = String(fd.get("password2") || "");
      var name = String(fd.get("name") || "").trim();
      submitBtn.disabled = true;
      var done = function () { submitBtn.disabled = false; };

      if (view === "signup") {
        if (!consent || !consent.terms || !consent.privacy || !consent.age14) {
          showMsg("동의 화면을 먼저 지나야 합니다.", false); setView("consent"); return done();
        }
        if (password.length < 8) { showMsg("비밀번호는 8자 이상이어야 합니다.", false); return done(); }
        if (password !== password2) { showMsg("두 비밀번호가 서로 다릅니다. 다시 확인해 주세요.", false); return done(); }

        sb.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: location.origin + location.pathname,
            data: {
              name: name || String(email).split("@")[0],
              consent: consent,                       // 동의 내역 원본
              terms_agreed_at: consent.agreed_at,     // 기존 화면과의 호환
              privacy_agreed_at: consent.agreed_at,
              news_opt_in: !!consent.news,
              consent_version: consent.version
            }
          }
        })
          .then(function (r) {
            if (r.error) throw r.error;
            if (r.data && r.data.session) {   // 메일 확인이 꺼져 있으면 바로 로그인된다
              closeModal();
              try { sessionStorage.setItem("flashMsg", "가입을 환영합니다."); } catch (e2) {}
              location.reload();
              return;
            }
            var dm = document.getElementById("authDoneMsg");
            if (dm) dm.innerHTML =
              "<b>" + email.replace(/[&<>"]/g, "") + "</b> 으로 <b>가입 확인 메일</b>을 보냈습니다.<br />" +
              "메일의 링크를 눌러 주시면 로그인할 수 있습니다. 메일이 보이지 않으면 스팸함도 확인해 주세요." +
              (consent.news ? "<br />교회 소식도 이 이메일로 보내 드립니다." : "");
            setView("done");
          })
          .catch(function (err) { showMsg("오류: " + friendly(err), false); })
          .then(done);
      } else {
        sb.auth.signInWithPassword({ email: email, password: password })
          .then(function (r) {
            if (r.error) throw r.error;
            closeModal();
            location.reload();
          })
          .catch(function (err) { showMsg("오류: " + friendly(err), false); done(); });
      }
    });

    var forgot = document.getElementById("authForgot");
    if (forgot) forgot.addEventListener("click", function () {
      var input = form.querySelector('input[name="email"]');
      var email = (input.value || "").trim();
      if (!email) { showMsg("가입하신 이메일을 위 칸에 먼저 입력해 주세요.", false); input.focus(); return; }
      forgot.disabled = true;
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/reset.html" })
        .then(function (r) {
          if (r.error) throw r.error;
          showMsg("비밀번호 재설정 메일을 보냈습니다. 몇 분 안에 오지 않으면 스팸함을 확인해 주세요.", true);
        })
        .catch(function (err) { showMsg("오류: " + friendly(err), false); })
        .then(function () { forgot.disabled = false; });
    });
  }

  setView("login");
  sb.auth.onAuthStateChange(function () { renderAuth(); });
  renderAuth();
  window.dispatchEvent(new CustomEvent("sb-ready", { detail: { sb: sb } }));
})();
