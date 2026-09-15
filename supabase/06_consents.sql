-- ============================================================
--  동탄반석교회 — 6단계: 가입 동의 기록 (개인정보 보호법 대응)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--  실행 순서: 01 → 02 → 03 → 04 → 05 → 06
--
--  [이 파일이 만드는 것]
--   · profiles 에 동의 시각 칸 추가 — 지금 이 사람이 무엇에 동의한 상태인가
--   · consent_logs             — 언제 무엇에 동의·철회했는가 (덧붙이기 전용 장부)
--   · handle_new_user()        — 가입 화면이 보낸 동의 내역을 위 두 곳에 기록
--   · set_news_consent()       — 선택 동의(교회 소식)를 본인이 켜고 끄는 창구
--
--  [왜 두 군데에 남기는가]
--   profiles 는 "현재 상태", consent_logs 는 "지나온 기록"입니다.
--   개인정보 보호법은 동의를 받은 사실을 증명할 수 있어야 한다고 보므로
--   (제15조·제22조, 표준 개인정보 보호지침), 덮어써지지 않는 장부를 따로 둡니다.
--   consent_logs 는 수정·삭제 권한을 주지 않아 고칠 수 없습니다.
-- ============================================================

-- ── 1) profiles 에 동의 상태 칸 ─────────────────────────────
alter table public.profiles add column if not exists terms_agreed_at   timestamptz; -- [필수] 이용약관
alter table public.profiles add column if not exists privacy_agreed_at timestamptz; -- [필수] 개인정보 수집·이용
alter table public.profiles add column if not exists age14_confirmed_at timestamptz;-- [필수] 만 14세 이상
alter table public.profiles add column if not exists news_opt_in       boolean not null default false; -- [선택] 교회 소식
alter table public.profiles add column if not exists news_agreed_at    timestamptz;
alter table public.profiles add column if not exists consent_version   text;        -- 동의서 판 번호(= 방침 시행일)

-- ── 2) 동의 장부 (덧붙이기 전용) ────────────────────────────
create table if not exists public.consent_logs (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,                       -- 'terms' | 'privacy' | 'age14' | 'news'
  agreed     boolean not null,                    -- 동의(true) / 철회·거부(false)
  version    text,                                -- 그때 보여 드린 동의서의 판 번호
  source     text,                                -- 'signup' | 'mypage'
  created_at timestamptz not null default now()
);
create index if not exists consent_logs_user_idx on public.consent_logs (user_id, created_at desc);

-- ── 3) 가입 시 — 프로필 생성 + 동의 기록 ─────────────────────
--  가입 화면(js/auth.js)이 signUp 의 user_metadata 에 실어 보낸
--  consent = { version, agreed_at, terms, privacy, age14, news, source }
--  를 그대로 받아 적습니다. 동의 화면을 거치지 않은 가입은 비어 있게 됩니다.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c   jsonb := coalesce(new.raw_user_meta_data->'consent', '{}'::jsonb);
  ver text  := coalesce(c->>'version', new.raw_user_meta_data->>'consent_version');
  ts  timestamptz := coalesce(
         nullif(c->>'agreed_at','')::timestamptz,
         nullif(new.raw_user_meta_data->>'terms_agreed_at','')::timestamptz,
         now());
  ok_terms   boolean := coalesce((c->>'terms')::boolean,   nullif(new.raw_user_meta_data->>'terms_agreed_at','') is not null);
  ok_privacy boolean := coalesce((c->>'privacy')::boolean, nullif(new.raw_user_meta_data->>'privacy_agreed_at','') is not null);
  ok_age14   boolean := coalesce((c->>'age14')::boolean,   false);
  ok_news    boolean := coalesce((c->>'news')::boolean,    (new.raw_user_meta_data->>'news_opt_in')::boolean, false);
  src        text    := coalesce(c->>'source', 'signup');
