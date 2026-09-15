/* ============================================================
   동탄반석교회 — 목회 행정 (최고관리자 전용)
   ------------------------------------------------------------
   성도들이 성경을 얼마나 읽고 있는지, 누가 어디까지 왔는지를 본다.
   무엇을 읽었는지·언제 무엇을 느꼈는지는 보지 않는다. 숫자만 본다.
   집계는 데이터베이스의 reading_dashboard() 가 해 주며,
   그 함수는 최고관리자가 아니면 거부한다(supabase/09_reading.sql).
   ============================================================ */
console.log('[care.js] v1');

(function () {
  var root = document.getElementById('careRoot');
  if (!root) return;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  function msgCard(t, x) {
    return '<div class="fin-card" style="text-align:center;padding:40px 18px"><h3 style="margin:0 0 8px;color:var(--accent)">' +
      esc(t) + '</h3><p style="color:var(--ink-soft);margin:0">' + esc(x) + '</p></div>';
  }

  function seoulYear() {
    return +new Date().toLocaleString('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' }).slice(0, 4);
  }
  function todayDay() {
    var s = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).split('-');
    var n = Math.floor((Date.UTC(+s[0], +s[1] - 1, +s[2]) - Date.UTC(+s[0], 0, 1)) / 86400000) + 1;
    return Math.min(365, Math.max(1, n));
  }
  var YEAR = seoulYear(), TODAY = todayDay();

  function rpc(fn, params) {
    var h = { apikey: window.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    var t = window.__sbToken || (window.WPF && WPF.token && WPF.token());
    if (t) h.Authorization = 'Bearer ' + t;
    return fetch(window.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: h, body: JSON.stringify(params || {})
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (x) {
        if (/relation .* does not exist|schema cache|Could not find the function/i.test(x)) {
          throw new Error('성경 읽기 표가 아직 없습니다. (관리자: supabase/09_reading.sql 실행)');
        }
        if (/최고관리자|permission denied/i.test(x)) throw new Error('최고관리자만 볼 수 있습니다.');
        throw new Error(x || '불러오지 못했습니다.');
      });
      return r.text().then(function (x) { return x ? JSON.parse(x) : null; });
    }, function () { throw new Error('서버에 연결하지 못했습니다.'); });
  }

  /* ── 시작: 로그인 · 권한 확인 ── */
  var tries = 0;
  function boot() {
    if (!window.SUPABASE_URL) { root.innerHTML = msgCard('준비 중', 'Supabase 설정(js/config.js)이 아직 비어 있습니다.'); return; }
    if (!(window.WPF && WPF.token())) {
      if (tries++ < 20) { setTimeout(boot, 400); return; }
      root.innerHTML = msgCard('로그인이 필요합니다', '상단에서 로그인 후 이용해 주세요.'); return;
    }
    root.innerHTML = '<p class="qt-loading">권한 확인 중입니다…</p>';
    WPF.call('me').then(function (me) {
      if (!me.isAdmin) {
        root.innerHTML = msgCard('접근 권한이 없습니다', '목회 행정은 최고관리자만 이용할 수 있습니다.');
        return;
      }
      load();
    }).catch(function (e) { root.innerHTML = msgCard('확인 실패', e.message || '잠시 후 다시 시도해 주세요.'); });
  }

  function load() {
    root.innerHTML = '<p class="qt-loading">현황을 불러오는 중…</p>';
    rpc('reading_dashboard', { p_year: YEAR })
      .then(render)
      .catch(function (e) { root.innerHTML = msgCard('불러오지 못했습니다', e.message); });
  }

  /* ── 화면 ── */
  function render(d) {
    d = d || {};
    var members = d.members || [];
    var joined = d.joined || 0;
    var readers = d.readers || 0;
    var avg = members.length
      ? Math.round(members.reduce(function (a, m) { return a + (m.days || 0); }, 0) / members.length)
      : 0;

    root.innerHTML =
      '<div class="care-tiles">' +
        tile('가입한 성도', joined + '<small>명</small>', '홈페이지 회원 전체') +
        tile('성경을 읽는 성도', readers + '<small>명</small>',
             joined ? Math.round(readers / joined * 100) + '% 가 참여하고 있습니다' : '아직 없습니다') +
        tile('오늘 읽은 성도', (d.today || 0) + '<small>명</small>', '오늘은 ' + TODAY + '일째입니다') +
        tile('평균 진행', avg + '<small>일</small>', '365일 중 ' + Math.round(avg / 365 * 100) + '%') +
      '</div>' +

      '<div class="fin-card">' +
        '<h3 class="sub-title">최근 이레</h3>' +
        '<p class="help" style="margin:-6px 0 18px">날마다 성경을 읽고 표시한 성도 수입니다.</p>' +
        weekChart(d.week || []) +
      '</div>' +

      '<div class="fin-card">' +
        '<div class="care-head">' +
          '<h3 class="sub-title" style="margin:0">성도별 진행률</h3>' +
          '<span class="help">' + YEAR + ' · 구속사적 성경읽기 365</span>' +
        '</div>' +
        (members.length ? memberBars(members)
          : '<p class="help">아직 성경 읽기를 시작한 성도가 없습니다.</p>') +
      '</div>' +

      '<p class="help" style="margin-top:18px">' +
        '무엇을 읽었는지가 아니라 <b>며칠을 읽었는지</b>만 모읍니다. ' +
        '성도 개인의 묵상 내용은 교회가 보지 않습니다.</p>';
  }

  function tile(label, value, note) {
    return '<div class="care-tile"><p class="ct-label">' + esc(label) + '</p>' +
      '<p class="ct-value">' + value + '</p>' +
      '<p class="ct-note">' + esc(note) + '</p></div>';
  }

  /* 최근 이레 — 막대 일곱 개. 라이브러리 없이 눈금만 세운다 */
  function weekChart(week) {
    if (!week.length) return '<p class="help">기록이 없습니다.</p>';
    var max = Math.max.apply(null, week.map(function (w) { return w.n || 0; }).concat([1]));
    return '<div class="week-chart">' + week.map(function (w) {
      var day = new Date(w.d + 'T00:00:00');
      var label = ['일', '월', '화', '수', '목', '금', '토'][day.getDay()];
      var h = Math.round((w.n || 0) / max * 100);
      return '<div class="wc-col">' +
          '<span class="wc-n">' + (w.n || 0) + '</span>' +
          '<div class="wc-bar"><span style="height:' + Math.max(h, 2) + '%"></span></div>' +
          '<span class="wc-day">' + label + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* 성도별 진행률 — 이름과 막대 하나. 뒤처진 분이 눈에 들어오게 둔다 */
  function memberBars(members) {
    return '<ul class="care-bars">' + members.map(function (m) {
      var days = m.days || 0;
      var p = Math.round(days / 365 * 100);
      var behind = TODAY - days;
      var state = behind <= 0 ? 'ok' : (behind <= 7 ? 'near' : 'far');
      return '<li class="care-row">' +
          '<span class="cr-name">' + esc(m.name || '이름 없음') +
            (m.status === '정회원' ? '' : ' <em class="cr-sub">준회원</em>') + '</span>' +
          '<span class="cr-bar"><i class="' + state + '" style="width:' + Math.max(p, 1) + '%"></i></span>' +
          '<span class="cr-num">' + days + '일 <em>' + p + '%</em></span>' +
          '<span class="cr-state ' + state + '">' +
            (behind <= 0 ? '따라오는 중' : behind + '일 밀림') + '</span>' +
        '</li>';
    }).join('') + '</ul>';
  }

  boot();
})();
