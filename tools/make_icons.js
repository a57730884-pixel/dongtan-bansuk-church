/* 홈 화면 아이콘 만들기
   ------------------------------------------------------------
   images/logo.svg 와 같은 모양(열린 두 문 사이의 십자가)을 PNG 로 그립니다.
   휴대폰에서 '홈 화면에 추가' 할 때 쓰이는 아이콘입니다. 없으면 브라우저가
   apple-touch-icon.png 를 찾다가 404 를 남기고, 성도 휴대폰에는 빈 네모가 놓입니다.

   외부 라이브러리를 쓰지 않습니다. 도형이 사각형 넷뿐이라 직접 칠하고,
   PNG 는 node 에 들어 있는 zlib 으로 묶습니다.

   쓰는 법:  node tools/make_icons.js
   ------------------------------------------------------------ */
const fs = require("fs");
const zlib = require("zlib");

/* logo.svg 의 좌표(viewBox 840x1120)를 그대로 옮긴 것 */
const VB = { w: 840, h: 1120 };
const SHAPES = [
  { pts: [[14, 14], [392, 84], [330, 880], [14, 934]], rgb: [0x3a, 0xb8, 0xf3] },   // 왼쪽 문
  { pts: [[508, 150], [826, 66], [826, 1100], [446, 1012]], rgb: [0x8d, 0xce, 0x0a] }, // 오른쪽 문
  { pts: [[176, 358], [664, 358], [664, 438], [176, 438]], rgb: [0xff, 0xff, 0xff] }  // 십자가 가로대
];

function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function draw(size, pad) {
  const px = Buffer.alloc(size * size * 4, 0);
  const inner = size - pad * 2;
  const scale = Math.min(inner / VB.w, inner / VB.h);
  const ox = (size - VB.w * scale) / 2;
  const oy = (size - VB.h * scale) / 2;
  const SS = 3;                      // 계단 현상을 줄이려고 한 점을 3x3 으로 나눠 센다

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 255, g = 255, b = 255; // 흰 바탕
      for (const sh of SHAPES) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const ux = (x + (sx + 0.5) / SS - ox) / scale;
            const uy = (y + (sy + 0.5) / SS - oy) / scale;
            if (inside(sh.pts, ux, uy)) hits++;
          }
        }
        if (!hits) continue;
        const a = hits / (SS * SS);
        r = Math.round(r * (1 - a) + sh.rgb[0] * a);
        g = Math.round(g * (1 - a) + sh.rgb[1] * a);
        b = Math.round(b * (1 - a) + sh.rgb[2] * a);
      }
      const o = (y * size + x) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  return px;
}

/* ── PNG 로 묶기 ── */
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;                                  // 필터 없음
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

[["images/apple-touch-icon.png", 180, 22],
 ["images/icon-192.png", 192, 24],
 ["images/icon-512.png", 512, 64]].forEach(([path, size, pad]) => {
  const buf = png(size, draw(size, pad));
  fs.writeFileSync(path, buf);
  console.log(path, size + "px", (buf.length / 1024).toFixed(1) + "KB");
});
