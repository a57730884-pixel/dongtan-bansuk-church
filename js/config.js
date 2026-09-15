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
  address: "경기 화성시 동탄구 동탄지성로 84",   // 도로명 주소
  addressJibun: "동탄구 반송동 42-8",         // 지번 — 오래된 내비게이션용
  map: { lat: 37.2072341, lng: 127.0656236 },  // 지도 마커 자리
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
    anon: "sb_publishable_kUnAO3fMqA85wnM-5ARj5Q_0XSwrohj"   // publishable(공개) 키 — 공개돼도 안전합니다.
  };

  var cfg = env === "development" ? LOCAL : PROD;
  window.SUPABASE_URL = cfg.url;
  window.SUPABASE_ANON_KEY = cfg.anon;

  if (env === "development" && /\.supabase\.co/i.test(window.SUPABASE_URL)) {
    throw new Error("[config] 개발 환경에서 원격 Supabase에 연결하려 합니다. 로컬(http://127.0.0.1:54321)만 사용하세요.");
  }
})();

/* --- 3) 성경 읽기 시작일 ----------------------------------------
   온 교회가 이 읽기표를 시작한 날입니다. 이 날이 '1일째' 가 됩니다.
   (달력의 1월 1일이 아닙니다 — 9월에 시작했는데 258일째부터 읽을 수는 없으니까요)
   해를 넘겨 새로 시작하실 때 이 날짜만 바꾸면 모두가 다시 1일째부터 읽습니다. */
window.BIBLE_PLAN_START = "2026-09-15";

/* --- 4) 오늘의 큐티 (운평장로교회와 함께) -----------------------
   큐티 본문은 운평장로교회가 올리는 것을 함께 봅니다. 복사해 두는 것이
   아니라 그쪽 공개 자료를 그때그때 읽어 오므로, 한 번 올리면 두 교회에
   함께 뜨고 고치면 함께 고쳐집니다.
   아래 키는 그쪽 홈페이지에 이미 공개돼 있는 읽기 전용 공개키입니다.
   비워 두면 큐티 칸이 통째로 사라집니다(사이트는 정상). */
window.QT_SOURCE = {
  url: "https://cetacttsdwzxjzkyozgd.supabase.co",
  key: "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G",
  table: "qt_published"
};

/* --- 5) 성경 낭독 음원 (Cloudflare R2) --------------------------
   장 단위 mp3 가 bible-<책번호>-<장>.mp3 이름으로 올라가 있는 주소입니다.
   (책번호는 창세기 1 … 요한계시록 66)
   운평장로교회가 마련해 둔 음원을 함께 씁니다.
   비워 두면 기기에 들어 있는 음성으로만 읽어 줍니다. */
window.BIBLE_AUDIO_BASE = "https://church-files.kds08200820.workers.dev/f/bible/";

/* --- 6) 사진 저장소(Cloudflare R2 워커) -------------------------
   비워 두면 사진은 Supabase Storage 에 저장됩니다(지금 동작).
   R2 워커 주소를 넣으면 그쪽으로 올라갑니다. 다만 그 워커가
   이 홈페이지의 Supabase 토큰을 받아 주도록 먼저 고쳐야 합니다. */
window.R2_UPLOAD_URL = "";

/* --- 7) 파일 저장소(Supabase Storage) ---------------------------
   교인 사진·앨범·주보 PDF·직인 이미지가 저장되는 버킷 이름입니다.
   supabase/03_storage.sql 을 실행하면 만들어집니다. */
window.STORAGE_BUCKET = "church";

/* --- 8) 카카오톡 채널(선택) -------------------------------------
   채널 공개 ID. 비어 있으면 푸터의 채널 버튼이 숨겨집니다. */
window.KAKAO_CHANNEL_ID = "";
