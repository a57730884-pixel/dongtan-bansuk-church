/* mypage.js — 나의 기록(로그인 성도 전용)
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
      var html = profileCard(me);
      html += isMember ? '<div id="mpOffer" class="fin-card"><p class="qt-loading">헌금 내역을 불러오는 중…</p></div>' +
                         '<div id="mpFamily" class="fin-card"><p class="qt-loading">가정 정보를 불러오는 중…</p></div>'
                       : matchCard();
      root.innerHTML = html;
      if (isMember) { loadOfferings(); loadFamily(); } else bindMatch();
    }).catch(function (e) {
      root.innerHTML = msgCard('불러오지 못했습니다', e.message || '잠시 후 다시 시도해 주세요.');
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
})();
