/* 동탄반석교회 히어로 선화 생성기
   펜 스케치(동판화) 느낌은 해칭선의 밀도로 만든다.
   형태(예수님·성경)는 손으로 잡은 패스, 음영은 clipPath 안에 채운 평행선.
   시드가 고정돼 있어 몇 번을 돌려도 같은 그림이 나온다. */
const fs = require("fs");

/* ── 시드 난수 ── */
let _s = 20260915;
function rnd() { _s |= 0; _s = _s + 0x6D2B79F5 | 0; let t = Math.imul(_s ^ _s >>> 15, 1 | _s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const jit = (a) => (rnd() - 0.5) * 2 * a;
const n2 = (v) => Math.round(v * 10) / 10;

const INK = "#241609";

/* ── 해칭: 주어진 사각 범위를 각도 angle 의 평행선으로 채우고 clip 으로 형태를 오려낸다 ── */
function hatch(o) {
  const { x0, x1, y0, y1, angle, spacing, clip } = o;
  const w = o.width || 1, op = o.opacity || 0.5, wob = o.wobble == null ? 2.2 : o.wobble;
  const th = angle * Math.PI / 180;
  const dx = Math.cos(th), dy = Math.sin(th);
  const nx = -dy, ny = dx;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const R = Math.hypot(x1 - x0, y1 - y0) / 2 + 40;
  const dash = o.dash || 6;                  // 한 획의 길이 = spacing 의 몇 배
  const gap = o.gap == null ? 1.1 : o.gap;   // 획과 획 사이 빈자리
  const out = [];
  for (let t = -R; t <= R; t += spacing) {
    const px = cx + nx * t, py = cy + ny * t;
    // 한 줄을 끝까지 긋지 않는다. 펜이 종이에서 떨어졌다 다시 닿는 자리를 남긴다.
    let u = -R + rnd() * spacing * 4;
    while (u < R) {
      const len = spacing * dash * (0.45 + rnd() * 1.1);
      const v = Math.min(u + len, R);
      const ax = px + dx * u + jit(wob), ay = py + dy * u + jit(wob);
      const bx = px + dx * v + jit(wob), by = py + dy * v + jit(wob);
      const mx = (ax + bx) / 2 + nx * jit(2.6), my = (ay + by) / 2 + ny * jit(2.6);
      // 범위 밖 획은 아예 만들지 않는다. clip 으로 가리기만 하면 파일에는 그대로 남는다.
      const inBox = mx > x0 - 30 && mx < x1 + 30 && my > y0 - 30 && my < y1 + 30;
      if (inBox) out.push(`<path d="M${n2(ax)} ${n2(ay)}Q${n2(mx)} ${n2(my)} ${n2(bx)} ${n2(by)}" stroke-width="${n2(w * (0.7 + rnd() * 0.7))}" opacity="${n2(op * (0.5 + rnd() * 0.7))}"/>`);
      u = v + spacing * dash * gap * (0.25 + rnd() * 1.1);
    }
  }
  return `<g clip-path="url(#${clip})" fill="none" stroke="${INK}" stroke-linecap="round">${out.join("")}</g>`;
}

/* ── 손으로 그은 듯한 선 하나 ── */
function stroke(d, o = {}) {
  return `<path d="${d}" fill="none" stroke="${o.color || INK}" stroke-width="${o.w || 2}" opacity="${o.op == null ? 0.78 : o.op}" stroke-linecap="round" stroke-linejoin="round"${o.extra || ""}/>`;
}

/* ============================================================
   ① 예수님 — 뒤에서 본 모습. 얼굴을 그리지 않는다.
      보는 이가 그 등 뒤를 따라 걷는 자리에 서게 된다.
   ============================================================ */
/* 사람으로 읽히는 데 필요한 것은 세 가지뿐이다.
   ① 목보다 넓은 머리 ② 아래로 처지는 어깨 ③ 머리카락의 어두운 덩어리.
   비례는 머리 높이(H=80)를 자로 삼아 7H 로 잡았다. */
/* 몸통 — 어깨는 좁게 잡고, 팔은 따로 그려 몸 밖으로 드러낸다.
   덩어리 하나로 그리면 사람이 아니라 종(鐘)이 된다. */
const ROBE = [
  "M230 288",                                   // 목 왼쪽
  "C214 292 200 300 192 314",                   // 왼 어깨 — 밖으로, 아래로
  "C186 366 182 424 180 486",
  "C176 556 172 634 170 704",                   // 왼쪽 옷자락
  "C196 716 216 718 238 714",
  "C254 706 268 708 284 714",                   // 앞으로 나온 발 자리에서 한 번 꺾인다
  "C302 718 316 714 326 704",
  "C325 634 322 556 319 486",
  "C317 424 314 366 308 314",
  "C299 300 284 292 268 288",                   // 오른 어깨는 조금 더 낮다 — 좌우를 같게 두지 않는다
  "Z"
].join(" ");
/* 소매 — 어깨에서 흘러내려 손목에서 끝난다 */
const SLV_L = "M196 312 C176 348 168 396 170 442 C172 478 176 500 182 514 C196 518 208 514 214 506 C210 462 208 410 210 366 C211 340 210 322 212 310 Z";
const SLV_R = "M304 314 C322 350 330 398 328 444 C326 480 322 502 316 516 C302 520 290 516 284 508 C288 464 290 412 288 368 C287 342 288 324 286 312 Z";
const HEAD = "M244 194 C269 194 276 215 275 238 C274 263 260 278 244 278 C228 278 214 263 213 238 C212 215 219 194 244 194 Z";
const HAIR = [
  "M213 228",
  "C211 198 224 180 244 180",
  "C264 180 277 198 275 228",
  "C273 254 278 286 287 310",
  "C269 299 254 295 244 295",
  "C234 295 219 299 201 310",
  "C210 286 215 254 213 228",
  "Z"
].join(" ");

function jesus() {
  let s = "";
  s += `<clipPath id="cRobe"><path d="${ROBE}"/></clipPath>`;
  s += `<clipPath id="cHair"><path d="${HAIR}"/></clipPath>`;
  s += `<clipPath id="cHead"><path d="${HEAD}"/></clipPath>`;

  // 목 — 머리보다 좁게. 이 폭 차이가 사람으로 읽히게 한다
  s += stroke("M231 268 C230 280 230 286 229 290", { w: 1.6, op: 0.55 });
  s += stroke("M257 268 C258 280 258 286 259 290", { w: 1.6, op: 0.55 });

  // 옷 — 세로로 촘촘히 긋지 않는다. 옷이 아니라 통으로 보이기 때문에,
  //      비스듬히 한 번 얹고 왼쪽(빛 반대편)에만 한 번 더 겹친다
  s += hatch({ x0: 166, x1: 330, y0: 286, y1: 716, angle: 72, spacing: 11, opacity: 0.2, width: 1.05, clip: "cRobe", dash: 3.2, gap: 1.8 });
  s += hatch({ x0: 166, x1: 240, y0: 292, y1: 716, angle: 78, spacing: 6.5, opacity: 0.34, width: 1.15, clip: "cRobe", dash: 4.5, gap: 0.8 });
  s += hatch({ x0: 296, x1: 330, y0: 300, y1: 716, angle: 78, spacing: 7.5, opacity: 0.24, width: 1.05, clip: "cRobe", dash: 4, gap: 1 });
  s += hatch({ x0: 166, x1: 330, y0: 634, y1: 722, angle: 12, spacing: 8, opacity: 0.26, width: 1.1, clip: "cRobe", dash: 3, gap: 1.5 });

  // 머리카락 — 선이 아니라 면. 화면에서 가장 어두운 자리다
  s += `<path d="${HAIR}" fill="${INK}" opacity="0.5"/>`;
  s += hatch({ x0: 196, x1: 292, y0: 176, y1: 314, angle: 84, spacing: 3.6, opacity: 0.5, width: 1.2, clip: "cHair", dash: 12, gap: 0.35 });
  s += hatch({ x0: 208, x1: 280, y0: 190, y1: 282, angle: 62, spacing: 9, opacity: 0.18, width: 1, clip: "cHead", dash: 4, gap: 1.2 });

  // 윤곽
  s += stroke(HEAD, { w: 1.8, op: 0.7 });
  s += stroke(ROBE, { w: 2.4, op: 0.86 });
  s += stroke(HAIR, { w: 1.6, op: 0.7 });

  // 겉옷이 등을 덮는 선 — 가로로 곧게 긋지 않는다(뚜껑처럼 보인다). 가운데가 처지게
  s += stroke("M182 320 C212 356 276 356 308 320", { w: 1.8, op: 0.56 });
  s += stroke("M186 336 C214 374 274 374 304 336", { w: 1.2, op: 0.36 });

  // 팔 — 몸 밖으로 드러낸 소매. 팔이 보여야 사람이 된다
  s += `<clipPath id="cSlvL"><path d="${SLV_L}"/></clipPath>`;
  s += `<clipPath id="cSlvR"><path d="${SLV_R}"/></clipPath>`;
  s += hatch({ x0: 164, x1: 218, y0: 306, y1: 520, angle: 80, spacing: 5.5, opacity: 0.34, width: 1.1, clip: "cSlvL", dash: 5, gap: 0.7 });
  s += hatch({ x0: 282, x1: 334, y0: 306, y1: 522, angle: 100, spacing: 7, opacity: 0.22, width: 1.05, clip: "cSlvR", dash: 4, gap: 1.1 });
  s += stroke(SLV_L, { w: 1.9, op: 0.72 });
  s += stroke(SLV_R, { w: 1.9, op: 0.72 });
  // 소맷부리와 손
  s += stroke("M182 514 C192 522 206 520 214 506", { w: 1.6, op: 0.6 });
  s += stroke("M316 516 C306 524 292 522 284 508", { w: 1.6, op: 0.6 });
  s += stroke("M300 516 C312 512 320 520 318 532 C314 542 302 540 299 530", { w: 1.6, op: 0.6 });

  // 옷 주름 — 좌우를 같게 두지 않는다
  const folds = [
    "M222 348 C214 440 208 566 204 706",
    "M248 352 C248 444 249 572 250 712",
    "M276 346 C284 438 291 566 296 704",
    "M236 440 C231 526 228 634 226 710",
    "M266 448 C271 530 275 634 278 710"
  ];
  folds.forEach((d, i) => { s += stroke(d, { w: i < 3 ? 1.5 : 1.1, op: i < 3 ? 0.44 : 0.28 }); });

  // 겉옷이 한쪽 어깨에서 반대쪽 허리로 흘러내린다 — 이 사선 하나가 좌우대칭을 깬다
  s += stroke("M196 326 C226 386 276 448 318 486", { w: 1.8, op: 0.5 });
  s += stroke("M202 320 C232 380 282 442 322 480", { w: 1.1, op: 0.3 });

  // 허리띠
  s += stroke("M184 452 C214 466 282 466 316 452", { w: 1.7, op: 0.5 });
  s += stroke("M185 461 C214 475 282 475 317 461", { w: 1.1, op: 0.3 });

  // 옷자락과 발 — 한 발이 앞으로 나와 있다
  s += stroke("M170 704 C196 716 216 718 238 714 C254 706 268 708 284 714 C302 718 316 714 326 704", { w: 2.2, op: 0.74 });
  s += stroke("M240 712 C242 726 258 730 270 722 C276 716 274 710 268 708", { w: 1.8, op: 0.66 });
  s += stroke("M196 710 C198 722 212 726 222 720", { w: 1.6, op: 0.52 });

  // 지팡이 — 손에서 땅까지
  s += stroke("M310 352 C320 476 332 606 342 730", { w: 2.6, op: 0.76 });
  s += stroke("M307 346 C316 340 326 346 327 356", { w: 2, op: 0.58 });

  // 발치의 그림자
  s += `<clipPath id="cShadow"><ellipse cx="248" cy="718" rx="118" ry="15"/></clipPath>`;
  s += hatch({ x0: 128, x1: 368, y0: 704, y1: 736, angle: 5, spacing: 4.6, opacity: 0.34, width: 1.1, clip: "cShadow", dash: 4, gap: 0.8 });

  return s;   // 놓이는 자리는 아래 레이아웃이 정한다
}

/* ============================================================
   ② 펼친 성경 — 하늘에 열려 있다. 그 사이에서 빛이 뻗는다.
   ============================================================ */
const PG_L = "M1250 344 C1168 304 1078 294 1010 316 C1020 396 1038 482 1062 552 C1138 532 1206 544 1250 570 Z";
const PG_R = "M1250 344 C1332 304 1422 294 1490 316 C1480 396 1462 482 1438 552 C1362 532 1294 544 1250 570 Z";

function bible() {
  let s = "";
  s += `<clipPath id="cPgL"><path d="${PG_L}"/></clipPath>`;
  s += `<clipPath id="cPgR"><path d="${PG_R}"/></clipPath>`;

  // 종이의 결 — 글줄이 주인이므로 그늘은 책등 쪽에만 살짝
  s += hatch({ x0: 1150, x1: 1258, y0: 320, y1: 580, angle: 74, spacing: 7, opacity: 0.26, width: 1.05, clip: "cPgL", dash: 3, gap: 1.6 });
  s += hatch({ x0: 1242, x1: 1350, y0: 320, y1: 580, angle: 106, spacing: 7, opacity: 0.26, width: 1.05, clip: "cPgR", dash: 3, gap: 1.6 });

  // 글줄 — 읽히지 않는 글자의 자리. 오른쪽 끝을 들쭉날쭉하게 둔다
  const lines = [];
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const yL = 372 + t * 150, xa = 1042 + t * 22, xb = 1222 - t * 10 - rnd() * 34;
    lines.push(`<path d="M${n2(xa)} ${n2(yL - t * 14)}Q${n2((xa + xb) / 2)} ${n2(yL - t * 14 + 7)} ${n2(xb)} ${n2(yL - t * 6)}" opacity="${n2(0.3 + rnd() * 0.24)}"/>`);
    const xc = 1278 + t * 10 + rnd() * 34, xd = 1458 - t * 22;
    lines.push(`<path d="M${n2(xc)} ${n2(yL - t * 6)}Q${n2((xc + xd) / 2)} ${n2(yL - t * 14 + 7)} ${n2(xd)} ${n2(yL - t * 14)}" opacity="${n2(0.3 + rnd() * 0.24)}"/>`);
  }
  s += `<g fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round">${lines.join("")}</g>`;

  // 윤곽 · 책등 · 책배
  s += stroke(PG_L, { w: 2.4, op: 0.84 });
  s += stroke(PG_R, { w: 2.4, op: 0.84 });
  s += stroke("M1250 344 L1250 570", { w: 2, op: 0.6 });
  s += stroke("M1062 552 C1138 532 1206 544 1250 570 C1294 544 1362 532 1438 552", { w: 2.2, op: 0.8 });
  s += stroke("M1068 566 C1142 546 1208 558 1250 584 C1292 558 1358 546 1432 566", { w: 1.6, op: 0.56 });
  s += stroke("M1074 580 C1146 560 1210 572 1250 596 C1290 572 1354 560 1426 580", { w: 1.2, op: 0.38 });
  s += stroke("M1062 552 L1074 580", { w: 1.4, op: 0.5 });
  s += stroke("M1438 552 L1426 580", { w: 1.4, op: 0.5 });

  return s;
}

/* 책에서 뻗는 빛 — 부챗살 */
function rays() {
  const out = [];
  const ox = 1250, oy = 330;
  for (let i = 0; i < 17; i++) {
    const a = (-168 + i * 10.5 + jit(2.2)) * Math.PI / 180;
    const r0 = 34 + rnd() * 26, r1 = 300 + rnd() * 320;
    const x0 = ox + Math.cos(a) * r0, y0 = oy + Math.sin(a) * r0;
    const x1 = ox + Math.cos(a) * r1, y1 = oy + Math.sin(a) * r1;
    out.push(`<path d="M${n2(x0)} ${n2(y0)} L${n2(x1)} ${n2(y1)}" stroke-width="${n2(0.9 + rnd() * 1.5)}" opacity="${n2(0.14 + rnd() * 0.2)}"/>`);
  }
  return `<g fill="none" stroke="${INK}" stroke-linecap="round">${out.join("")}</g>`;
}

/* ============================================================
   ③ 땅과 하늘 — 화면을 받치는 결
   ============================================================ */
function ground(L) {
  const W = L.W, H = L.H, hy = L.horizonY;
  let s = "";
  const line = `M-40 ${hy + 22} C${W * 0.2} ${hy - 4} ${W * 0.44} ${hy + 12} ${W * 0.64} ${hy} C${W * 0.82} ${hy - 10} ${W * 0.94} ${hy + 6} ${W + 40} ${hy - 4}`;
  s += `<clipPath id="cGround"><path d="${line} L${W + 40} ${H + 40} L-40 ${H + 40} Z"/></clipPath>`;
  // 땅은 성기게. 격자로 보이지 않도록 한 방향으로만, 짧게 끊어 긋는다.
  s += hatch({ x0: -40, x1: W + 40, y0: hy, y1: H + 40, angle: 4, spacing: 14, opacity: 0.2, width: 1.1, clip: "cGround", wobble: 5, dash: 3.4, gap: 2.6 });
  s += hatch({ x0: -40, x1: W + 40, y0: H - 48, y1: H + 40, angle: 3, spacing: 9, opacity: 0.26, width: 1.2, clip: "cGround", wobble: 4, dash: 2.8, gap: 1.8 });
  // 지평선
  s += stroke(line, { w: 2.2, op: 0.5 });
  // 길 — 앞서 가신 발자국
  const fx = L.figure.x + 244 * L.figure.s;
  s += stroke(`M${fx - 110} ${H + 20} C${fx - 60} ${H - 70} ${fx - 20} ${hy + 80} ${fx - 4} ${hy + 18}`, { w: 1.6, op: 0.28 });
  s += stroke(`M${fx + 210} ${H + 20} C${fx + 130} ${H - 74} ${fx + 50} ${hy + 74} ${fx + 20} ${hy + 18}`, { w: 1.6, op: 0.28 });
  return s;
}

function sky(L) {
  const W = L.W, H = L.H;
  let s = "";
  // 구름 — 길고 옅은 가로선 몇 줄. 자리는 화면 비율에 맞춰 잡는다
  const cl = [[0.05, 0.28], [0.04, 0.32], [0.33, 0.2], [0.44, 0.66], [0.08, 0.62], [0.89, 0.22]];
  cl.forEach(([rx, ry]) => {
    const x = W * rx, y = H * ry, len = W * 0.22;
    s += stroke(`M${n2(x)} ${n2(y)} C${n2(x + len * 0.36)} ${n2(y - 18)} ${n2(x + len * 0.7)} ${n2(y - 14)} ${n2(x + len)} ${n2(y + 8)}`, { w: 1.6, op: 0.18 });
  });
  // 새 — 작은 갈매기 획
  const birds = [[0.35, 0.33, 1], [0.38, 0.31, 0.82], [0.4, 0.35, 0.66], [0.62, 0.26, 0.9]];
  birds.forEach(([rx, ry, k]) => {
    const x = W * rx, y = H * ry;
    s += stroke(`M${n2(x)} ${n2(y)} q${10 * k} ${-9 * k} ${20 * k} 0 q${10 * k} ${-9 * k} ${20 * k} 0`, { w: 1.8 * k, op: 0.42 });
  });
  return s;
}

/* ============================================================
   조립
   ============================================================ */
/* 가로(넓은 화면)와 세로(휴대폰) 두 벌을 만든다.
   휴대폰에서 가로 그림을 잘라 쓰면 가운데 빈 하늘만 남아,
   예수님도 성경도 화면에서 사라진다. */
const LAYOUTS = {
  wide: {
    W: 1600, H: 900, horizonY: 650,
    figure: { x: -26, y: 30, s: 1 },
    book: { x: 62, y: -16, s: 1 },
    grad: { x1: 0, y1: 0.12, x2: 1, y2: 0.88 },
    bloom: { cx: 0.5, cy: 0.42, r: 0.52 }
  },
  /* 세로 — 휴대폰 화면 비율(약 0.49)에 맞춰 잘려 나가지 않게 그린다.
     제목 판이 앉는 자리(높이의 16~45%)는 비우고,
     성경은 그 위 하늘에, 예수님은 그 아래 지평선 위에 작게 세운다. */
  tall: {
    W: 900, H: 1850, horizonY: 1180,
    figure: { x: 93, y: 805, s: 0.55 },
    book: { x: -325, y: -188, s: 0.62 },
    grad: { x1: 0.08, y1: 0, x2: 0.92, y2: 1 },
    bloom: { cx: 0.5, cy: 0.3, r: 0.56 }
  }
};

function build(L) {
  const T = (o) => `translate(${o.x} ${o.y}) scale(${o.s})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.W} ${L.H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="">
<title>예수님과 펼친 성경, 그 위에 머무는 영광</title>
<defs>
  <linearGradient id="bg" x1="${L.grad.x1}" y1="${L.grad.y1}" x2="${L.grad.x2}" y2="${L.grad.y2}">
    <stop offset="0" stop-color="#0a4f62"/>
    <stop offset="0.22" stop-color="#157a83"/>
    <stop offset="0.42" stop-color="#5f9a83"/>
    <stop offset="0.56" stop-color="#bda071"/>
    <stop offset="0.74" stop-color="#cf7f2f"/>
    <stop offset="1" stop-color="#94430f"/>
  </linearGradient>
  <radialGradient id="bloom" cx="${L.bloom.cx}" cy="${L.bloom.cy}" r="${L.bloom.r}">
    <stop offset="0" stop-color="#fff6e2" stop-opacity="0.5"/>
    <stop offset="0.55" stop-color="#ffe9c6" stop-opacity="0.16"/>
    <stop offset="1" stop-color="#ffe9c6" stop-opacity="0"/>
  </radialGradient>
  <filter id="paper" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
</defs>

<rect width="${L.W}" height="${L.H}" fill="url(#bg)"/>
<rect width="${L.W}" height="${L.H}" fill="url(#bloom)"/>

<g>${sky(L)}</g>
<g transform="${T(L.book)}">${rays()}</g>
<g>${ground(L)}</g>
<g transform="${T(L.book)}">${bible()}</g>
<g transform="${T(L.figure)}">${jesus()}</g>

<rect width="${L.W}" height="${L.H}" filter="url(#paper)" opacity="0.1" style="mix-blend-mode:overlay"/>
</svg>
`;
}

/* 사용법: node tools/gen_hero_sketch.js <가로.svg> [세로.svg] */
const out = [[process.argv[2], LAYOUTS.wide], [process.argv[3], LAYOUTS.tall]];
out.forEach(([path, L]) => {
  if (!path) return;
  const svg = build(L);
  fs.writeFileSync(path, svg, "utf8");
  console.log("wrote", path, (svg.length / 1024).toFixed(1) + "KB");
});
