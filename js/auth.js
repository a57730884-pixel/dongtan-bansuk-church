/* ============================================================
   동탄반석교회 — 인증 (Supabase Auth · 이메일 로그인/가입)
   layout.js 가 Supabase 키 설정을 확인한 뒤에만 이 파일을 불러옵니다.
   window.__sb 로 클라이언트를 노출하고 'sb-ready' 이벤트를 보냅니다.
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
  var submitBtn = document.getElementById("authSubmit");
  var nameField = document.getElementById("nameField");
  var termsField = document.getElementById("termsField");
  var toggleBtn = document.getElementById("authToggle");
  var forgotWrap = document.getElementById("authForgotWrap");
  var mode = "login"; // 'login' | 'signup'

  function closeModal() { modal.hidden = true; document.body.style.overflow = ""; if (msg) msg.hidden = true; }
  function openModal() { modal.hidden = false; document.body.style.overflow = "hidden"; }

  function setMode(m) {
    mode = m;
    titleEl.textContent = m === "login" ? "로그인" : "회원가입";
    submitBtn.textContent = m === "login" ? "로그인" : "회원가입";
    nameField.hidden = m === "login";
    if (termsField) termsField.hidden = m === "login";
    if (forgotWrap) forgotWrap.hidden = m !== "login";
    var pw = document.getElementById("authPassword");
    if (pw) { pw.minLength = m === "login" ? 6 : 8; pw.placeholder = m === "login" ? "비밀번호" : "8자 이상"; }
    toggleBtn.textContent = m === "login" ? "회원가입" : "로그인하기";
    var sw = document.querySelector(".auth-switch");
    if (sw) sw.firstChild.textContent = m === "login" ? "처음이신가요? " : "이미 회원이신가요? ";
    msg.hidden = true;
  }

  // Supabase 오류를 성도님들이 알아볼 수 있는 말로 바꿔 보여 줍니다.
  function friendly(err) {
    var m = (err && err.message) || "";
    if (/invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (/email not confirmed/i.test(m)) return "이메일 인증이 아직입니다. 가입 확인 메일의 링크를 눌러 주세요.";
    if (/already registered/i.test(m)) return "이미 가입된 이메일입니다. 로그인해 주세요.";
    if (/password should be at least/i.test(m)) return "비밀번호는 8자 이상이어야 합니다.";
    if (/rate limit|too many/i.test(m)) return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    return m || "다시 시도해 주세요.";
  }
  function showMsg(text, ok) {
    msg.hidden = false;
    msg.textContent = text;
    msg.className = "auth-msg " + (ok ? "ok" : "err");
  }

  function renderAuth() {
    sb.auth.getSession().then(function (res) {
      var user = res && res.data && res.data.session && res.data.session.user;
      if (!slot) return;
      if (user && window.__drawLoggedIn) { window.__drawLoggedIn(user); return; }
      if (!user) {
        slot.innerHTML = '<button class="auth-btn" id="loginBtn">로그인</button>';
        document.getElementById("loginBtn").addEventListener("click", function () { setMode("login"); openModal(); });
        var lbl = document.getElementById("tabLoginLabel");
        if (lbl) lbl.textContent = "로그인";
        var tb = document.getElementById("tabLogin");
        if (tb) tb.onclick = function () { setMode("login"); openModal(); };
      }
    });
  }

  if (modal) {
    modal.addEventListener("click", function (e) { if (e.target.hasAttribute("data-close")) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
    toggleBtn.addEventListener("click", function () { setMode(mode === "login" ? "signup" : "login"); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var email = fd.get("email"), password = fd.get("password"), name = String(fd.get("name") || "").trim();
      submitBtn.disabled = true;
      var done = function () { submitBtn.disabled = false; };
      if (mode === "signup") {
        if (String(password || "").length < 8) { showMsg("비밀번호는 8자 이상이어야 합니다.", false); return done(); }
        if (!fd.get("terms")) { showMsg("이용약관과 개인정보처리방침에 동의해 주세요.", false); return done(); }
        sb.auth.signUp({ email: email, password: password, options: { data: { name: name || String(email).split("@")[0], terms_agreed_at: new Date().toISOString() } } })
          .then(function (r) {
            if (r.error) throw r.error;
            showMsg("가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증해 주세요.", true);
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

  sb.auth.onAuthStateChange(function () { renderAuth(); });
  renderAuth();
  window.dispatchEvent(new CustomEvent("sb-ready", { detail: { sb: sb } }));
})();
