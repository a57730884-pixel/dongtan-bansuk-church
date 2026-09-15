/* ============================================================
   동탄반석교회 — 외부 서비스 설정 (이 파일 하나만 채우면 연결됩니다)
   ------------------------------------------------------------
   · 이 값들은 공개되어도 안전한 "공개키"입니다.
     실제 보안은 데이터베이스의 접근 규칙(RLS)이 담당합니다.
   · 비어 있어도 사이트는 정상 동작하고, 해당 기능만 "준비 중"으로 표시됩니다.
   ============================================================ */

/* --- 1) 교회 기본 정보 -----------------------------------------
   인쇄물(재정보고서·기부금영수증) 머리글과 푸터에 쓰입니다.
   기부금영수증 발급기관 정보는 재정관리 ▸ 설정 탭에서 덮어쓸 수 있습니다. */
window.CHURCH = {
  name: "동탄반석교회",
  nameEn: "DONGTAN BANSUK CHURCH",
  pastor: "강명우",                       // 담임목사(기부금영수증 대표자)
  address: "경기도 화성시 동탄",            // TODO: 정확한 주소로 교체
  phone: "",                              // TODO: 대표 전화
  bizno: "",                              // 고유번호(기부금영수증용)
  account: { bank: "", no: "", holder: "동탄반석교회" }, // 온라인 헌금 계좌
  worship: [
    { name: "주일 낮 예배", time: "주일 오전 11:00" },
    { name: "주일 오후 예배", time: "주일 오후 2:00" },
    { name: "수요 기도회", time: "수요일 오후 7:30" },
    { name: "새벽 기도회", time: "화~토 오전 5:30" }
  ]
};

/* --- 2) 로그인·데이터베이스(Supabase) ---------------------------
   Supabase ▸ Project Settings ▸ API 에서
     Project URL → SUPABASE_URL
     anon(public) / publishable key → SUPABASE_ANON_KEY
   두 값을 넣는 순간 로그인·교적관리·재정관리가 살아납니다.

   환경 분리: localhost 로 접속하면 로컬 Supabase(supabase start)를 바라봅니다.
   (실수로 로컬 개발 중 운영 데이터베이스를 건드리는 사고를 막기 위함) */
(function () {
  var host = (location.hostname || "").toLowerCase();
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]";
  var env = window.APP_ENV || (isLocal ? "development" : "production");
  window.APP_ENV = env;

  var LOCAL = {
    url: "http://127.0.0.1:54321",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
  };
  var PROD = {
    url: "https://qqmhongiwvgworzdxkwo.supabase.co",
    anon: ""   // TODO: Supabase ▸ Project Settings ▸ API Keys 의 publishable 키(sb_publishable_...)를 붙여 넣으세요.
               //       이 값이 비어 있으면 로그인 버튼이 "준비 중"으로만 표시됩니다.
  };

  var cfg = env === "development" ? LOCAL : PROD;
  window.SUPABASE_URL = cfg.url;
  window.SUPABASE_ANON_KEY = cfg.anon;

  if (env === "development" && /\.supabase\.co/i.test(window.SUPABASE_URL)) {
    throw new Error("[config] 개발 환경에서 원격 Supabase에 연결하려 합니다. 로컬(http://127.0.0.1:54321)만 사용하세요.");
  }
})();

/* --- 3) 파일 저장소(Supabase Storage) ---------------------------
   교인 사진·앨범·주보 PDF·직인 이미지가 저장되는 버킷 이름입니다.
   supabase/03_storage.sql 을 실행하면 만들어집니다. */
window.STORAGE_BUCKET = "church";

/* --- 4) 카카오톡 채널(선택) -------------------------------------
   채널 공개 ID. 비어 있으면 푸터의 채널 버튼이 숨겨집니다. */
window.KAKAO_CHANNEL_ID = "";
