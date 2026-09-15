-- ============================================================
--  동탄반석교회 — 10단계: 계정 관리 (탈퇴 · 삭제 · 정지 · 임시 비밀번호)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--  실행 순서: 01 → … → 09 → 10
--
--  [이 파일이 만드는 것]
--   · withdraw_me()        — 성도 본인의 회원 탈퇴
--   · admin_delete_user()  — 최고관리자가 가입자를 지운다
--   · admin_ban_user()     — 최고관리자가 가입자를 정지·해제한다
--   · admin_temp_password()— 최고관리자가 임시 비밀번호를 발급한다
--
--  [왜 함수로 두는가]
--   계정을 지우는 일은 auth 영역을 건드린다. 화면에 그 권한을 줄 수는 없으므로
--   security definer 함수 안에 가두고, 그 안에서 누가 부르는지를 먼저 따진다.
--
--  [지켜지는 것]
--   · 탈퇴·삭제하면 로그인 계정과 홈페이지 기록(프로필·동의·성경읽기)이 지워진다.
--   · 교적과 헌금은 교회 장부이므로 남는다(이용약관 제6조).
--   · 최고관리자는 자기 자신을 지우거나 정지시킬 수 없다. 마지막 한 사람도 마찬가지다.
--     문이 모두 잠겨 아무도 들어갈 수 없게 되는 일을 막는다.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ── 1) 본인 탈퇴 ───────────────────────────────────────────
create or replace function public.withdraw_me()
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;
  -- 최고관리자가 실수로 자기 계정을 지우면 아무도 관리 화면에 들어갈 수 없다
  if exists (select 1 from public.admins where uid = v_uid) then
    return json_build_object('ok', false,
      'error', '최고관리자 계정은 홈페이지에서 탈퇴할 수 없습니다. 다른 최고관리자에게 요청해 주세요.');
  end if;

  delete from auth.users where id = v_uid;   -- 딸린 기록은 함께 지워진다
  return json_build_object('ok', true);
end $$;
grant execute on function public.withdraw_me() to authenticated;

-- ── 2) 최고관리자 — 가입자 삭제 ─────────────────────────────
create or replace function public.admin_delete_user(p_uid uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'error', '최고관리자만 가능합니다.');
  end if;
  if p_uid = auth.uid() then
    return json_build_object('ok', false, 'error', '자기 계정은 지울 수 없습니다.');
  end if;
  if exists (select 1 from public.admins where uid = p_uid)
     and (select count(*) from public.admins) <= 1 then
    return json_build_object('ok', false, 'error', '마지막 최고관리자는 지울 수 없습니다.');
  end if;

  delete from auth.users where id = p_uid;
  return json_build_object('ok', true);
end $$;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ── 3) 최고관리자 — 정지 · 해제 ─────────────────────────────
--  p_days 가 0 이면 정지를 푼다. 정지된 계정은 로그인 자체가 막힌다.
create or replace function public.admin_ban_user(p_uid uuid, p_days integer)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'error', '최고관리자만 가능합니다.');
  end if;
  if p_uid = auth.uid() then
    return json_build_object('ok', false, 'error', '자기 계정은 정지할 수 없습니다.');
  end if;

  if coalesce(p_days, 0) <= 0 then
    update auth.users set banned_until = null where id = p_uid;
    return json_build_object('ok', true, 'banned', false);
  end if;

  update auth.users set banned_until = now() + (p_days || ' days')::interval where id = p_uid;
  -- 이미 들어와 있는 접속도 끊는다
  delete from auth.sessions where user_id = p_uid;
  return json_build_object('ok', true, 'banned', true, 'days', p_days);
end $$;
grant execute on function public.admin_ban_user(uuid, integer) to authenticated;

-- ── 4) 최고관리자 — 임시 비밀번호 발급 ──────────────────────
--  비밀번호를 잊으신 분께 메일이 닿지 않을 때 쓰는 마지막 방법입니다.
--  발급한 비밀번호는 이 자리에서 한 번만 보이고 다시 볼 수 없습니다.
--  받으신 분은 곧바로 바꾸도록 안내해 주세요.
create or replace function public.admin_temp_password(p_uid uuid)
returns json language plpgsql security definer
set search_path = public, extensions as $$
declare v_pw text; v_email text;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'error', '최고관리자만 가능합니다.');
  end if;

  select email into v_email from auth.users where id = p_uid;
  if v_email is null then
    return json_build_object('ok', false, 'error', '그런 계정이 없습니다.');
  end if;

  -- 읽어 주기 쉬운 열 자리 (헷갈리는 0·O·1·l 은 뺀다)
  select string_agg(substr('23456789abcdefghijkmnpqrstuvwxyz', (random() * 31 + 1)::int, 1), '')
    into v_pw from generate_series(1, 10);

  update auth.users
     set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_uid;

  delete from auth.sessions where user_id = p_uid;   -- 쓰던 접속은 끊는다

  return json_build_object('ok', true, 'email', v_email, 'password', v_pw);
end $$;
grant execute on function public.admin_temp_password(uuid) to authenticated;

-- ── 5) 회원 목록에 계정 상태를 함께 ─────────────────────────
--  권한 관리 화면이 '정지됨' 을 표시할 수 있도록 list_access 를 넓힌다.
create or replace function public.list_access()
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(row), '[]'::json) from (
    select json_build_object(
      'uid', p.id, 'name', coalesce(l.member_name, p.name, ''), 'email', coalesce(p.email,''),
      'status', coalesce(l.member_status,'준회원'), 'canFinance', coalesce(l.can_finance,false),
      'isAdmin', exists(select 1 from public.admins a where a.uid = p.id),
      'banned', (select u.banned_until is not null and u.banned_until > now()
                   from auth.users u where u.id = p.id),
      'joined', p.created_at
    ) as row
    from public.profiles p left join public.member_links l on l.user_id = p.id
    where exists(select 1 from public.admins where uid = auth.uid())
    order by exists(select 1 from public.admins a where a.uid = p.id) desc, coalesce(l.member_name, p.name)
  ) t;
$$;
grant execute on function public.list_access() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
--  확인용
--    select email, banned_until from auth.users order by created_at desc;
-- ============================================================
