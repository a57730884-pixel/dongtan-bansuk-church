-- ============================================================
--  동탄반석교회 — 4단계: 권한 작업 함수(RPC)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run. (01~03 을 먼저 실행하세요)
--
--  화면(js/finance-api.js)이 부르는 함수들입니다.
--   · match_member      — 이름+생년월일로 교적 인증 (준회원 → 정회원)
--   · my_profile        — 내 등급·매칭키·배우자·재정권한
--   · my_family         — 우리 가정 구성원(연락처 제외)
--   · list_access       — 가입한 회원 목록 (관리자만)
--   · set_access        — 관리자/재정권한 부여·회수 (관리자만)
--   · admin_set_member  — 준회원 ↔ 정회원 및 교적 연결 (관리자만)
--  모두 security definer — 표를 직접 열지 않고 이 문을 통해서만 처리합니다.
-- ============================================================

-- ── 교적 인증: 이름 + 생년월일(8자리) ────────────────────────
create or replace function public.match_member(p_name text, p_birth text)
returns json language plpgsql security definer set search_path = public as $$
declare v_key text; v_g public.gyojeok%rowtype; v_found boolean := false;
begin
  if coalesce(p_name,'') = '' or p_birth !~ '^[0-9]{8}$' then
    return json_build_object('ok', false, 'error', '이름과 생년월일(YYYYMMDD)을 정확히 입력하세요.');
  end if;
  v_key := p_name || '|' || p_birth;
  select * into v_g from public.gyojeok where member_key = v_key limit 1;
  v_found := found;
  insert into public.member_links(user_id, member_status, member_key, member_name, spouse_key, matched_at, updated_at)
  values (auth.uid(), case when v_found then '정회원' else '준회원' end, v_key, p_name,
          case when v_found then coalesce(v_g.spouse_key,'') else null end,
          case when v_found then now() else null end, now())
  on conflict (user_id) do update set
    member_status = excluded.member_status,
    member_key    = excluded.member_key,
    member_name   = excluded.member_name,
    spouse_key    = coalesce(excluded.spouse_key, public.member_links.spouse_key),
    matched_at    = coalesce(excluded.matched_at, public.member_links.matched_at),
    updated_at    = now();
  if v_found then
    return json_build_object('ok', true, 'status', '정회원', 'name', p_name);
  else
    return json_build_object('ok', true, 'status', '준회원',
      'message', '교적에서 이름과 생년월일이 일치하는 분을 찾지 못했습니다. 교회에 문의해 주세요.');
  end if;
end $$;

-- ── 내 상태 ─────────────────────────────────────────────────
create or replace function public.my_profile()
returns json language plpgsql security definer set search_path = public as $$
declare v_link public.member_links%rowtype; v_g public.gyojeok%rowtype;
        v_spouse text := ''; v_spousekey text := '';
begin
  select * into v_link from public.member_links where user_id = auth.uid() limit 1;
  if v_link.member_status = '정회원' and coalesce(v_link.member_key,'') <> '' then
    select * into v_g from public.gyojeok where member_key = v_link.member_key limit 1;
    if found then
      v_spouse := coalesce(v_g.spouse,''); v_spousekey := coalesce(v_g.spouse_key,'');
      update public.member_links set spouse_key = v_spousekey
        where user_id = auth.uid() and coalesce(spouse_key,'') <> v_spousekey;
    end if;
  end if;
  return json_build_object(
    'status',     coalesce(v_link.member_status, '준회원'),
    'memberName', coalesce(v_link.member_name, ''),
    'memberKey',  coalesce(v_link.member_key, ''),
    'spouse',     v_spouse,
    'spouseKey',  v_spousekey,
    'canFinance', (exists(select 1 from public.admins where uid = auth.uid()) or coalesce(v_link.can_finance, false)),
    'isAdmin',    exists(select 1 from public.admins where uid = auth.uid())
  );
end $$;

