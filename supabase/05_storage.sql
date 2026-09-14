-- ============================================================
--  동탄반석교회 — 5단계: 파일 저장소(Storage)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run. (01~04 를 먼저 실행하세요)
--
--  교인 사진 · 앨범 사진 · 주보 PDF · 교회 직인 이미지가 여기에 저장됩니다.
--  js/upload.js 가 window.STORAGE_BUCKET(기본값 'church')로 이 버킷을 씁니다.
--
--  [읽기는 공개, 쓰기는 로그인]
--   사진 주소를 알면 누구나 볼 수 있는 공개 버킷입니다(주소는 임의 문자열).
--   교인 사진처럼 민감한 파일까지 감추려면 아래 '비공개 설정' 주석을 보세요.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('church', 'church', true)
on conflict (id) do update set public = true;

-- 읽기: 누구나(공개 버킷)
drop policy if exists church_read on storage.objects;
create policy church_read on storage.objects
  for select using ( bucket_id = 'church' );

-- 올리기: 로그인한 회원만
drop policy if exists church_insert on storage.objects;
create policy church_insert on storage.objects
  for insert to authenticated with check ( bucket_id = 'church' );

-- 수정·삭제: 관리자/재정권한자만 (잘못 올린 파일 정리용)
drop policy if exists church_update on storage.objects;
create policy church_update on storage.objects
  for update to authenticated using ( bucket_id = 'church' and public.is_finance() );

drop policy if exists church_delete on storage.objects;
create policy church_delete on storage.objects
  for delete to authenticated using ( bucket_id = 'church' and public.is_finance() );

-- ============================================================
--  [비공개 설정으로 바꾸려면]
--   update storage.buckets set public = false where id = 'church';
--   그리고 church_read 정책을 아래처럼 로그인 회원 전용으로 바꾼 뒤,
--   js/upload.js 의 공개 주소 생성을 서명 주소(createSignedUrl) 방식으로
--   바꿔야 합니다(교적 사진을 외부에 절대 노출하지 않으려는 경우).
--
--   drop policy if exists church_read on storage.objects;
--   create policy church_read on storage.objects
--     for select to authenticated using ( bucket_id = 'church' );
-- ============================================================
