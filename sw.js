/* ============================================================
   동탄반석교회 — 서비스 워커
   ------------------------------------------------------------
   앱으로 설치하려면 이 파일이 있어야 합니다. 하는 일은 두 가지입니다.

   ① 화면은 늘 새것으로
      HTML·CSS·JS 는 먼저 서버에 물어봅니다. 새로 고쳤는데 옛 화면이
      남아 있는 일이 없도록. 다만 서버에 닿지 못하면 마지막으로 받아 둔
      것을 내어 줍니다 — 지하철에서도 화면이 뜹니다.

   ② 무거운 자료는 한 번만
      성경 본문(data/urm)·읽기표·해설·아이콘은 주소에 판 번호가 붙어
      있어 내용이 바뀌면 주소가 바뀝니다. 그러므로 받아 둔 것을 그대로
      씁니다. 성경 한 장을 볼 때마다 다시 받지 않습니다.

   바깥 주소(데이터베이스·음원)는 건드리지 않고 그대로 지나보냅니다.
   교회 자료는 늘 지금 것이어야 하고, 음원은 캐시에 담기엔 너무 큽니다.

   판을 올리면(SW_VERSION) 옛 저장분을 모두 버리고 새로 시작합니다.
   ============================================================ */
const SW_VERSION = "2026-09-15e";
const SHELL = "bansuk-shell-" + SW_VERSION;   // 화면 파일 — 오프라인 대비용
const ASSET = "bansuk-asset-" + SW_VERSION;   // 성경 본문처럼 변하지 않는 자료

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return (k === SHELL || k === ASSET) ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* 변하지 않는 자료인가 — 성경 본문, 읽기표·해설, 그림, 아이콘 */
function isAsset(url) {
  return /\/data\/urm\//.test(url.pathname) ||
         /\/(bible-plan|bible-notes|bible-books)\.js/.test(url.pathname) ||
         /\.(png|svg|jpe?g|webp|woff2?)$/i.test(url.pathname);
}
/* 화면을 이루는 파일인가 */
function isShell(url) {
  return /\.(html|css|js|json)$/i.test(url.pathname) || url.pathname.endsWith("/");
}

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 다른 집 주소(데이터베이스·음원·글꼴 서버)는 그대로 지나보낸다
  if (url.origin !== self.location.origin) return;

  // ① 변하지 않는 자료 — 받아 둔 것이 있으면 그것을 쓴다
  if (isAsset(url)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(ASSET).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  // ② 화면 파일 — 서버에 먼저 물어보고, 닿지 못하면 받아 둔 것으로
  if (isShell(url)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          // 처음 보는 쪽으로 들어왔다면 첫 화면이라도 보여 준다
          return caches.match("index.html");
        });
      })
    );
  }
});
