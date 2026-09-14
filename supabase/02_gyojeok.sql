-- ============================================================
--  동탄반석교회 — 2단계: 교적(gyojeok)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run. (01 을 먼저 실행하세요)
--
--  [왜 교적이 먼저인가]
--   설계서 5.2 — "교적이 없으면 설계를 못 합니다."
--   헌금·기부금영수증·가정 합산·정회원 승격이 모두 교적의 매칭키
--   (이름|생년월일)를 기준으로 연결된다.
--
--  [개인정보]
--   교적은 담임목사(관리자)만 열람·수정한다. 재정권한자에게도 열리지 않게
--   하려면 아래 정책의 is_finance() 를 admins 전용 조건으로 바꾸면 된다
--   (기본값은 운평 시스템과 동일하게 is_finance()).
--   주민등록번호는 저장하지 않는다.
-- ============================================================

create table if not exists public.gyojeok (
  id              bigint generated always as identity primary key,
  gyojeok_id      integer,     -- 종이 교적부의 번호(있으면)
  name            text,
  birth           date,
  member_key      text,        -- 매칭키: 이름|YYYYMMDD (정회원 승격 판정 기준)
  head            text,        -- 세대주 이름
  relation        text,        -- 세대주와의 관계(본인·배우자·장남·차녀 …)
  spouse          text,        -- 배우자 이름
  spouse_key      text,        -- 배우자 매칭키(헌금 가정 합산에 쓰임)
  groups          text,        -- 구역·그룹
  role            text,        -- 직분(목사·장로·권사·집사·성도)
  grade           text,        -- 신급(학습·세례·입교)
  sex             text,        -- 남 / 여
  phone           text,
  address         text,        -- 심방용
  status          text,        -- 회원상태(정회원·준회원후보 등)
  photo           text,        -- 사진 주소(Storage)
  baptism_date    date,
  ordination_date date,
  belong_groups   text,        -- 소속 그룹(찬양대·남선교회 등)
  origin_head     text,        -- 분가 출신 세대주(가계도에서 부모 가정과 잇는 가지)
  ss_role         text,        -- 주일학교(영유아부·유년부·중등부·고등부·교사)
  created_at      timestamptz default now()
);
create index if not exists gyojeok_member_key_idx on public.gyojeok (member_key);
create index if not exists gyojeok_name_idx       on public.gyojeok (name);
create index if not exists gyojeok_head_idx       on public.gyojeok (head);

alter table public.gyojeok enable row level security;

drop policy if exists gyojeok_select on public.gyojeok;
create policy gyojeok_select on public.gyojeok for select using ( public.is_finance() );

drop policy if exists gyojeok_write on public.gyojeok;
create policy gyojeok_write on public.gyojeok for all
  using ( public.is_finance() ) with check ( public.is_finance() );

-- ── (선택) 진행 중인 교육 — 교적 상세에 "새가족반 수강 중" 처럼 표시 ──
--   없어도 교적관리는 정상 동작한다(교육 칸만 비어 있음).
create table if not exists public.edu_records (
  id           bigint generated always as identity primary key,
  title        text,          -- 예: 새가족반
  cohort       text,          -- 예: 12기
  class_name   text,          -- 예: 수요반
  edu_date     date,          -- 시작일
  end_date     date,          -- 종료일(비우면 진행 중)
  participants text,          -- JSON 배열 [{key:"이름|YYYYMMDD", name:"홍길동"}]
  created_at   timestamptz default now()
);
alter table public.edu_records enable row level security;
drop policy if exists edu_records_all on public.edu_records;
create policy edu_records_all on public.edu_records for all
  using ( public.is_finance() ) with check ( public.is_finance() );

-- ============================================================
--  교적 삭제(보관 이동) + 복원
--  교회 규칙상 교인 데이터는 지우지 않는다. '삭제'는 행을 없애는 것이
--  아니라 gyojeok_deleted 보관표로 '옮기는' 것으로 구현한다.
--   · 관리자(admins)만 실행 가능 — 재정권한자는 삭제 불가
--   · 헌금·영수증·계정·가족이 걸려 있으면 1차 호출은 건수만 돌려주고 멈춘다
--   · 헌금 기록(offerings)은 절대 건드리지 않는다(회계 원장 보존)
--   · 진짜 물리 삭제는 최소 4주 후, 백업 확인 후, 사람이 직접
-- ============================================================

-- 1) 삭제 보관표 ------------------------------------------------
--    교적과 같은 칼럼 + 누가 언제 왜 지웠는지. id는 원본 교적ID를 그대로 보존한다.
create table if not exists public.gyojeok_deleted (like public.gyojeok);

alter table public.gyojeok_deleted add column if not exists deleted_at    timestamptz not null default now();
alter table public.gyojeok_deleted add column if not exists deleted_by    uuid;
alter table public.gyojeok_deleted add column if not exists delete_reason text;

-- 같은 교적ID가 두 번 보관되지 않도록(삭제→복원→삭제 반복 대비)
create unique index if not exists gyojeok_deleted_id_idx on public.gyojeok_deleted (id);

