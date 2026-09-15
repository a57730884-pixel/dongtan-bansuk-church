/* 우리말성경 본문 추출기
   ------------------------------------------------------------
   '성경찾기-올인원' HTML 한 장(21MB) 안의 window.BIBLE 에서
   우리말성경(urm)만 골라 책별 파일로 나눠 저장한다.

   책별로 나누는 이유: 홈페이지는 그날 읽을 몇 장만 필요하다.
   한 덩어리로 두면 창세기 한 장을 보려고 8MB를 내려받게 된다.

   쓰는 법:
     node tools/extract_urm.js "C:/…/성경찾기-올인원(요리문답포함).html" data/urm
   ------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const src = process.argv[2];
const outDir = process.argv[3] || "data/urm";
if (!src) { console.error("원본 HTML 경로를 주세요."); process.exit(1); }

function findBibleLine(file) {
  return new Promise(function (resolve, reject) {
    const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "utf8" }) });
    let found = null;
    rl.on("line", function (l) {
      if (!found && l.indexOf("window.BIBLE=") === 0) { found = l; rl.close(); }
    });
    rl.on("close", function () { found ? resolve(found) : reject(new Error("window.BIBLE 를 찾지 못했습니다.")); });
    rl.on("error", reject);
  });
}

findBibleLine(src).then(function (line) {
  const B = JSON.parse(line.replace(/^window\.BIBLE=/, "").replace(/;\s*$/, ""));
  const books = B.books || [];
  const urm = (B.text || {}).urm;
  if (!urm) throw new Error("우리말성경(urm) 본문이 없습니다.");

  fs.mkdirSync(outDir, { recursive: true });

  const index = [];
  let verses = 0, bytes = 0;

  books.forEach(function (b, i) {
    const chapters = urm[i] || [];
    const file = path.join(outDir, b.a + ".json");
    const json = JSON.stringify(chapters);
    fs.writeFileSync(file, json, "utf8");
    bytes += Buffer.byteLength(json);
    chapters.forEach(function (c) { verses += (c || []).length; });
    index.push({ a: b.a, n: b.n, c: chapters.length, t: b.t });
  });

  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({
    version: "우리말성경",
    books: index
  }), "utf8");

  console.log("책 " + index.length + "권 · " + verses.toLocaleString() + "절 · " +
              (bytes / 1024 / 1024).toFixed(1) + "MB → " + outDir);
}).catch(function (e) {
  console.error("실패:", e.message);
  process.exit(1);
});
