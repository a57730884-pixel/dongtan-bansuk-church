-- ============================================================
--  동탄반석교회 — 8단계: 화면에 올리는 내용 (설교 · 히어로)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--  실행 순서: 01 → … → 06 → 07 → 08
--
--  [이 파일이 만드는 것]
--   · sermons     — 설교 한 편. 이 표 하나가 '이번 주 설교'와 '설교 아카이브'를
--                   함께 채운다. 같은 내용을 두 곳에 적어 넣지 않기 위함이다.
--   · site_hero   — 첫 화면 큰 제목. 설교와 따로 둔다.
--                   시리즈 제목은 설교 한 편보다 오래가기 때문이다.
--   · is_admin()  — 정책이 쓰는 판단 함수
--
--  [누가 고칠 수 있나]
--   읽기는 누구나(홈페이지 첫 화면이므로), 고치기는 최고관리자만.
--   이 제한은 화면의 버튼을 감추는 것이 아니라 아래 정책이 강제한다.
-- ============================================================

-- ── 0) 판단 함수 ────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins a where a.uid = auth.uid())
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ── 1) 설교 ────────────────────────────────────────────────
create table if not exists public.sermons (
  id           bigserial primary key,
  service      text not null default '주일 낮 예배',  -- 주일 낮 · 주일 오후 · 수요 · 새벽 · 특별집회
  title        text not null,
  title_en     text,
  ref          text,                                  -- 성경 본문 (마태복음 7:24–27)
  series       text,                                  -- 시리즈 (마태복음 강해)
  preacher     text,
  preached_on  date not null,
  video_url    text,                                  -- 유튜브 주소
  summary      text,                                  -- 한 줄 요약
  is_featured  boolean not null default false,        -- 이번 주 설교
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists sermons_date_idx on public.sermons (preached_on desc, id desc);
-- '이번 주 설교'는 한 편뿐이다
create unique index if not exists sermons_one_featured on public.sermons (is_featured) where is_featured;

-- ── 2) 첫 화면 큰 제목 ──────────────────────────────────────
--  제목 줄의 *별표* 사이는 화면에서 굵고 크게 나온다.
--    "나는 *반석* 위에"  →  나는 [반석] 위에
create table if not exists public.site_hero (
  id           integer primary key default 1,
  series       text,        -- 마/태/복/음/강/해 로 풀어서 보여 준다
  line1        text,
  line2        text,
  ref          text,        -- 마 7:24–27
  subtitle_en  text,
  updated_at   timestamptz not null default now(),
  constraint site_hero_single check (id = 1)
);

-- 지금 화면에 나와 있는 내용을 그대로 첫 값으로 넣는다
insert into public.site_hero (id, series, line1, line2, ref, subtitle_en)
values (1, '마태복음 강해', '나는 *반석* 위에', '*집을 짓는* 사람', '마 7:24–27',
        'I Build My House upon the Rock')
on conflict (id) do nothing;

-- ── 3) '이번 주 설교' 지정 ──────────────────────────────────
--  두 편이 동시에 이번 주 설교가 되지 않도록 한 번에 처리한다
create or replace function public.set_featured_sermon(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '최고관리자만 가능합니다.';
  end if;
  update public.sermons set is_featured = false where is_featured and id <> p_id;
  update public.sermons set is_featured = true, updated_at = now() where id = p_id;
end $$;
grant execute on function public.set_featured_sermon(bigint) to authenticated;

-- ── 4) 접근 규칙(RLS) ───────────────────────────────────────
alter table public.sermons   enable row level security;
alter table public.site_hero enable row level security;

grant select on public.sermons, public.site_hero to anon, authenticated;
grant insert, update, delete on public.sermons to authenticated;
grant insert, update on public.site_hero to authenticated;
grant usage, select on sequence public.sermons_id_seq to authenticated;

-- 읽기 — 누구나. 첫 화면과 말씀 페이지는 공개 자료다
drop policy if exists sermons_read on public.sermons;
create policy sermons_read on public.sermons for select using (true);

drop policy if exists site_hero_read on public.site_hero;
create policy site_hero_read on public.site_hero for select using (true);

-- 고치기 — 최고관리자만
drop policy if exists sermons_write on public.sermons;
create policy sermons_write on public.sermons for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists site_hero_write on public.site_hero;
create policy site_hero_write on public.site_hero for all
  using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';

-- ============================================================
--  확인용
--    select preached_on, service, title, is_featured from public.sermons order by preached_on desc;
--    select * from public.site_hero;
-- ============================================================