alter table public.gyojeok_deleted enable row level security;

-- PostgREST로 보관함을 읽을 수 있게(실제 차단은 아래 RLS). 쓰기 권한은 주지 않는다
-- — 넣고 빼는 일은 아래 security definer 함수만 한다.
grant select on public.gyojeok_deleted to authenticated;

drop policy if exists gyojeok_deleted_select on public.gyojeok_deleted;
create policy gyojeok_deleted_select on public.gyojeok_deleted
  for select using (exists (select 1 from public.admins a where a.uid = auth.uid()));

-- 2) 삭제(보관 이동) -------------------------------------------
create or replace function public.delete_gyojeok(
  p_id     bigint,
  p_reason text    default null,
  p_force  boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_g       public.gyojeok%rowtype;
  v_head    text;
  v_keydup  int := 0;   -- 같은 매칭키를 쓰는 다른 교적(동명이인+생년월일 없음)
  v_namedup int := 0;   -- 같은 이름을 쓰는 다른 교적
  v_off     int := 0;   -- 헌금 건수
  v_rec     int := 0;   -- 기부금영수증 건수
  v_link    int := 0;   -- 연결된 홈페이지 계정
  v_sub     int := 0;   -- 주일학교 인증(QT·필사) 건수
  v_file    int := 0;   -- 개인 파일
  v_fam     int := 0;   -- 이 사람을 세대주로 둔 가족
  v_branch  int := 0;   -- 이 사람을 부모세대로 둔 분가 가정
  v_unspouse int := 0;  -- 실제로 정리한 배우자 연결 수
  v_unfam    int := 0;  -- 실제로 해산한 가족 수
  v_unlink   int := 0;  -- 실제로 끊은 계정 연결 수
  v_n        int := 0;  -- 직전 UPDATE 가 바꾼 행 수(임시)
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', '관리자만 교적을 삭제할 수 있습니다.');
  end if;

  select * into v_g from public.gyojeok where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', '교적을 찾을 수 없습니다(이미 삭제되었을 수 있습니다).');
  end if;

  v_head := coalesce(nullif(btrim(v_g.head), ''), v_g.name);

  -- 동명이인 여부(연결 정리를 해도 되는지 판단하는 기준)
  select count(*) into v_keydup from public.gyojeok
   where id <> v_g.id and coalesce(member_key, '') <> '' and member_key = v_g.member_key;
  select count(*) into v_namedup from public.gyojeok
   where id <> v_g.id and name = v_g.name;

  -- 걸림돌 집계 — 아직 만들지 않은 표가 있어도 삭제가 막히지 않게 to_regclass 로 확인 후 조회
  if coalesce(v_g.member_key, '') <> '' then
    select count(*) into v_off  from public.offerings    where member_key = v_g.member_key;
    select count(*) into v_link from public.member_links where member_key = v_g.member_key;
    if to_regclass('public.donation_receipts') is not null then
      execute 'select count(*) from public.donation_receipts where member_key = $1' into v_rec using v_g.member_key;
    end if;
    if to_regclass('public.ss_submissions') is not null then
      execute 'select count(*) from public.ss_submissions where member_key = $1' into v_sub using v_g.member_key;
    end if;
    if to_regclass('public.member_files') is not null then
      execute 'select count(*) from public.member_files where member_key = $1' into v_file using v_g.member_key;
    end if;
  end if;
  if v_head = v_g.name then
    select count(*) into v_fam from public.gyojeok
     where id <> v_g.id and coalesce(nullif(btrim(head), ''), name) = v_g.name;
    select count(*) into v_branch from public.gyojeok
     where id <> v_g.id and origin_head = v_g.name;
  end if;

  -- 1차 호출: 걸림돌이 있으면 지우지 않고 건수만 돌려준다(관리자 확인용)
  if not p_force and (v_off > 0 or v_rec > 0 or v_link > 0 or v_sub > 0 or v_file > 0 or v_fam > 0 or v_branch > 0) then
    return jsonb_build_object(
      'ok', false, 'needConfirm', true, 'name', v_g.name,
      'offerings', v_off, 'receipts', v_rec, 'links', v_link,
      'submissions', v_sub, 'files', v_file, 'family', v_fam, 'branches', v_branch,
      'sameKey', v_keydup, 'sameName', v_namedup
    );
  end if;

  -- 배우자 연결 해제 — 매칭키/이름이 겹치지 않을 때만(동명이인 오작동 방지)
  if coalesce(v_g.member_key, '') <> '' and v_keydup = 0 then
    update public.gyojeok set spouse = null, spouse_key = null
     where id <> v_g.id and spouse_key = v_g.member_key;
    get diagnostics v_n = row_count;
    v_unspouse := v_unspouse + v_n;
  end if;
  if v_namedup = 0 then
    update public.gyojeok set spouse = null, spouse_key = null
     where id <> v_g.id and spouse = v_g.name
       and coalesce(nullif(btrim(head), ''), name) = v_head;
    get diagnostics v_n = row_count;
    v_unspouse := v_unspouse + v_n;
  end if;

  -- 세대주였다면 남는 가족은 각자 세대주로 돌려놓는다(사라진 세대주를 가리키지 않게)
  if v_head = v_g.name and v_namedup = 0 then
    update public.gyojeok set head = name, relation = null
     where id <> v_g.id and coalesce(nullif(btrim(head), ''), name) = v_g.name;
    get diagnostics v_unfam = row_count;
    update public.gyojeok set origin_head = null where origin_head = v_g.name;
  end if;

  -- 연결된 홈페이지 계정은 준회원으로 되돌리고 교적 연결을 끊는다
  -- (그대로 두면 지워진 사람의 헌금 조회 권한이 남는다)
  if v_link > 0 and v_keydup = 0 then
    update public.member_links
       set member_status = '준회원', member_key = null, member_id = null, updated_at = now()
     where member_key = v_g.member_key;
    get diagnostics v_unlink = row_count;
  end if;

  -- 보관표로 이동(같은 id의 이전 보관 기록이 있으면 최신으로 대체)
  delete from public.gyojeok_deleted where id = v_g.id;
  insert into public.gyojeok_deleted (
    id, gyojeok_id, name, birth, member_key, head, relation, spouse, spouse_key,
    groups, role, grade, sex, phone, address, status, photo,
    baptism_date, ordination_date, belong_groups, created_at, origin_head, ss_role,
    deleted_at, deleted_by, delete_reason
  ) values (
    v_g.id, v_g.gyojeok_id, v_g.name, v_g.birth, v_g.member_key, v_g.head, v_g.relation, v_g.spouse, v_g.spouse_key,
    v_g.groups, v_g.role, v_g.grade, v_g.sex, v_g.phone, v_g.address, v_g.status, v_g.photo,
    v_g.baptism_date, v_g.ordination_date, v_g.belong_groups, v_g.created_at, v_g.origin_head, v_g.ss_role,
    now(), auth.uid(), nullif(btrim(coalesce(p_reason, '')), '')
  );

  delete from public.gyojeok where id = v_g.id;

  return jsonb_build_object(
    'ok', true, 'name', v_g.name, 'id', v_g.id,
    'unspouse', v_unspouse, 'dissolved', v_unfam, 'unlinked', v_unlink,
    'keptOfferings', v_off, 'keptReceipts', v_rec
  );
end;
$$;

-- 3) 복원 ------------------------------------------------------
create or replace function public.restore_gyojeok(p_id bigint)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_d public.gyojeok_deleted%rowtype;
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', '관리자만 복원할 수 있습니다.');
  end if;

  select * into v_d from public.gyojeok_deleted where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', '보관함에서 찾을 수 없습니다.');
  end if;
  if exists (select 1 from public.gyojeok where id = p_id) then
    return jsonb_build_object('ok', false, 'error', '이미 교적에 있습니다.');
  end if;

  insert into public.gyojeok (
    id, gyojeok_id, name, birth, member_key, head, relation, spouse, spouse_key,
    groups, role, grade, sex, phone, address, status, photo,
    baptism_date, ordination_date, belong_groups, created_at, origin_head, ss_role
  ) overriding system value values (
    v_d.id, v_d.gyojeok_id, v_d.name, v_d.birth, v_d.member_key, v_d.head, v_d.relation, v_d.spouse, v_d.spouse_key,
    v_d.groups, v_d.role, v_d.grade, v_d.sex, v_d.phone, v_d.address, v_d.status, v_d.photo,
    v_d.baptism_date, v_d.ordination_date, v_d.belong_groups, v_d.created_at, v_d.origin_head, v_d.ss_role
  );

  delete from public.gyojeok_deleted where id = p_id;

  -- 삭제할 때 끊은 배우자·가족·계정 연결은 되살리지 않는다(관리자가 가계도에서 재지정).
  return jsonb_build_object('ok', true, 'name', v_d.name, 'id', v_d.id);
end;
$$;

revoke all on function public.delete_gyojeok(bigint, text, boolean)  from public;
revoke all on function public.restore_gyojeok(bigint)                from public;
grant execute on function public.delete_gyojeok(bigint, text, boolean) to authenticated;
grant execute on function public.restore_gyojeok(bigint)               to authenticated;

-- PostgREST 스키마 캐시 갱신(새 표·함수를 REST/RPC 에서 즉시 찾을 수 있게)
notify pgrst, 'reload schema';

-- ============================================================
--  [4주 후 물리 삭제 — 사람이 직접, 백업 확인 후]
--   보관함 확인:
--     select id, name, birth, deleted_at, delete_reason from public.gyojeok_deleted order by deleted_at;
--   4주 지난 항목만 실제 제거(반드시 눈으로 확인한 뒤 한 건씩):
--     -- delete from public.gyojeok_deleted where id = <교적ID>;
-- ============================================================
