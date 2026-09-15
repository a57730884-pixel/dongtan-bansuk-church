-- ============================================================
--  동탄반석교회 — 11단계: 공지사항 · 앨범
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--  실행 순서: 01 → … → 10 → 11
--
--  [이 파일이 만드는 것]
--   · notices       — 공지사항. 읽기는 누구나, 쓰기는 최고관리자만
--   · album_posts   — 앨범 한 묶음(제목 · 날짜 · 사진 여러 장)
--   · album_photos  — 그 안의 사진 한 장
--   · album_likes   — 좋아요. 한 사람이 한 묶음에 한 번
--   · album_feed()  — 목록을 한 번에 (표지 · 장수 · 좋아요 수 · 내가 눌렀는지)
--
--  [누가 올릴 수 있나]
--   앨범은 성도 누구나 올립니다. 함께 보는 자리이기 때문입니다.
--   다만 올리려면 로그인해야 합니다 — 누가 올렸는지 남지 않는 사진은
--   아무도 책임지지 않게 됩니다.
--   지우는 것은 올린 본인과 최고관리자입니다.
-- ============================================================

-- ── 1) 공지사항 ────────────────────────────────────────────
create table if not exists public.notices (
  id           bigserial primary key,
  kind         text not null default '공지',    -- 공지 · 소식 · 행사
  title        text not null,
  body         text,
  pinned       boolean not null default false,  -- 맨 위에 붙여 둔다
  published_on date not null default (now() at time zone 'Asia/Seoul')::date,
  author       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists notices_order_idx on public.notices (pinned desc, published_on desc, id desc);

alter table public.notices enable row level security;
grant select on public.notices to anon, authenticated;
grant insert, update, delete on public.notices to authenticated;
grant usage, select on sequence public.notices_id_seq to authenticated;

drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices for select using (true);

drop policy if exists notices_write on public.notices;
create policy notices_write on public.notices for all
  using (public.is_admin()) with check (public.is_admin());

-- ── 2) 앨범 ────────────────────────────────────────────────
create table if not exists public.album_posts (
  id          bigserial primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  author_name text,
  title       text not null,
  content     text,
  taken_on    date not null default (now() at time zone 'Asia/Seoul')::date,
  created_at  timestamptz not null default now()
);
create index if not exists album_posts_order_idx on public.album_posts (taken_on desc, id desc);

create table if not exists public.album_photos (
  id        bigserial primary key,
  post_id   bigint not null references public.album_posts (id) on delete cascade,
  url       text not null,
  storage_key text,
  sort      integer not null default 0
);
create index if not exists album_photos_post_idx on public.album_photos (post_id, sort, id);

create table if not exists public.album_likes (
  post_id    bigint not null references public.album_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 올린 본인인가?
create or replace function public.owns_album_post(p_id bigint)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.album_posts p where p.id = p_id and p.user_id = auth.uid())
$$;
grant execute on function public.owns_album_post(bigint) to authenticated;

alter table public.album_posts  enable row level security;
alter table public.album_photos enable row level security;
alter table public.album_likes  enable row level security;

grant select on public.album_posts, public.album_photos, public.album_likes to anon, authenticated;
grant insert, update, delete on public.album_posts, public.album_photos to authenticated;
grant insert, delete on public.album_likes to authenticated;
grant usage, select on sequence public.album_posts_id_seq, public.album_photos_id_seq to authenticated;

-- 읽기 — 누구나. 함께 보는 앨범이다
drop policy if exists album_posts_read on public.album_posts;
create policy album_posts_read on public.album_posts for select using (true);
drop policy if exists album_photos_read on public.album_photos;
create policy album_photos_read on public.album_photos for select using (true);
drop policy if exists album_likes_read on public.album_likes;
create policy album_likes_read on public.album_likes for select using (true);

-- 올리기 — 로그인한 본인 이름으로만
drop policy if exists album_posts_insert on public.album_posts;
create policy album_posts_insert on public.album_posts for insert
  with check (auth.uid() = user_id);

-- 고치기·지우기 — 올린 본인과 최고관리자
drop policy if exists album_posts_own on public.album_posts;
create policy album_posts_own on public.album_posts for update
  using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
drop policy if exists album_posts_del on public.album_posts;
create policy album_posts_del on public.album_posts for delete
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists album_photos_write on public.album_photos;
create policy album_photos_write on public.album_photos for all
  using (public.owns_album_post(post_id) or public.is_admin())
  with check (public.owns_album_post(post_id) or public.is_admin());

-- 좋아요 — 자기 것만 남기고 지운다
drop policy if exists album_likes_own on public.album_likes;
create policy album_likes_own on public.album_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3) 목록 한 번에 ────────────────────────────────────────
--  표지 사진 · 장수 · 좋아요 수 · 내가 눌렀는지를 함께 돌려준다.
--  화면이 게시물마다 따로 묻지 않도록.
create or replace function public.album_feed(p_limit integer default 24, p_offset integer default 0)
returns json language sql security definer stable set search_path = public as $$
  select coalesce(json_agg(row order by (row->>'taken_on') desc, (row->>'id')::bigint desc), '[]'::json)
  from (
    select json_build_object(
      'id', p.id,
      'title', p.title,
      'content', p.content,
      'taken_on', p.taken_on,
      'author', coalesce(p.author_name, '성도'),
      'mine', (p.user_id = auth.uid()),
      'cover', (select f.url from public.album_photos f where f.post_id = p.id order by f.sort, f.id limit 1),
      'photos', (select count(*) from public.album_photos f where f.post_id = p.id),
      'likes', (select count(*) from public.album_likes l where l.post_id = p.id),
      'liked', exists (select 1 from public.album_likes l where l.post_id = p.id and l.user_id = auth.uid())
    ) as row
    from public.album_posts p
    order by p.taken_on desc, p.id desc
    limit greatest(coalesce(p_limit, 24), 1) offset greatest(coalesce(p_offset, 0), 0)
  ) t
$$;
grant execute on function public.album_feed(integer, integer) to anon, authenticated;

-- ── 4) 저장소 — 올린 사람이 자기 파일을 지울 수 있게 ─────────
--  05단계에서는 관리자만 지울 수 있었다. 앨범은 누구나 올리므로
--  자기가 올린 파일은 자기가 거둘 수 있어야 한다.
drop policy if exists church_delete on storage.objects;
create policy church_delete on storage.objects
  for delete to authenticated
  using ( bucket_id = 'church' and (owner = auth.uid() or public.is_finance()) );

notify pgrst, 'reload schema';

-- ============================================================
--  확인용
--    select * from public.notices order by pinned desc, published_on desc;
--    select public.album_feed(10, 0);
-- ============================================================
