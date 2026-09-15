-- ============================================================
--  동탄반석교회 — 13단계: 묵상한 큐티를 우리 기록으로 남긴다
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--  실행 순서: 01 → … → 12 → 13
--
--  [왜 제목과 본문까지 남기는가]
--   12단계는 '아멘 한 날짜' 만 남겼다. 그러면 내가 무엇을 묵상했는지 보려면
--   그때마다 바깥 자료를 다시 불러와야 하고, 바깥 글이 고쳐지거나 사라지면
--   내 기록도 흔들린다.
--   묵상한 그 순간의 제목과 성경 본문을 함께 적어 두면, 내 기록은 내 것이 된다.
--
--  [이 파일이 만드는 것]
--   · qt_checks 에 title · scripture 칸 추가
--   · toggle_qt()      — 아멘 할 때 제목·본문도 함께 남긴다
--   · my_qt_history()  — 내가 묵상한 큐티 전체 (날짜 · 제목 · 본문)
-- ============================================================

alter table public.qt_checks add column if not exists title      text;
alter table public.qt_checks add column if not exists scripture  text;

-- ── 아멘 켜고 끄기 (제목·본문을 함께 받는다) ────────────────
create or replace function public.toggle_qt(
  p_date date, p_on boolean, p_title text default null, p_scripture text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_date > (now() at time zone 'Asia/Seoul')::date then
    raise exception '아직 오지 않은 날은 표시할 수 없습니다.';
  end if;

  if p_on then
    insert into public.qt_checks (user_id, check_date, title, scripture)
    values (auth.uid(), p_date, nullif(btrim(p_title), ''), nullif(btrim(p_scripture), ''))
    on conflict (user_id, check_date) do update
      set title     = coalesce(excluded.title,     public.qt_checks.title),
          scripture = coalesce(excluded.scripture, public.qt_checks.scripture);
  else
    delete from public.qt_checks where user_id = auth.uid() and check_date = p_date;
  end if;
  return p_on;
end $$;
grant execute on function public.toggle_qt(date, boolean, text, text) to authenticated;

-- ── 내가 묵상한 큐티 전체 ──────────────────────────────────
create or replace function public.my_qt_history()
returns json language sql security definer stable set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'date', check_date, 'title', title, 'scripture', scripture
         ) order by check_date desc), '[]'::json)
    from public.qt_checks
   where user_id = auth.uid()
$$;
grant execute on function public.my_qt_history() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
--  확인용
--    select check_date, title, scripture from public.qt_checks
--     order by check_date desc limit 30;
-- ============================================================
