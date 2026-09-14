-- ============================================================
--  동탄반석교회 — 3단계: 재정(헌금 · 지출 · 예산 · 기부금영수증)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run. (01, 02 를 먼저 실행하세요)
--
--  [읽기 권한 요약 — 설계서 7장]
--   · 헌금(offerings) : 본인(과 배우자)은 자기 것만, 재정권한자는 전체
--   · 지출·예산·계정·설정·영수증 : 재정권한자(=관리자 포함)만
--   · 교적은 이 파일이 아니라 02 에서 따로 통제된다(재정위원에게 열리지 않음)
-- ============================================================

-- ── 헌금 ────────────────────────────────────────────────────
create table if not exists public.offerings (
  id          bigint generated always as identity primary key,
  offer_date  date,
  category    text,        -- 헌금 항목(주정헌금·감사헌금·선교헌금 …)
  service     text,        -- 예배
  giver       text,        -- 헌금자 이름
  member_key  text,        -- 교적 매칭키(이름|YYYYMMDD)
  amount      integer not null default 0,
  method      text,        -- 현금 / 계좌이체 …
  memo        text,        -- 적요(헌금 사유)
  source      text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz default now(),
  updated_by  uuid,
  updated_at  timestamptz
);
create index if not exists offerings_member_key_idx on public.offerings (member_key);
create index if not exists offerings_date_idx       on public.offerings (offer_date);

-- ── 지출 ────────────────────────────────────────────────────
create table if not exists public.expenses (
  id         bigint generated always as identity primary key,
  exp_date   date,
  account    text,         -- 계정과목(목)
  category   text,         -- 상위 계정(항)
  payee      text,         -- 지급처
  amount     integer not null default 0,
  method     text,
  memo       text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_by uuid,
  updated_at timestamptz
);
create index if not exists expenses_date_idx on public.expenses (exp_date);

-- ── 마스터: 계정과목 · 예배 · 예산 ───────────────────────────
create table if not exists public.accounts (
  id       bigint generated always as identity primary key,
  code     text,
  atype    text,            -- 수입 / 지출
  category text,            -- 상위 계정(항)
  name     text,            -- 계정명(목)
  sort     int default 0
);

create table if not exists public.services (
  id     bigint generated always as identity primary key,
  name   text,
  sort   int default 0,
  active boolean default true
);

-- 예산 표가 계정과목의 단일 원본이다.
--  · 코드 끝 4자리가 0000 이면 '항'(묶음), 그 외는 '목'(실제 계정)
--  · 재정관리의 계정 드롭다운은 이 표에서 '목'만 뽑아 만든다
create table if not exists public.budget (
  id          bigint generated always as identity primary key,
  code        text,
  name        text,
  atype       text,          -- 수입 / 지출
  prev_budget bigint default 0,
  prev_actual bigint default 0,
  budget      bigint default 0
);
create unique index if not exists budget_code_idx on public.budget (code);

-- ── 회계 설정(이월금 · 영수증 발급기관 등) ────────────────────
create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);

-- ── 기부금영수증 발급대장 ────────────────────────────────────
create table if not exists public.donation_receipts (
  id            bigint generated always as identity primary key,
  receipt_no    text not null,                  -- 일련번호 예) 2026-0001
  fy            int  not null,                  -- 회계연도
  member_key    text,
  donor_name    text not null,
  donor_birth   text,                           -- YYYYMMDD (주민등록번호는 받지 않음)
  donor_rrn     text,
  donor_addr    text,
  included_keys text[] default '{}',            -- 부부 합산 시 본인+배우자 매칭키
  detail        text not null default 'sum',    -- sum(합계) | month(월별) | account(항목별)
  spouse        boolean not null default false,
  period_label  text,
  amount        bigint not null default 0,
  cnt           int not null default 0,
  method        text not null default 'print',  -- print | pdf
  status        text not null default 'issued', -- issued | cancelled
  issued_by     text,
  issued_at     timestamptz not null default now(),
  cancelled_at  timestamptz
);
create index if not exists donation_receipts_fy_idx  on public.donation_receipts (fy);
create index if not exists donation_receipts_key_idx on public.donation_receipts (member_key);

-- ── 접근 규칙(RLS) ──────────────────────────────────────────
alter table public.offerings         enable row level security;
alter table public.expenses          enable row level security;
alter table public.accounts          enable row level security;
alter table public.services          enable row level security;
alter table public.budget            enable row level security;
alter table public.app_settings      enable row level security;
alter table public.donation_receipts enable row level security;

-- 헌금: 본인(+배우자) 것만 보이고, 재정권한자는 전체. 입력·수정은 재정권한자만.
drop policy if exists offerings_select on public.offerings;
create policy offerings_select on public.offerings for select
  using ( public.is_finance() or member_key in (select public.my_member_keys()) );
drop policy if exists offerings_write on public.offerings;
create policy offerings_write on public.offerings for all
  using ( public.is_finance() ) with check ( public.is_finance() );

drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses for all
  using (public.is_finance()) with check (public.is_finance());

drop policy if exists accounts_all on public.accounts;
create policy accounts_all on public.accounts for all
  using (public.is_finance()) with check (public.is_finance());

drop policy if exists services_all on public.services;
create policy services_all on public.services for all
  using (public.is_finance()) with check (public.is_finance());

drop policy if exists budget_all on public.budget;
create policy budget_all on public.budget for all
  using (public.is_finance()) with check (public.is_finance());

drop policy if exists app_settings_all on public.app_settings;
create policy app_settings_all on public.app_settings for all
  using (public.is_finance()) with check (public.is_finance());

drop policy if exists donation_receipts_all on public.donation_receipts;
create policy donation_receipts_all on public.donation_receipts for all
  using (public.is_finance()) with check (public.is_finance());

-- ── 기본값 시드 (비어 있을 때만) ─────────────────────────────
insert into public.services (name, sort)
select x.name, x.sort from (values
  ('주일 낮 예배',1),('주일 오후 예배',2),('수요 기도회',3),('새벽 기도회',4),('기타',5)
) as x(name, sort)
where not exists (select 1 from public.services);

-- 계정과목 기본 틀 — 교회 사정에 맞춰 재정관리 ▸ 계정과목 관리에서 고칠 수 있다.
insert into public.budget (code, name, atype, budget)
select x.code, x.name, x.atype, 0 from (values
  ('1010000','경상헌금','수입'),
  ('1010100','주정헌금','수입'),
  ('1010200','감사헌금','수입'),
  ('1010300','십일조','수입'),
  ('1010400','절기헌금','수입'),
  ('1020000','목적헌금','수입'),
  ('1020100','선교헌금','수입'),
  ('1020200','건축헌금','수입'),
  ('1020300','장학헌금','수입'),
  ('2010000','예배비','지출'),
  ('2010100','강사비','지출'),
  ('2010200','성찬비','지출'),
  ('2020000','교육비','지출'),
  ('2020100','주일학교','지출'),
  ('2030000','선교비','지출'),
  ('2040000','관리운영비','지출'),
  ('2040100','공과금','지출'),
  ('2040200','수리비','지출'),
  ('2050000','인건비','지출')
) as x(code, name, atype)
where not exists (select 1 from public.budget);

-- 전기 이월금(회계 시작 잔액) — 재정관리 ▸ 설정에서 바꿀 수 있다.
insert into public.app_settings (key, value)
select 'carryover_' || extract(year from now())::text, '0'
where not exists (select 1 from public.app_settings where key like 'carryover_%');

notify pgrst, 'reload schema';