begin
  insert into public.profiles (
    id, name, email, provider,
    terms_agreed_at, privacy_agreed_at, age14_confirmed_at,
    news_opt_in, news_agreed_at, consent_version
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name',
             new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'nickname',
             split_part(coalesce(new.email,''),'@',1)),
    new.email,
    coalesce(new.raw_app_meta_data->>'provider','email'),
    case when ok_terms   then ts end,
    case when ok_privacy then ts end,
    case when ok_age14   then ts end,
    ok_news,
    case when ok_news    then ts end,
    ver
  )
  on conflict (id) do nothing;

  -- 장부에 남기기 (동의한 항목만)
  if ok_terms   then insert into public.consent_logs (user_id, kind, agreed, version, source) values (new.id, 'terms',   true,    ver, src); end if;
  if ok_privacy then insert into public.consent_logs (user_id, kind, agreed, version, source) values (new.id, 'privacy', true,    ver, src); end if;
  if ok_age14   then insert into public.consent_logs (user_id, kind, agreed, version, source) values (new.id, 'age14',   true,    ver, src); end if;
  if c ? 'news' then insert into public.consent_logs (user_id, kind, agreed, version, source) values (new.id, 'news',    ok_news, ver, src); end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 4) 선택 동의(교회 소식) 켜고 끄기 ───────────────────────
--  「나의 기록」 화면에서 본인이 직접 철회할 수 있어야 합니다(제37조 참고).
create or replace function public.set_news_consent(p_optin boolean, p_version text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  update public.profiles
     set news_opt_in    = p_optin,
         news_agreed_at = case when p_optin then now() else null end,
         consent_version = coalesce(p_version, consent_version)
   where id = auth.uid();

  insert into public.consent_logs (user_id, kind, agreed, version, source)
  values (auth.uid(), 'news', p_optin, p_version, 'mypage');

  return p_optin;
end $$;

grant execute on function public.set_news_consent(boolean, text) to authenticated;

-- ── 5) 접근 규칙(RLS) ───────────────────────────────────────
alter table public.consent_logs enable row level security;

grant select, insert on public.consent_logs to authenticated;
grant usage, select on sequence public.consent_logs_id_seq to authenticated;
revoke update, delete on public.consent_logs from authenticated, anon;  -- 장부는 고칠 수 없다

drop policy if exists consent_logs_select on public.consent_logs;
create policy consent_logs_select on public.consent_logs
  for select using (auth.uid() = user_id or auth.uid() in (select uid from public.admins));

drop policy if exists consent_logs_insert_self on public.consent_logs;
create policy consent_logs_insert_self on public.consent_logs
  for insert with check (auth.uid() = user_id);

-- profiles 는 01 단계에서 이미 본인·관리자만 읽고 본인만 고칠 수 있습니다.
-- 다만 동의 칸은 화면에서 직접 고치지 못하도록 RPC(set_news_consent)로만 바꿉니다.
grant select, update on public.profiles to authenticated;

-- ── 6) 이미 가입한 분 보충 ──────────────────────────────────
--  06 이전에 가입한 계정은 동의 시각이 비어 있습니다.
--  가입 당시 metadata 에 terms_agreed_at 이 있으면 그 값을 채워 둡니다.
update public.profiles p
   set terms_agreed_at   = coalesce(p.terms_agreed_at,   nullif(u.raw_user_meta_data->>'terms_agreed_at','')::timestamptz),
       privacy_agreed_at = coalesce(p.privacy_agreed_at, nullif(u.raw_user_meta_data->>'terms_agreed_at','')::timestamptz)
  from auth.users u
 where u.id = p.id
   and p.terms_agreed_at is null
   and nullif(u.raw_user_meta_data->>'terms_agreed_at','') is not null;

-- ============================================================
--  확인용 — 누가 무엇에 동의한 상태인지 한눈에 보기
--    select email, terms_agreed_at, privacy_agreed_at, age14_confirmed_at,
--           news_opt_in, consent_version
--      from public.profiles order by created_at desc;
--
--  지나온 기록 보기
--    select * from public.consent_logs order by created_at desc limit 50;
-- ============================================================
