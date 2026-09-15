/* mypage.js — 나의 신앙생활(로그인 성도 전용)
 * · 성경 읽기(js/reading.js) — 온 교회가 같은 날 같은 본문을 읽는 365일 표
 * · 교적 인증: 이름 + 생년월일이 교적과 일치하면 준회원 → 정회원
 * · 내 헌금 내역 / 배우자 합산 (본인·세대주만, RLS 로 강제)
 * · 우리 가정(가계도) — 이름·관계·생년·직분만, 연락처는 보이지 않음
 * 데이터는 전부 finance-api.js(WPF) 를 통해 Supabase 에서 가져옵니다.
 */
console.log('[mypage.js] v1');

(function () {
  var root = document.getElementById('myRoot');
  if (!root) return;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  function msgCard(t, x, btn) {
    return '<div class="member-lock"><div class="lock-icon">🔒</div><h3>' + esc(t) + '</h3><p>' + esc(x) + '</p>' +
      (btn ? '<p style="margin-top:18px"><button class="btn btn-solid" id="mpLogin">로그인</button></p>' : '') + '</div>';
  }

  var tries = 0;
  function boot() {
    if (!window.SUPABASE_URL) { root.innerHTML = msgCard('준비 중', '로그인 기능(Supabase) 설정이 아직입니다.'); return; }
    if (!(window.WPF && WPF.token())) {
      if (tries++ < 20) { setTimeout(boot, 400); return; }
      root.innerHTML = msgCard('로그인이 필요합니다', '상단 로그인 버튼을 눌러 로그인해 주세요.', true);
      var b = document.getElementById('mpLogin');
      if (b) b.onclick = function () { if (window.__openAuth) window.__openAuth(); };
      return;
    }
    load();
  }

  function load() {
    root.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
    WPF.call('me').then(function (me) {
      var isMember = me.status === '정회원';
      // 차례: 내 상태 → 큐티 → 성경 읽기 → 헌금·가정 → 동의 내역.
      // 말씀을 헌금보다 위에 둔다 — 신앙생활의 중심은 말씀이다.
      var html = profileCard(me) + '<div id="mpQt"></div><div id="mpReading"></div>';
      html += isMember ? '<div id="mpOffer" class="fin-card"><p class="qt-loading">헌금 내역을 불러오는 중…</p></div>' +
                         '<div id="mpFamily" class="fin-card"><p class="qt-loading">가정 정보를 불러오는 중…</p></div>'
                       : matchCard();
      html += '<div id="mpConsent" class="fin-card"><p class="qt-loading">동의 내역을 불러오는 중…</p></div>';
      root.innerHTML = html;
      if (window.__mountQt) window.__mountQt(document.getElementById('mpQt'));
      if (window.__mountReading) window.__mountReading(document.getElementById('mpReading'), { member: isMember });
      if (isMember) { loadOfferings(); loadFamily(); } else bindMatch();
      loadConsent();
    }).catch(function (e) {
      // 교적·헌금을 못 불러와도 동의 내역은 볼 수 있어야 한다
      root.innerHTML = msgCard('불러오지 못했습니다', e.message || '잠시 후 다시 시도해 주세요.') +
        '<div id="mpConsent" class="fin-card"><p class="qt-loading">동의 내역을 불러오는 중…</p></div>';
      loadConsent();
    });
  }

  /* ── 내 상태 ── */
  function profileCard(me) {
    var pill = me.status === '정회원' ? '<span class="fin-pill in">정회원</span>' : '<span class="fin-pill out">준회원</span>';
    return '<div class="fin-card"><h3 class="sub-title">' + esc(me.memberName || '성도') + '님</h3>' +
      '<p style="margin:0;color:var(--ink-soft)">회원 등급 ' + pill +
      (me.spouse ? ' · 배우자 <b>' + esc(me.spouse) + '</b>' : '') +
      (me.canFinance ? ' · <span class="fin-pill in">재정권한</span>' : '') + '</p></div>';
  }

  /* ── 교적 인증(준회원 → 정회원) ── */
  function matchCard() {
    return '<div class="fin-card">' +
      '<h3 class="sub-title">교적 인증</h3>' +
      '<p class="help" style="margin-bottom:16px">교적에 등록된 <b>이름</b>과 <b>생년월일</b>이 일치하면 정회원이 되어, 본인의 헌금 내역과 가정 합산을 볼 수 있습니다.</p>' +
      '<div class="form-grid" style="max-width:520px">' +
        '<div class="form-field"><label>이름</label><input type="text" id="mpName" maxlength="20" placeholder="홍길동" /></div>' +
        '<div class="form-field"><label>생년월일 8자리</label><input type="text" id="mpBirth" maxlength="10" inputmode="numeric" placeholder="19810819" /></div>' +
      '</div>' +
      '<div class="form-actions" style="margin-top:16px"><button class="btn btn-solid" id="mpMatch">인증하기</button>' +
      '<span class="profile-msg" id="mpMatchMsg"></span></div></div>';
  }
  function bindMatch() {
    var btn = document.getElementById('mpMatch'), out = document.getElementById('mpMatchMsg');
    if (!btn) return;
    btn.onclick = function () {
      var name = (document.getElementById('mpName').value || '').trim();
      var birth = (document.getElementById('mpBirth').value || '').replace(/[^0-9]/g, '').slice(0, 8);
      if (!name || birth.length !== 8) { out.textContent = '이름과 생년월일 8자리를 정확히 입력해 주세요.'; return; }
      btn.disabled = true; out.textContent = '확인 중…';
      WPF.call('match', { name: name, birth: birth }).then(function (r) {
        if (r && r.status === '정회원') { out.textContent = '정회원으로 연결되었습니다.'; setTimeout(load, 700); }
        else { out.textContent = (r && r.message) || '교적에서 찾지 못했습니다. 교회로 문의해 주세요.'; btn.disabled = false; }
      }).catch(function (e) { out.textContent = e.message || '오류가 발생했습니다.'; btn.disabled = false; });
    };
  }

  /* ── 내 헌금 내역 ── */
  function loadOfferings() {
    var box = document.getElementById('mpOffer');
    WPF.call('myOfferings').then(function (r) {
      var list = (r.offerings || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      if (!list.length) {
        box.innerHTML = '<h3 class="sub-title">내 헌금 내역</h3><p class="help">아직 등록된 헌금 내역이 없습니다.</p>';
        return;
      }
      // 연도별 합계
      var byYear = {};
      list.forEach(function (o) { var y = String(o.date).slice(0, 4); byYear[y] = (byYear[y] || 0) + (Number(o.amount) || 0); });
      var years = Object.keys(byYear).sort().reverse();
      box.innerHTML = '<h3 class="sub-title">내 헌금 내역</h3>' +
        '<p class="help" style="margin-bottom:14px">본인' + (r.spouse ? ' · 배우자(' + esc(r.spouse) + ')' : '') + ' 합산 · 전체 <b>' + won(r.total) + '원</b></p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
          years.map(function (y) { return '<span class="fin-pill in">' + esc(y) + '년 ' + won(byYear[y]) + '원</span>'; }).join('') +
        '</div>' +
        '<div style="overflow:auto"><table class="fin-table"><thead><tr><th>날짜</th><th>항목</th><th>예배</th><th>구분</th><th class="num">금액</th></tr></thead><tbody>' +
        list.map(function (o) {
          return '<tr><td>' + esc(String(o.date).slice(0, 10)) + '</td><td>' + esc(o.account || '') + '</td><td>' + esc(o.service || '') + '</td>' +
            '<td>' + (o.who === 'spouse' ? '배우자' : '본인') + '</td><td class="num">' + won(o.amount) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function (e) {
      box.innerHTML = '<h3 class="sub-title">내 헌금 내역</h3><p class="help">' + esc(e.message || '불러오지 못했습니다.') + '</p>';
    });
  }

  /* ── 우리 가정 ── */
  function loadFamily() {
    var box = document.getElementById('mpFamily');
    WPF.call('myFamily').then(function (r) {
      var rows = r.members || [];
      if (!rows.length) { box.innerHTML = '<h3 class="sub-title">우리 가정</h3><p class="help">등록된 가족 정보가 없습니다.</p>'; return; }
      box.innerHTML = '<h3 class="sub-title">우리 가정</h3>' +
        '<div style="overflow:auto"><table class="fin-table"><thead><tr><th>이름</th><th>관계</th><th>생년월일</th><th>직분</th></tr></thead><tbody>' +
        rows.map(function (m) {
          return '<tr><td><b>' + esc(m.name) + '</b></td><td>' + esc(m.relation || '') + '</td>' +
            '<td>' + esc(String(m.birth || '').slice(0, 10)) + '</td><td>' + esc(m.role || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="help" style="margin-top:12px">연락처·주소는 개인정보 보호를 위해 표시하지 않습니다.</p>';
    }).catch(function (e) {
      box.innerHTML = '<h3 class="sub-title">우리 가정</h3><p class="help">' + esc(e.message || '불러오지 못했습니다.') + '</p>';
    });
  }

  boot();
  /* ── 개인정보 동의 내역 ──────────────────────────────────
     가입할 때 무엇에 동의했는지 본인이 확인하고,
     선택 동의(교회 소식)는 여기서 직접 철회할 수 있어야 합니다.
     (개인정보 보호법 제37조 — 처리 정지·동의 철회 요구권) */
  function loadConsent() {
    var box = document.getElementById('mpConsent');
    if (!box) return;
    var sb = window.__sb;
    if (!sb) { setTimeout(loadConsent, 400); return; }   // auth.js 가 아직 붙기 전

    sb.auth.getUser().then(function (r) {
      var uid = r && r.data && r.data.user && r.data.user.id;
      if (!uid) throw new Error('로그인이 필요합니다.');
      return sb.from('profiles')
        .select('terms_agreed_at,privacy_agreed_at,age14_confirmed_at,news_opt_in,news_agreed_at,consent_version')
        .eq('id', uid).maybeSingle();
    }).then(function (res) {
      if (res.error) throw res.error;
      drawConsent(box, res.data || {});
    }).catch(function (e) {
      var m = (e && e.message) || '';
      var hint = /column|does not exist|schema cache/i.test(m)
        ? '동의 기록 표가 아직 만들어지지 않았습니다. (관리자: supabase/06_consents.sql 실행)'
        : m || '잠시 후 다시 시도해 주세요.';
      box.innerHTML = '<h3 class="sub-title">개인정보 동의 내역</h3>' +
        '<p style="margin:0;color:var(--ink-soft)">' + esc(hint) + '</p>';
    });
  }

  function fmtDay(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d)) return '';
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }

  /* ── 회원 탈퇴 ──────────────────────────────────────────
     되돌릴 수 없는 일이므로 두 번 묻는다. 두 번째는 직접 글자를 적게 한다.
     실제 삭제는 데이터베이스의 withdraw_me() 가 한다(supabase/10_account.sql). */
  function bindQuit() {
    var btn = document.getElementById('quitBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!window.confirm('회원에서 탈퇴하시겠습니까?\n\n로그인 계정과 홈페이지 기록(성경 읽기·동의 내역)이 지워지며 되돌릴 수 없습니다.\n교적과 헌금 기록은 교회 장부로 남습니다.')) return;
      var typed = window.prompt('정말 탈퇴하시려면 아래 칸에 "탈퇴" 두 글자를 적어 주세요.');
      if (String(typed || '').trim() !== '탈퇴') return;

      btn.disabled = true; btn.textContent = '처리 중…';
      window.__sb.rpc('withdraw_me').then(function (r) {
        if (r.error) throw r.error;
        if (r.data && r.data.ok === false) throw new Error(r.data.error || '탈퇴하지 못했습니다.');
        try { sessionStorage.setItem('flashMsg', '탈퇴가 처리되었습니다. 그동안 함께해 주셔서 감사합니다.'); } catch (e) {}
        try { window.__sb.auth.signOut(); } catch (e) {}
        try {
          for (var i = localStorage.length - 1; i >= 0; i--) {
            var k = localStorage.key(i);
            if (k && k.indexOf('sb-') === 0) localStorage.removeItem(k);
          }
        } catch (e) {}
        setTimeout(function () { location.href = 'index.html'; }, 400);
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = '회원 탈퇴';
        window.alert('탈퇴하지 못했습니다.\n' + ((e && e.message) || '잠시 후 다시 시도해 주세요.'));
      });
    });
  }

  function drawConsent(box, p) {
    function row(label, at, req) {
      var tag = req ? '<em style="font-style:normal;color:var(--accent-soft);font-weight:700">[필수]</em> '
                    : '<em style="font-style:normal;color:var(--ink-soft);font-weight:700">[선택]</em> ';
      var when = at ? fmtDay(at) + ' 동의' : '기록 없음';
      return '<li><span>' + tag + esc(label) + '</span><span class="cl-when">' + when + '</span></li>';
    }
    // 가입할 때 이미 동의를 마치셨다면 접어 둔다.
    // 다시 동의를 받는 화면이 아니라 지나간 기록이므로 늘 펼쳐 둘 이유가 없다.
    // 다만 없애지는 않는다 — 선택 동의를 철회할 창구는 열어 두어야 한다
    // (개인정보 보호법 제37조, 우리 방침 제8조).
    var settled = !!(p.terms_agreed_at && p.privacy_agreed_at);
    box.className = 'fin-card consent-fold' + (settled ? '' : ' open');
    box.innerHTML =
      '<button type="button" class="consent-fold-head" id="cfHead" aria-expanded="' + (!settled) + '">' +
        '<span class="cf-title">개인정보 동의 내역</span>' +
        '<span class="cf-state">' +
          (settled ? fmtDay(p.privacy_agreed_at) + ' 동의 완료' : '확인이 필요합니다') +
        '</span>' +
        '<span class="cf-caret" aria-hidden="true">⌄</span>' +
      '</button>' +
      '<div class="consent-fold-body"' + (settled ? ' hidden' : '') + '>' +
      '<ul class="consent-log">' +
        row('홈페이지 이용약관', p.terms_agreed_at, true) +
        row('개인정보 수집·이용', p.privacy_agreed_at, true) +
        row('만 14세 이상 확인', p.age14_confirmed_at, true) +
        row('교회 소식 받기', p.news_opt_in ? (p.news_agreed_at || p.privacy_agreed_at) : null, false) +
      '</ul>' +
      '<label class="news-toggle"><input type="checkbox" id="newsOptIn"' + (p.news_opt_in ? ' checked' : '') + ' />' +
        '<span>교회 소식(주보·공지·행사)을 이메일로 받겠습니다</span></label>' +
      '<p id="newsMsg" style="margin:8px 0 0;font-size:.85rem;color:var(--ink-soft)">' +
        '동의하지 않으셔도 가입과 이용에는 제한이 없습니다. 언제든 다시 바꾸실 수 있습니다.</p>' +
      (p.consent_version ? '<p style="margin:10px 0 0;font-size:.8rem;color:var(--ink-soft)">동의서 판 ' + esc(p.consent_version) + '</p>' : '') +
      '<p style="margin:14px 0 0;font-size:.85rem;color:var(--ink-soft)">' +
        '<a href="privacy.html">개인정보처리방침</a> · <a href="terms.html">이용약관</a></p>' +
      '<div class="quit-row"><button type="button" class="quit-btn" id="quitBtn">회원 탈퇴</button>' +
        '<span class="quit-note">로그인 계정과 홈페이지 기록이 지워집니다. 교적과 헌금은 교회 장부로 남습니다.</span></div>' +
      '</div>';

    var head = document.getElementById('cfHead');
    if (head) head.addEventListener('click', function () {
      var body = box.querySelector('.consent-fold-body');
      var open = body.hidden;
      body.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
      box.classList.toggle('open', open);
    });

    bindQuit();

    var cb = document.getElementById('newsOptIn');
    var note = document.getElementById('newsMsg');
    if (!cb) return;
    cb.addEventListener('change', function () {
      var want = cb.checked;
      cb.disabled = true;
      note.textContent = '저장하는 중…';
      window.__sb.rpc('set_news_consent', { p_optin: want, p_version: window.CONSENT_VERSION || null })
        .then(function (r) {
          if (r.error) throw r.error;
          note.textContent = want ? '교회 소식을 받기로 하셨습니다.' : '교회 소식 수신을 철회하셨습니다.';
        })
        .catch(function (e) {
          cb.checked = !want;
          note.textContent = '바꾸지 못했습니다: ' + ((e && e.message) || '잠시 후 다시 시도해 주세요.');
        })
        .then(function () { cb.disabled = false; });
    });
  }
})();
