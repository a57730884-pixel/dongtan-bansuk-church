-- ============================================================
--  동탄반석교회 — 12단계: 큐티 기록
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--  실행 순서: 01 → … → 11 → 12
--
--  [나뉘는 자리]
--   큐티 '본문' 은 운평장로교회가 올리는 것을 함께 봅니다(qt_published).
--   같은 글을 두 교회가 따로 적을 이유가 없습니다.
--   큐티 '기록' — 누가 언제 아멘 했는가 — 은 이 교회 데이터베이스에 남습니다.
--   우리 성도의 신앙 기록을 남의 집에 맡기지 않습니다.
--
--  [이 파일이 만드는 것]
--   · qt_checks       — "이 사람이 이 날 큐티를 마쳤다" 한 줄
--   · toggle_qt()     — 아멘 표시를 켜고 끄는 창구(본인만)
--   · my_qt_days()    — 내가 아멘 한 날들
--   · my_faith_summary() — 큐티와 성경 읽기를 한 번에 (나의 신앙생활 머리말)
--   · qt_dashboard()  — 큐티 참여 현황(최고관리자만)
-- ============================================================

-- ── 1) 아멘 한 날 ──────────────────────────────────────────
create table if not exists public.qt_checks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  check_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, check_date)
);
create index if not exists qt_checks_date_idx on public.qt_checks (check_date desc);

alter table public.qt_checks enable row level security;
grant select, insert, delete on public.qt_checks to authenticated;

drop policy if exists qt_checks_self on public.qt_checks;
create policy qt_checks_self on public.qt_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 2) 아멘 켜고 끄기 ──────────────────────────────────────
create or replace function public.toggle_qt(p_date date, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_date > (now() at time zone 'Asia/Seoul')::date then
    raise exception '아직 오지 않은 날은 표시할 수 없습니다.';
  end if;

  if p_on then
    insert into public.qt_checks (user_id, check_date) values (auth.uid(), p_date)
    on conflict (user_id, check_date) do nothing;
  else
    delete from public.qt_checks where user_id = auth.uid() and check_date = p_date;
  end if;
  return p_on;
end $$;
grant execute on function public.toggle_qt(date, boolean) to authenticated;

-- ── 3) 내가 아멘 한 날들 ───────────────────────────────────
create or replace function public.my_qt_days(p_from date default null, p_to date default null)
returns date[] language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(check_date order by check_date), '{}')
    from public.qt_checks
   where user_id = auth.uid()
     and (p_from is null or check_date >= p_from)
     and (p_to   is null or check_date <= p_to)
$$;
grant execute on function public.my_qt_days(date, date) to authenticated;

-- ── 4) 나의 신앙생활 한눈에 ────────────────────────────────
--  큐티는 '며칠 했는가 · 요즘 이어 가는가', 성경은 '며칠치를 읽었는가'.
--  연속일수는 오늘(또는 어제)부터 거꾸로 이어진 날을 센다 —
--  어제까지 이어 왔는데 오늘 아직 안 했다고 0 이 되면 맥이 빠진다.
create or replace function public.my_faith_summary(p_plan_year integer default null)
returns json language plpgsql security definer stable set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_streak integer := 0;
  v_cursor date;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;

  if exists (select 1 from public.qt_checks where user_id = auth.uid() and check_date = v_today) then
    v_cursor := v_today;
  elsif exists (select 1 from public.qt_checks where user_id = auth.uid() and check_date = v_today - 1) then
    v_cursor := v_today - 1;
  end if;

  while v_cursor is not null and
        exists (select 1 from public.qt_checks where user_id = auth.uid() and check_date = v_cursor) loop
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;

  return json_build_object(
    'qt_total',  (select count(*) from public.qt_checks where user_id = auth.uid()),
    'qt_month',  (select count(*) from public.qt_checks
                   where user_id = auth.uid() and check_date >= date_trunc('month', v_today)::date),
    'qt_streak', v_streak,
    'qt_last',   (select max(check_date) from public.qt_checks where user_id = auth.uid()),
    'qt_recent', coalesce((select json_agg(check_date order by check_date desc)
                             from (select check_date from public.qt_checks
                                    where user_id = auth.uid() order by check_date desc limit 60) t), '[]'::json),
    'bible_days', (select count(*) from public.bible_reading
                    where user_id = auth.uid()
                      and (p_plan_year is null or plan_year = p_plan_year))
  );
end $$;
grant execute on function public.my_faith_summary(integer) to authenticated;

-- ── 5) 큐티 참여 현황 (최고관리자만) ────────────────────────
create or replace function public.qt_dashboard()
returns json language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not public.is_admin() then
    raise exception '최고관리자만 볼 수 있습니다.';
  end if;
  return json_build_object(
    'today',  (select count(*) from public.qt_checks where check_date = v_today),
    'week',   (select count(distinct user_id) from public.qt_checks where check_date > v_today - 7),
    'people', (select count(distinct user_id) from public.qt_checks),
    'days',   coalesce((
      select json_agg(json_build_object('d', d::date, 'n',
        (select count(*) from public.qt_checks q where q.check_date = d::date)) order by d)
      from generate_series(v_today - interval '6 days', v_today, interval '1 day') d), '[]'::json)
  );
end $$;
grant execute on function public.qt_dashboard() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
--  확인용
--    select * from public.qt_checks order by check_date desc limit 20;
--    select public.qt_dashboard();
-- ============================================================
