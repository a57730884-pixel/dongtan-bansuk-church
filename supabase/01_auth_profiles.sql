-- ============================================================
--  동탄반석교회 — 1단계: 로그인 계정 · 권한 기반
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (한 번만, 여러 번 실행해도 안전)
--  실행 순서: 01 → 02 → 03 → 04 → 05
--
--  [이 파일이 만드는 것]
--   · profiles      — 홈페이지 로그인 계정(이메일·이름)
--   · admins        — 담임목사 등 관리자 목록. 여기 있으면 모든 문이 열린다.
--   · member_links  — "이 로그인 계정이 교적의 누구인가 + 재정 권한이 있는가"
--   · is_finance() / my_member_keys() — 접근 규칙(RLS)이 쓰는 공용 판단 함수
--
--  [설계 원칙]
--   권한은 화면에서 메뉴를 감추는 방식이 아니라, 데이터베이스의 행 단위
--   접근 규칙(RLS)으로 강제한다. 주소창에 관리 화면 주소를 직접 쳐 넣어도
--   데이터가 내려오지 않는다.
-- ============================================================

-- ── 1) 회원 프로필 ─────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  email      text,
  role       text,                 -- 직분(집사·권사·장로 등) 표시용
  phone      text,
  birth      text,
  address    text,
  provider   text,
  created_at timestamptz not null default now()
);

-- ── 2) 관리자 ──────────────────────────────────────────────
create table if not exists public.admins (
  uid uuid primary key references auth.users (id) on delete cascade
);

-- ── 3) 회원 ↔ 교적 연결 + 재정 권한 ─────────────────────────
create table if not exists public.member_links (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  member_status  text not null default '준회원',   -- '준회원' | '정회원'
  member_key     text,                             -- 교적 매칭키 (이름|YYYYMMDD)
  member_name    text,
  member_id      integer,                          -- 종이 교적부 번호(있으면)
  spouse_key     text,
  can_finance    boolean not null default false,   -- 재정관리 접근 권한
  matched_at     timestamptz,
  note           text,
  updated_at     timestamptz not null default now()
);
create index if not exists member_links_key_idx on public.member_links (member_key);

-- ── 4) 가입 시 프로필 자동 생성 ──────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, provider)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name',
             new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'nickname',
             split_part(coalesce(new.email,''),'@',1)),
    new.email,
    coalesce(new.raw_app_meta_data->>'provider','email')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 트리거 적용 전에 가입한 사람 보충
insert into public.profiles (id, name, email, provider)
select u.id,
       coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'nickname', split_part(coalesce(u.email,''),'@',1)),
       u.email,
       coalesce(u.raw_app_meta_data->>'provider','email')
from auth.users u
on conflict (id) do nothing;

-- ── 5) 공용 판단 함수 ───────────────────────────────────────
-- 재정 접근 가능자 = 관리자 이거나 재정권한을 받은 사람
create or replace function public.is_finance()
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.admins a where a.uid = auth.uid())
      or exists(select 1 from public.member_links m where m.user_id = auth.uid() and m.can_finance = true)
$$;

-- 내 매칭키 집합(본인 + 배우자) — 헌금 조회 범위를 정한다
create or replace function public.my_member_keys()
returns setof text language sql security definer stable set search_path = public as $$
  select member_key from public.member_links where user_id = auth.uid() and coalesce(member_key,'') <> ''
  union
  select spouse_key from public.member_links where user_id = auth.uid() and coalesce(spouse_key,'') <> ''
$$;

-- ── 6) 접근 규칙(RLS) ───────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.admins       enable row level security;
alter table public.member_links enable row level security;

grant select, insert, update, delete on public.member_links to authenticated;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select using (auth.uid() = id or auth.uid() in (select uid from public.admins));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id);

drop policy if exists admins_select_self on public.admins;
create policy admins_select_self on public.admins
  for select using (auth.uid() = uid);

drop policy if exists member_links_select on public.member_links;
create policy member_links_select on public.member_links
  for select using (auth.uid() = user_id or auth.uid() in (select uid from public.admins));

drop policy if exists member_links_admin_write on public.member_links;
create policy member_links_admin_write on public.member_links
  for all using (auth.uid() in (select uid from public.admins))
      with check (auth.uid() in (select uid from public.admins));

-- ============================================================
-- ★ 마지막에 한 번만 — 담임목사 계정을 관리자로 등록 ★
--  1) 홈페이지에서 담임목사님 계정으로 한 번 로그인
--  2) Supabase ▸ Authentication ▸ Users 에서 그 계정의 User UID 복사
--  3) 아래 한 줄의 '여기에-UID' 를 바꿔 실행
--
-- insert into public.admins (uid) values ('여기에-UID') on conflict do nothing;
-- ============================================================
