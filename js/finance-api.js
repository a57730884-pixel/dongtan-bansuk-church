/* finance-api.js — 재정/교적 데이터 계층 (Supabase 어댑터) · 동탄반석교회
 * 원본: 운평장로교회 시스템에서 이식.
 * 기존 Apps Script(WPF.call)를 그대로 대체: 같은 action 이름·반환 형태를 Supabase로 처리.
 * → finance.js / gyojeok.js / affairs.js 는 수정 없이 동작.
 * 콘솔: [finance-api.js] v20260701di (Supabase)
 */
console.log('[finance-api.js] v20260817gjdel (Supabase + 교적 삭제/복원)');

window.WPF = (function () {
  var SB = function () { return window.SUPABASE_URL || ''; };
  var AK = function () { return window.SUPABASE_ANON_KEY || ''; };
  function ref() { try { return SB().match(/https:\/\/([^.]+)\./)[1]; } catch (e) { return ''; } }
  function token() {
    try {
      var raw = localStorage.getItem('sb-' + ref() + '-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && (s.access_token || (s.currentSession && s.currentSession.access_token))) || null;
    } catch (e) { return null; }
  }
  function loggedIn() { return !!token(); }
  function num(x) { return Number(String(x == null ? '' : x).replace(/[^\d.-]/g, '')) || 0; }

  // ── Supabase REST / RPC ──
  function headers(prefer) {
    var h = { apikey: AK(), 'Content-Type': 'application/json' };
    var t = token(); if (t) h.Authorization = 'Bearer ' + t;
    if (prefer) h.Prefer = prefer;
    return h;
  }
  function rest(method, path, body, prefer) {
    var opt = { method: method, headers: headers(prefer) };
    if (body != null) opt.body = JSON.stringify(body);
    return fetch(SB() + '/rest/v1/' + path, opt).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
      return (r.status === 204) ? null : r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  function rpc(fn, params) {
    return fetch(SB() + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers(), body: JSON.stringify(params || {}) })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
        return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
      });
  }
  // PostgREST는 요청당 최대 1000행 → offset 으로 전부 가져옴(안정 정렬: order=id 필요)
  function restAll(path) {
    var PAGE = 1000, all = [];
    function next(off) {
      var sep = path.indexOf('?') >= 0 ? '&' : '?';
      return rest('GET', path + sep + 'limit=' + PAGE + '&offset=' + off).then(function (rows) {
        rows = rows || []; all = all.concat(rows);
        return rows.length < PAGE ? all : next(off + PAGE);
      });
    }
    return next(0);
  }

  // ── Apps Script(/exec) 직접 호출 ──
  // Supabase로 대체 불가한 기능(구글드라이브 PDF 생성 등)은 기존 Apps Script 백엔드를 그대로 사용.
  // Content-Type: text/plain 으로 프리플라이트(OPTIONS) 회피. 토큰은 Supabase access_token.
  function appsScript(action, params) {
    var url = window.FINANCE_API_URL || '';
    if (!url) return Promise.reject(new Error('FINANCE_API_URL 미설정'));
    var payload = { action: action, token: token() };
    if (params) { for (var k in params) { if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k]; } }
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw new Error('서버 응답을 해석할 수 없습니다.'); }
        if (!j || !j.ok) throw new Error((j && j.error) || '요청이 실패했습니다.');
        return j;
      });
  }

  // ── 매핑 헬퍼 (Supabase 컬럼 ↔ 기존 한글 키) ──
  function gjOut(r) {
    return {
      '교적ID': r.id, '교적번호': r.gyojeok_id, '이름': r.name, '생년월일': r.birth, '매칭키': r.member_key,
      '세대주': r.head, '관계': r.relation, '배우자': r.spouse, '배우자매칭키': r.spouse_key,
      '그룹': r.groups, '직책': r.role, '신급': r.grade, '성별': r.sex, '휴대폰': r.phone,
      '주소': r.address, '회원상태': r.status, '사진': r.photo, '세례일': r.baptism_date,
      '임직일': r.ordination_date, '소속그룹': r.belong_groups, '부모세대': r.origin_head, '주일학교': r.ss_role
    };
  }
  var GJ_MAP = { '이름': 'name', '생년월일': 'birth', '매칭키': 'member_key', '세대주': 'head', '관계': 'relation', '배우자': 'spouse', '배우자매칭키': 'spouse_key', '그룹': 'groups', '직책': 'role', '신급': 'grade', '성별': 'sex', '휴대폰': 'phone', '주소': 'address', '회원상태': 'status', '사진': 'photo', '세례일': 'baptism_date', '임직일': 'ordination_date', '소속그룹': 'belong_groups', '부모세대': 'origin_head', '주일학교': 'ss_role' };
  var GJ_DATECOLS = { birth: 1, baptism_date: 1, ordination_date: 1 };
  function memOut(r) { return { name: r.name, key: r.member_key, birth: r.birth, group: r.groups, role: r.role, spouse: r.spouse, spouseKey: r.spouse_key, head: r.head, rel: r.relation, address: r.address || '' }; }
  function recOut(r) { return { id: r.id, no: r.receipt_no, fy: r.fy, key: r.member_key, name: r.donor_name, birth: r.donor_birth, rrn: r.donor_rrn, addr: r.donor_addr, includedKeys: r.included_keys || [], detail: r.detail, spouse: r.spouse, period: r.period_label, amount: r.amount, cnt: r.cnt, method: r.method, status: r.status, issuedBy: r.issued_by, issuedAt: r.issued_at, cancelledAt: r.cancelled_at }; }
  function accOut(r) { return { '구분': r.atype, '분류': (r.atype === '수입' ? '헌금' : (r.category || '')), '계정명': r.name, '계정코드': r.code, '상위': r.category }; }
  function offOut(r) { return { '전표ID': 'O' + r.id, '일자': r.offer_date, '구분': '수입', '종류': '헌금', '계정': r.category || '', '예배': r.service || '', '헌금자': r.giver || '', '매칭키': r.member_key || '', '금액': r.amount, '수단': r.method || '', '적요': r.memo || '', '입력자': r.created_by || '', '입력일': r.created_at || '', '수정자': r.updated_by || '', '수정일': r.updated_at || '' }; }
  function expOut(r) { return { '전표ID': 'E' + r.id, '일자': r.exp_date, '구분': '지출', '종류': '일반', '계정': r.account || '', '예배': '', '헌금자': r.payee || '', '매칭키': '', '금액': r.amount, '수단': r.method || '', '적요': r.memo || '', '입력자': r.created_by || '', '입력일': r.created_at || '', '수정자': r.updated_by || '', '수정일': r.updated_at || '' }; }
  function budOut(r) { return { '계정코드': r.code, '계정이름': r.name, '구분': r.atype, '예산': r.budget, '전년예산': r.prev_budget, '전년결산': r.prev_actual }; }
  function toOffering(v) { return { offer_date: v.date || null, category: v.account || null, service: v.service || null, giver: v.payer || null, member_key: v.memberKey || null, amount: num(v.amount), method: v.method || null, memo: v.memo || null }; }
  function toExpense(v) { return { exp_date: v.date || null, account: v.account || null, category: null, payee: v.payer || null, amount: num(v.amount), method: v.method || null, memo: v.memo || null }; }

  // ── 액션 라우팅 (Apps Script 호환) ──
  function call(action, params) {
    params = params || {};
    switch (action) {
      case 'me':
        return rpc('my_profile').then(function (m) { m = m || {}; m.ok = true; return m; });
      case 'match':
        return rpc('match_member', { p_name: params.name, p_birth: params.birth });
      case 'myOfferings':
        return rpc('my_profile').then(function (me) {
          me = me || {};
          var keys = [me.memberKey, me.spouseKey].filter(Boolean);
          if (!keys.length) return { ok: true, offerings: [], total: 0, spouse: me.spouse || '' };
          var inlist = keys.map(function (k) { return '"' + encodeURIComponent(k) + '"'; }).join(',');
          return restAll('offerings?select=offer_date,category,service,giver,member_key,amount&member_key=in.(' + inlist + ')&order=id').then(function (rows) {
            var list = (rows || []).map(function (o) { return { date: o.offer_date, account: o.category || '', service: o.service || '', amount: o.amount, giver: o.giver || '', who: (me.spouseKey && o.member_key === me.spouseKey) ? 'spouse' : 'self' }; });
            return { ok: true, offerings: list, total: list.reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0), spouse: me.spouse || '' };
          });
        });
      case 'myFamily':
        return rpc('my_family').then(function (rows) { return { ok: true, members: rows || [] }; });
      case 'masters':
        return Promise.all([
          rest('GET', 'gyojeok?select=*&order=name&limit=20000'),
          rest('GET', 'budget?select=code,name,atype&order=code&limit=5000'),
          rest('GET', 'services?select=*&order=sort&limit=500')
        ]).then(function (res) {
          // 계정과목(드롭다운)은 budget 테이블 단일 소스에서 파생: 0000(항) 제외, 목만.
          var bud = res[1] || [], nameByCode = {};
          bud.forEach(function (b) { nameByCode[b.code] = b.name; });
          var accounts = bud.filter(function (b) { return String(b.code || '').slice(-4) !== '0000'; }).map(function (b) {
            var parent = String(b.code || '').slice(0, 3) + '0000';
            return { '구분': b.atype, '분류': (b.atype === '수입' ? '헌금' : (nameByCode[parent] || '')), '계정명': b.name, '계정코드': b.code, '상위': nameByCode[parent] || '' };
          });
          return {
            ok: true,
            members: (res[0] || []).map(memOut),
            accounts: accounts,
            services: (res[2] || []).filter(function (s) { return s.active !== false; }).map(function (s) { return { '예배명': s.name }; })
          };
        });
      case 'addAccount':
        return rest('POST', 'budget', { code: params.code, name: params.name, atype: params.atype, budget: num(params.budget), prev_budget: 0, prev_actual: 0 }, 'return=minimal').then(function () { return { ok: true }; });
      case 'updateAccount':
        return rest('PATCH', 'budget?code=eq.' + encodeURIComponent(params.code), params.fields || {}, 'return=minimal').then(function () { return { ok: true }; });
      case 'deleteAccount':
        return rest('DELETE', 'budget?code=eq.' + encodeURIComponent(params.code), null, 'return=representation').then(function (rows) { return { ok: true, deleted: (rows || []).length }; });
      case 'deleteAccountTree': // 항 + 하위 목(같은 앞 3자리)을 한 번에 삭제
        return rest('DELETE', 'budget?code=like.' + String(params.code || '').slice(0, 3) + '*', null, 'return=representation').then(function (rows) { return { ok: true, deleted: (rows || []).length }; });
      case 'listGyojeok':
        return rest('GET', 'gyojeok?select=*&order=name&limit=20000').then(function (rows) { return { ok: true, members: (rows || []).map(gjOut) }; });
      case 'addGyojeok': {
        var nm = String(params.name || '').trim();
        var bd = String(params.birth || '').replace(/[^0-9]/g, '');
        var ins = { name: nm, member_key: nm + '|' + bd, status: '정회원후보' };
        if (bd.length === 8) ins.birth = bd.slice(0, 4) + '-' + bd.slice(4, 6) + '-' + bd.slice(6, 8);
        // 교적 추가 폼의 부가 필드(성별·휴대폰·직책 등)를 GJ_MAP 으로 매핑해 함께 저장
        var xf = params.fields || {};
        Object.keys(xf).forEach(function (k) {
          var col = GJ_MAP[k];
          if (!col || col === 'name' || col === 'birth' || col === 'member_key') return;
          var val = xf[k];
          if (val === '' || val == null) return;
          ins[col] = val;
        });
        return rest('POST', 'gyojeok', ins, 'return=representation').then(function (rows) {
          var row = (rows && rows[0]) || {};
          return { ok: true, key: nm + '|' + bd, name: nm, id: row.id };
        });
      }
      // 교적 삭제 — 행을 지우지 않고 gyojeok_deleted 보관표로 옮긴다(supabase/20260817_2330_gyojeok_delete_archive.sql).
      // 1차 호출(force 없음)에서 헌금·계정연결·가족 등 걸림돌이 있으면 {ok:false,needConfirm:true,…건수}
      // 를 돌려주므로, 호출한 쪽이 관리자에게 보여준 뒤 force:true 로 다시 부른다.
      case 'deleteGyojeok':
        return rpc('delete_gyojeok', { p_id: params.id, p_reason: params.reason || null, p_force: !!params.force });
      case 'restoreGyojeok':
        return rpc('restore_gyojeok', { p_id: params.id });
      case 'listDeletedGyojeok':
        return rest('GET', 'gyojeok_deleted?select=*&order=deleted_at.desc&limit=2000').then(function (rows) {
          return { ok: true, members: (rows || []).map(function (r) { var o = gjOut(r); o['삭제일시'] = r.deleted_at; o['삭제사유'] = r.delete_reason || ''; return o; }) };
        });
      case 'updateGyojeok': {
        var f = params.fields || {}, patch = {};
        Object.keys(f).forEach(function (k) {
          var col = GJ_MAP[k]; if (!col) return;
          var val = f[k];
          if (GJ_DATECOLS[col] && (val === '' || val == null)) val = null;
          patch[col] = val;
        });
        if (f['이름'] && f['생년월일']) patch.member_key = f['이름'] + '|' + String(f['생년월일']).replace(/[^0-9]/g, '').slice(0, 8);
        return rest('PATCH', 'gyojeok?id=eq.' + encodeURIComponent(params.id), patch, 'return=minimal').then(function () { return { ok: true }; });
      }
      case 'listVouchers':
        return Promise.all([
          restAll('offerings?select=*&order=id'),
          restAll('expenses?select=*&order=id')
        ]).then(function (res) { return { ok: true, vouchers: (res[0] || []).map(offOut).concat((res[1] || []).map(expOut)) }; });
      case 'addVoucher': {
        var v = params.voucher || {};
        if (v.type === '지출') return rest('POST', 'expenses', toExpense(v), 'return=minimal').then(function () { return { ok: true }; });
        return rest('POST', 'offerings', toOffering(v), 'return=minimal').then(function () { return { ok: true }; });
      }
      case 'addVouchersBulk': {
        var vs = params.vouchers || [];
        var offs = vs.filter(function (v) { return v.type !== '지출'; }).map(toOffering);
        var exps = vs.filter(function (v) { return v.type === '지출'; }).map(toExpense);
        var tasks = [];
        if (offs.length) tasks.push(rest('POST', 'offerings', offs, 'return=minimal'));
        if (exps.length) tasks.push(rest('POST', 'expenses', exps, 'return=minimal'));
        return Promise.all(tasks).then(function () { return { ok: true, count: vs.length }; });
      }
      case 'updateVoucher': {
        var id = String(params.id || ''), vv = params.voucher || {};
        if (id.charAt(0) === 'E') return rest('PATCH', 'expenses?id=eq.' + id.slice(1), toExpense(vv), 'return=minimal').then(function () { return { ok: true }; });
        return rest('PATCH', 'offerings?id=eq.' + id.slice(1), toOffering(vv), 'return=minimal').then(function () { return { ok: true }; });
      }
      case 'deleteVoucher': {
        var did = String(params.id || '');
        var tbl = did.charAt(0) === 'E' ? 'expenses' : 'offerings';
        return rest('DELETE', tbl + '?id=eq.' + did.slice(1), null, 'return=minimal').then(function () { return { ok: true }; });
      }
      case 'clearVouchers': {
        var tbl2 = params.type === '지출' ? 'expenses' : 'offerings';
        return fetch(SB() + '/rest/v1/' + tbl2 + '?id=gt.0', { method: 'DELETE', headers: headers('return=representation') })
          .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(t); }); return r.text().then(function (t) { return t ? JSON.parse(t) : []; }); })
          .then(function (rows) { return { ok: true, deleted: (rows || []).length }; });
      }
      case 'budget':
        return rest('GET', 'budget?select=*&order=code&limit=5000').then(function (rows) { return { ok: true, budget: (rows || []).map(budOut) }; });
      case 'updateBudget':
        return rest('PATCH', 'budget?code=eq.' + encodeURIComponent(params.code), { budget: num(params.amount) }, 'return=minimal').then(function () { return { ok: true }; });
      case 'listAccess':
        return rpc('list_access').then(function (arr) { return { ok: true, users: arr || [] }; });
      case 'setAccess':
        return rpc('set_access', {
          p_uid: params.targetUid,
          p_is_admin: (typeof params.isAdmin === 'boolean') ? params.isAdmin : null,
          p_can_finance: (typeof params.canFinance === 'boolean') ? params.canFinance : null
        });
      // ── 계정 관리(최고관리자) — supabase/10_account.sql ──
      case 'deleteUser':
        return rpc('admin_delete_user', { p_uid: params.targetUid });
      case 'banUser':
        return rpc('admin_ban_user', { p_uid: params.targetUid, p_days: params.days || 0 });
      case 'tempPassword':
        return rpc('admin_temp_password', { p_uid: params.targetUid });
      case 'getSettings':
        return rest('GET', 'app_settings?select=key,value&limit=2000').then(function (rows) {
          var s = {}; (rows || []).forEach(function (r) { s[r.key] = r.value; }); return { ok: true, settings: s };
        });
      case 'setSetting':
        return rest('POST', 'app_settings?on_conflict=key', { key: params.key, value: String(params.value == null ? '' : params.value), updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal').then(function () { return { ok: true }; });
      case 'adminSetMember':
        return rpc('admin_set_member', { p_uid: params.uid, p_status: params.status, p_member_key: params.memberKey || '', p_member_name: params.memberName || '' });
      case 'listReceipts':
        return restAll('donation_receipts?select=*&order=id').then(function (rows) { return { ok: true, receipts: (rows || []).map(recOut) }; });
      case 'addReceipt': {
        var rc = params.receipt || {};
        var body = {
          receipt_no: rc.no, fy: rc.fy, member_key: rc.key || null, donor_name: rc.name,
          donor_birth: rc.birth || null, donor_rrn: rc.rrn || null, donor_addr: rc.addr || null,
          included_keys: rc.includedKeys || [], detail: rc.detail || 'sum', spouse: !!rc.spouse,
          period_label: rc.period || null, amount: num(rc.amount), cnt: Number(rc.cnt) || 0,
          method: rc.method || 'print', status: 'issued'
        };
        return rest('POST', 'donation_receipts', body, 'return=representation').then(function (rows) { return { ok: true, receipt: recOut((rows || [])[0] || body) }; });
      }
      case 'cancelReceipt':
        return rest('PATCH', 'donation_receipts?id=eq.' + encodeURIComponent(params.id), { status: 'cancelled', cancelled_at: new Date().toISOString() }, 'return=minimal').then(function () { return { ok: true }; });
      case 'exportSermonPdf':
        return appsScript('exportSermonPdf', params);
      default:
        return Promise.reject(new Error('unknown action: ' + action));
    }
  }

  return { token: token, loggedIn: loggedIn, call: call };
})();
