-- ============================================================
--  동탄반석교회 — 9단계: 성경 읽기 (성도의 기록 · 목회 현황)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--  실행 순서: 01 → … → 08 → 09
--
--  [이 파일이 만드는 것]
--   · bible_reading       — "누가 · 몇 년 읽기표의 · 며칠째를 읽었다" 한 줄
--   · toggle_reading()    — 읽음 표시를 켜고 끄는 창구(본인만)
--   · my_reading_days()   — 내가 읽은 날 목록
--   · reading_dashboard() — 성도별 진행률(최고관리자만)
--
--  [설계]
--   읽기표는 교회가 함께 같은 날 같은 본문을 읽는 365일 표다.
--   그래서 기록은 '며칠째(1~365)' 하나로 충분하다. 본문을 따로 적지 않는다.
--   읽기표가 해마다 다시 시작되므로 연도(plan_year)를 함께 둔다.
--
--   본인 기록은 본인만 본다. 최고관리자는 '누가 얼마나' 는 보되
--   그것도 집계 함수를 통해서만 본다 — 표를 통째로 열어 주지 않는다.
-- ============================================================

-- ── 1) 읽은 날 ─────────────────────────────────────────────
create table if not exists public.bible_reading (
  user_id    uuid not null references auth.users (id) on delete cascade,
  plan_year  integer not null,
  day        integer not null check (day between 1 and 365),
  read_at    timestamptz not null default now(),
  primary key (user_id, plan_year, day)
);
create index if not exists bible_reading_year_idx on public.bible_reading (plan_year, user_id);
create index if not exists bible_reading_when_idx on public.bible_reading (read_at desc);

-- ── 2) 읽음 표시 켜고 끄기 (본인만) ─────────────────────────
create or replace function public.toggle_reading(p_year integer, p_day integer, p_read boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_day < 1 or p_day > 365 then raise exception '1~365일 사이만 기록할 수 있습니다.'; end if;

  if p_read then
    insert into public.bible_reading (user_id, plan_year, day)
    values (auth.uid(), p_year, p_day)
    on conflict (user_id, plan_year, day) do update set read_at = now();
  else
    delete from public.bible_reading
     where user_id = auth.uid() and plan_year = p_year and day = p_day;
  end if;
  return p_read;
end $$;
grant execute on function public.toggle_reading(integer, integer, boolean) to authenticated;

-- ── 3) 내가 읽은 날 ────────────────────────────────────────
create or replace function public.my_reading_days(p_year integer)
returns integer[] language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(day order by day), '{}')
    from public.bible_reading
   where user_id = auth.uid() and plan_year = p_year
$$;
grant execute on function public.my_reading_days(integer) to authenticated;

-- ── 4) 목회 현황 — 성도별 진행률 (최고관리자만) ──────────────
--  이름은 교적에 연결된 이름을, 없으면 가입 이름을 쓴다.
--  읽은 '날'의 개수만 집계하고 무엇을 읽었는지는 돌려주지 않는다.
create or replace function public.reading_dashboard(p_year integer)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  if not public.is_admin() then
    raise exception '최고관리자만 볼 수 있습니다.';
  end if;

  select json_build_object(
    'year', p_year,
    'members', coalesce((
      select json_agg(row order by (row->>'days')::int desc)
      from (
        select json_build_object(
          'name',   coalesce(nullif(l.member_name,''), nullif(p.name,''), split_part(coalesce(p.email,''),'@',1)),
          'status', coalesce(l.member_status, '준회원'),
          'days',   count(r.day),
          'last',   max(r.read_at)
        ) as row
        from public.profiles p
        left join public.member_links l on l.user_id = p.id
        left join public.bible_reading r on r.user_id = p.id and r.plan_year = p_year
        group by p.id, l.member_name, p.name, p.email, l.member_status
        having count(r.day) > 0
      ) t
    ), '[]'::json),
    'joined',     (select count(*) from public.profiles),
    'readers',    (select count(distinct user_id) from public.bible_reading where plan_year = p_year),
    'total_days', (select count(*) from public.bible_reading where plan_year = p_year),
    'today',      (select count(distinct user_id) from public.bible_reading
                    where plan_year = p_year and read_at >= date_trunc('day', now() at time zone 'Asia/Seoul')),
    'week',       coalesce((
      select json_agg(json_build_object('d', d::date, 'n', (
        select count(distinct br.user_id) from public.bible_reading br
         where br.plan_year = p_year
           and (br.read_at at time zone 'Asia/Seoul')::date = d::date
      )) order by d)
      from generate_series(
        (now() at time zone 'Asia/Seoul')::date - interval '6 days',
        (now() at time zone 'Asia/Seoul')::date, interval '1 day') d
    ), '[]'::json)
  ) into v;
  return v;
end $$;
grant execute on function public.reading_dashboard(integer) to authenticated;

-- ── 5) 접근 규칙(RLS) ───────────────────────────────────────
alter table public.bible_reading enable row level security;
grant select, insert, delete on public.bible_reading to authenticated;

-- 본인 기록은 본인만. 최고관리자도 이 표를 직접 열지 않는다(집계 함수로만 본다)
drop policy if exists bible_reading_self on public.bible_reading;
create policy bible_reading_self on public.bible_reading
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';

-- ============================================================
--  확인용
--    select * from public.bible_reading order by read_at desc limit 20;
--    select public.reading_dashboard(extract(year from now())::int);
-- ============================================================
