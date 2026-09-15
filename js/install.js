/* ============================================================
   동탄반석교회 — 앱으로 설치하기
   ------------------------------------------------------------
   · 안드로이드·크롬 : 브라우저가 설치를 맡아 준다. 단추를 누르면 바로 설치.
   · 아이폰 사파리   : 브라우저가 맡아 주지 않는다. 그림으로 길을 알려 준다
                       (공유 ⬆ → 홈 화면에 추가).
   · 이미 설치해 쓰고 계시면 아무것도 보이지 않는다.

   연세 드신 성도가 혼자서도 따라 하실 수 있도록, 말로만 적지 않고
   어느 단추를 누르는지 하나씩 짚어 드립니다.
   ============================================================ */
(function () {
  var CH = window.CHURCH || {};
  var deferred = null;                       // 브라우저가 건네준 설치 절차
  var DISMISS_KEY = "bansukInstallHidden";

  function installed() {
    try {
      return window.matchMedia("(display-mode: standalone)").matches ||
             window.navigator.standalone === true;
    } catch (e) { return false; }
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function isSamsung() { return /samsungbrowser/i.test(navigator.userAgent); }

  /* ── 안내 창 ── */
  function guide() {
    var steps;
    if (isIOS()) {
      steps = [
        "아래 가운데의 <b>공유</b> 단추 <span class=\"ib-ico\">⬆</span> 를 누릅니다.",
        "목록을 아래로 내려 <b>홈 화면에 추가</b> 를 누릅니다.",
        "오른쪽 위 <b>추가</b> 를 누르면 끝납니다."
      ];
    } else if (isSamsung()) {
      steps = [
        "오른쪽 아래 <b>≡ 메뉴</b> 를 누릅니다.",
        "<b>현재 페이지 추가</b> 를 누릅니다.",
        "<b>홈 화면</b> 을 고르면 끝납니다."
      ];
    } else {
      steps = [
        "주소창 오른쪽의 <b>설치</b> 아이콘 <span class=\"ib-ico\">⊕</span> 를 누릅니다.",
        "아이콘이 보이지 않으면 <b>⋮ 메뉴</b> → <b>앱 설치</b> 를 누릅니다.",
        "<b>설치</b> 를 누르면 끝납니다."
      ];
    }
    var m = document.createElement("div");
    m.className = "modal install-modal";
    m.innerHTML =
      '<div class="modal-backdrop" data-x></div>' +
      '<div class="modal-box install-box" role="dialog" aria-modal="true">' +
        '<button class="modal-close" data-x aria-label="닫기">&times;</button>' +
        '<img class="ib-logo" src="images/icon-192.png" alt="" />' +
        "<h3>" + (CH.name || "교회") + " 앱으로 설치</h3>" +
        '<p class="ib-lead">홈 화면에 두면 앱처럼 바로 열립니다. 새로 내려받을 것은 없습니다.</p>' +
        '<ol class="ib-steps">' + steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>" +
        '<button type="button" class="btn btn-solid ib-done" data-x>알겠습니다</button>' +
      "</div>";
    document.body.appendChild(m);
    document.body.style.overflow = "hidden";
    Array.prototype.forEach.call(m.querySelectorAll("[data-x]"), function (el) {
      el.addEventListener("click", function () { m.remove(); document.body.style.overflow = ""; });
    });
  }

  /* ── 설치 ── */
  function install() {
    if (!deferred) { guide(); return; }
    deferred.prompt();
    deferred.userChoice.then(function (r) {
      deferred = null;
      if (r && r.outcome === "accepted") hideAll();
    }).catch(function () { deferred = null; });
  }
  window.__installApp = install;

  /* ── 아래쪽 띠 ── */
  function banner() {
    if (installed()) return;
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch (e) {}
    if (document.getElementById("installBar")) return;

    var bar = document.createElement("div");
    bar.className = "install-bar";
    bar.id = "installBar";
    bar.innerHTML =
      '<img class="install-icon" src="images/icon-192.png" alt="" />' +
      '<div class="install-text"><strong>' + (CH.name || "교회") + " 앱 설치</strong>" +
        "<span>홈 화면에 두고 앱처럼 쓰실 수 있습니다.</span></div>" +
      '<button type="button" class="install-go" id="installGo">설치</button>' +
      '<button type="button" class="install-close" id="installClose" aria-label="닫기">&times;</button>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add("on"); });

    document.getElementById("installGo").onclick = install;
    document.getElementById("installClose").onclick = function () {
      bar.classList.remove("on");
      setTimeout(function () { bar.remove(); }, 260);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
    };
  }

  function hideAll() {
    var bar = document.getElementById("installBar");
    if (bar) bar.remove();
    Array.prototype.forEach.call(document.querySelectorAll(".install-link"), function (el) {
      el.hidden = true;
    });
  }

  /* ── 푸터의 '앱 설치하기' — 띠를 닫으신 뒤에도 언제든 찾을 수 있게 ── */
  function footerLink() {
    var slot = document.querySelector(".footer-actions");
    if (!slot || installed() || slot.querySelector(".install-link")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "kakao-channel-btn install-link";
    b.textContent = "📱 앱 설치하기";
    b.addEventListener("click", install);
    slot.appendChild(b);
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    banner();
  });
  window.addEventListener("appinstalled", function () {
    deferred = null;
    hideAll();
    if (window.__flash) window.__flash("홈 화면에 설치되었습니다.");
  });

  /* 브라우저가 설치를 맡아 주지 않는 곳(아이폰 등)에서도 길은 알려 준다 */
  function start() {
    footerLink();
    if (installed()) { hideAll(); return; }
    if (isIOS()) setTimeout(banner, 1800);   // 화면을 잠깐 보신 뒤에 권한다
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  /* 서비스 워커 — 설치의 조건이자, 오프라인에서도 화면이 뜨게 하는 장치 */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