-- ── 우리 가정(본인 세대 + 부모 세대 + 분가한 자녀 세대) ───────
--    이름·관계·생년·직분만 돌려준다(연락처·주소 제외).
create or replace function public.my_family()
returns table (
  name text, member_key text, head text, relation text,
  spouse text, spouse_key text, origin_head text, birth date, role text
) language sql security definer stable set search_path = public as $$
  with me as (
    select g.head, g.name from public.gyojeok g
    where g.member_key in (select public.my_member_keys())
    order by g.id limit 1
  ),
  myhead as (select coalesce(nullif((select head from me), ''), (select name from me)) as h),
  headrow as (select g.origin_head from public.gyojeok g where g.name = (select h from myhead) order by g.id limit 1),
  heads as (
    select (select h from myhead) as h
    union select nullif((select origin_head from headrow), '')
    union select g.name from public.gyojeok g
      where g.origin_head = (select h from myhead) and coalesce(g.origin_head, '') <> ''
  )
  select g.name, g.member_key, g.head, g.relation, g.spouse, g.spouse_key, g.origin_head, g.birth, g.role
  from public.gyojeok g
  where coalesce(nullif(g.head, ''), g.name) in (select h from heads where coalesce(h, '') <> '');
$$;

-- ── 회원 목록(관리자만) ─────────────────────────────────────
create or replace function public.list_access()
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(row), '[]'::json) from (
    select json_build_object(
      'uid', p.id, 'name', coalesce(l.member_name, p.name, ''), 'email', coalesce(p.email,''),
      'status', coalesce(l.member_status,'준회원'), 'canFinance', coalesce(l.can_finance,false),
      'isAdmin', exists(select 1 from public.admins a where a.uid = p.id)
    ) as row
    from public.profiles p left join public.member_links l on l.user_id = p.id
    where exists(select 1 from public.admins where uid = auth.uid())
    order by exists(select 1 from public.admins a where a.uid = p.id) desc, coalesce(l.member_name, p.name)
  ) t;
$$;

-- ── 권한 부여·회수(관리자만) ────────────────────────────────
create or replace function public.set_access(p_uid uuid, p_is_admin boolean, p_can_finance boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'error', '관리자만 가능합니다.');
  end if;
  if p_is_admin is not null then
    if p_is_admin then insert into public.admins(uid) values (p_uid) on conflict (uid) do nothing;
    else delete from public.admins where uid = p_uid; end if;
  end if;
  if p_can_finance is not null then
    insert into public.member_links(user_id, can_finance, updated_at) values (p_uid, p_can_finance, now())
    on conflict (user_id) do update set can_finance = p_can_finance, updated_at = now();
  end if;
  return json_build_object('ok', true);
end $$;

-- ── 준회원 ↔ 정회원 + 교적 연결(관리자만) ────────────────────
--   생년월일이 없는 교인(영유아 등)은 자동 인증이 안 되므로 여기서 수동 연결한다.
create or replace function public.admin_set_member(p_uid uuid, p_status text, p_member_key text, p_member_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_spousekey text := '';
begin
  if not exists (select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'error', '관리자만 가능합니다.');
  end if;
  if p_status = '정회원' and coalesce(p_member_key, '') <> '' then
    select coalesce(spouse_key, '') into v_spousekey from public.gyojeok where member_key = p_member_key limit 1;
  end if;
  insert into public.member_links (user_id, member_status, member_key, member_name, spouse_key, updated_at)
  values (p_uid, p_status, nullif(p_member_key, ''), nullif(p_member_name, ''), nullif(v_spousekey, ''), now())
  on conflict (user_id) do update set
    member_status = excluded.member_status,
    member_key    = excluded.member_key,
    member_name   = coalesce(excluded.member_name, public.member_links.member_name),
    spouse_key    = excluded.spouse_key,
    updated_at    = now();
  return json_build_object('ok', true);
end $$;

grant execute on function public.match_member(text, text)                          to authenticated;
grant execute on function public.my_profile()                                      to authenticated;
grant execute on function public.my_family()                                       to authenticated;
grant execute on function public.list_access()                                     to authenticated;
grant execute on function public.set_access(uuid, boolean, boolean)                to authenticated;
grant execute on function public.admin_set_member(uuid, text, text, text)          to authenticated;

notify pgrst, 'reload schema';
