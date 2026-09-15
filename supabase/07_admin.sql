-- ============================================================
--  동탄반석교회 — 관리자 등록 (필요할 때마다 실행)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run
--
--  [먼저 확인]
--   등록하려는 분이 홈페이지에서 회원가입을 마치고
--   가입 확인 메일의 링크까지 눌러야 계정이 생깁니다.
--   계정이 없으면 아래를 실행해도 아무 일도 일어나지 않습니다.
--
--  [권한의 뜻]
--   admins 에 들어가면 교적·재정을 포함해 모든 문이 열립니다.
--   이 표에 있는 사람들 사이에 등급 차이는 없습니다.
--   그러므로 꼭 필요한 분만 넣으십시오.
-- ============================================================

-- ── 아래 이메일만 바꾸어 쓰십시오 ────────────────────────────
do $$
declare
  target_email text := 'a57730884@gmail.com';   -- ★ 여기만 고치세요
  target_uid   uuid;
begin
  select id into target_uid from auth.users where lower(email) = lower(target_email);

  if target_uid is null then
    raise notice '[안내] % 로 가입한 계정이 없습니다. 홈페이지에서 먼저 회원가입하고 확인 메일의 링크를 누른 뒤 다시 실행하세요.', target_email;
    return;
  end if;

  insert into public.admins (uid) values (target_uid) on conflict do nothing;
  raise notice '[완료] % 을(를) 관리자로 등록했습니다. (uid=%)', target_email, target_uid;
end $$;

-- ── 확인 — 지금 관리자는 누구인가 ───────────────────────────
select u.email,
       coalesce(p.name, '-')            as 이름,
       u.created_at                     as 가입일,
       (u.email_confirmed_at is not null) as 메일인증
  from public.admins a
  join auth.users u on u.id = a.uid
  left join public.profiles p on p.id = a.uid
 order by u.created_at;

-- ── 관리자에서 내리려면 ─────────────────────────────────────
-- delete from public.admins
--  where uid = (select id from auth.users where lower(email) = lower('내릴-이메일'));
