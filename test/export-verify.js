/* ==========================================================================
   导出视觉验证（Node 侧，不依赖浏览器）
   --------------------------------------------------------------------------
   目的：确认「导出 PNG」这条路径真的把纸纹与墨迹凹凸画进了像素里，
        而不是只把文字画在纯色底上。
   做法：把 src/paper.js 原样加载进一个极小的 DOM 垫片，用与
        script.js 里 renderBoardToCanvas() 相同的顺序画一遍，
        再做像素统计（亮度起伏 = 有纸纹；墨迹带 = 有印刷感）。
   用法： node test/export-verify.js [输出目录]
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------- 1. 最小 canvas 垫片 ---------------- */
/* paper.js 只用到 fillRect / createImageData / putImageData / getImageData / stroke 等 */

function makeCanvas(w, h) {
  const cv = {
    width: w || 0, height: h || 0,
    _d: null,
    getContext() { return makeCtx(cv); },
    toDataURL() { return 'data:image/png;base64,'; }
  };
  return cv;
}

function makeCtx(cv) {
  const state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic' };
  const ensure = () => {
    if (!cv._d || cv._d.length !== cv.width * cv.height * 4) {
      cv._d = new Uint8ClampedArray(cv.width * cv.height * 4);
    }
    return cv._d;
  };
  const ctx = {
    canvas: cv,
    get fillStyle() { return state.fillStyle; }, set fillStyle(v) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; }, set strokeStyle(v) { state.strokeStyle = v; },
    get lineWidth() { return state.lineWidth; }, set lineWidth(v) { state.lineWidth = v; },
    get globalAlpha() { return state.globalAlpha; }, set globalAlpha(v) { state.globalAlpha = v; },
    font: state.font, textAlign: state.textAlign, textBaseline: state.textBaseline,
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) {
      const d = ensure();
      const out = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const s = ((y + j) * cv.width + (x + i)) * 4, t = (j * w + i) * 4;
          out[t] = d[s]; out[t + 1] = d[s + 1]; out[t + 2] = d[s + 2]; out[t + 3] = d[s + 3];
        }
      }
      return { width: w, height: h, data: out };
    },
    putImageData(img, x, y) {
      const d = ensure();
      for (let j = 0; j < img.height; j++) {
        for (let i = 0; i < img.width; i++) {
          const s = (j * img.width + i) * 4, t = ((y + j) * cv.width + (x + i)) * 4;
          d[t] = img.data[s]; d[t + 1] = img.data[s + 1]; d[t + 2] = img.data[s + 2]; d[t + 3] = img.data[s + 3];
        }
      }
    },
    fillRect(x, y, w, h) {
      const f = state.fillStyle;
      const a = parseAlpha(f, state.globalAlpha == null ? 1 : state.globalAlpha);
      if (f && typeof f === 'object' && f.__pattern) {
        fillPattern(cv, ensure(), x, y, w, h, f, a);
      } else {
        fillRectOn(cv, ensure(), x, y, w, h, parseColor(f), a);
      }
    },
    strokeRect(x, y, w, h) {
      const t = Math.max(1, Math.round(state.lineWidth));
      const c = parseColor(state.strokeStyle);
      fillRectOn(cv, ensure(), x, y, w, t, c, state.globalAlpha);
      fillRectOn(cv, ensure(), x, y + h - t, w, t, c, state.globalAlpha);
      fillRectOn(cv, ensure(), x, y, t, h, c, state.globalAlpha);
      fillRectOn(cv, ensure(), x + w - t, y, t, h, c, state.globalAlpha);
    },
    /* Node 侧没有字体渲染：用一条灰度块代表这段文字，只为看版式 */
    fillText(txt, x, y) {
      const size = parseInt((state.font.match(/(\d+)px/) || [0, 12])[1], 10);
      const w = String(txt).length * size * 0.6;
      const a = (state.globalAlpha == null ? 1 : state.globalAlpha) * 0.85;
      fillRectOn(cv, ensure(), x, y - size * 0.7, w, size * 0.8, parseColor(state.fillStyle), a);
    },
    clearRect(x, y, w, h) { fillRectOn(cv, ensure(), x, y, w, h, [0, 0, 0], 0, true); },
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, rect() {}, clip() {}, setLineDash() {},
    createPattern(img) {
      global.__patLog = (global.__patLog || []);
      global.__patLog.push({ hasImg: !!img, hasData: !!(img && img._d), w: img && img.width });
      return { __pattern: true, img: img };
    },
    drawImage() {}, measureText() { return { width: 0 }; }
  };
  return ctx;
}

/* 用纹理填充一块区域，按 multiply 混合（与画布上的 globalCompositeOperation 一致） */
function fillPattern(cv, d, x, y, w, h, pat, alpha) {
  const img = pat.img;
  if (!img || !img._d) return;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  for (let j = Math.max(0, y); j < Math.min(cv.height, y + h); j++) {
    for (let i = Math.max(0, x); i < Math.min(cv.width, x + w); i++) {
      const sx = ((j - y) % img.height) * img.width + ((i - x) % img.width);
      const sp = sx * 4;
      const dp = (j * cv.width + i) * 4;
      for (let k = 0; k < 3; k++) {
        const src = img._d[sp + k] / 255;
        const dst = d[dp + k] / 255;
        const mul = src * dst;                        /* multiply */
        const out = dst * (1 - alpha) + mul * alpha;
        d[dp + k] = Math.round(out * 255);
      }
      d[dp + 3] = 255;
    }
  }
}

function fillRectOn(cv, d, x, y, w, h, rgb, alpha, clear) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const a = alpha == null ? 1 : alpha;
  for (let j = Math.max(0, y); j < Math.min(cv.height, y + h); j++) {
    for (let i = Math.max(0, x); i < Math.min(cv.width, x + w); i++) {
      const p = (j * cv.width + i) * 4;
      if (clear) { d[p] = d[p + 1] = d[p + 2] = d[p + 3] = 0; continue; }
      /* 源覆盖：近似 source-over（不透明源） */
      d[p] = Math.round(d[p] * (1 - a) + rgb[0] * a);
      d[p + 1] = Math.round(d[p + 1] * (1 - a) + rgb[1] * a);
      d[p + 2] = Math.round(d[p + 2] * (1 - a) + rgb[2] * a);
      d[p + 3] = 255;
    }
  }
}

const NAMED = { '#000': [0, 0, 0], '#fff': [255, 255, 255], black: [0, 0, 0], white: [255, 255, 255] };
function parseColor(c) {
  if (Array.isArray(c)) return c;
  if (typeof c !== 'string') return [0, 0, 0];
  const s = c.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  let m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) { const h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]; }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) { const p = m[1].split(',').map((v) => parseFloat(v)); return [p[0], p[1], p[2]]; }
  return [0, 0, 0];
}
/* 颜色字符串里带 alpha 的情况（rgba(...)） */
function parseAlpha(c, fallback) {
  if (typeof c !== 'string') return fallback;
  const m = /^rgba\(([^)]+)\)$/.exec(c.trim().toLowerCase());
  if (m) { const p = m[1].split(',').map((v) => parseFloat(v)); return p.length > 3 ? p[3] : fallback; }
  return fallback;
}

const documentShim = { createElement: (tag) => (tag === 'canvas' ? makeCanvas(0, 0) : {}) };
global.document = documentShim;

/* ---------------- 2. 加载 paper.js ---------------- */
const paperSrc = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'paper.js'), 'utf8');
const sandbox = {};
new Function('window', 'document', paperSrc)(sandbox, documentShim);
const PL = sandbox.PaperLab;
if (!PL) { console.error('paper.js 没有导出 PaperLab'); process.exit(1); }

console.log('纸张引擎已加载：模板 ' + PL.BG_TEMPLATES.length + ' 套，纸纹 ' + PL.TEXTURE_LIST.length + ' 种\n');

/* ---------------- 3. PNG 编码（只用 zlib，不装依赖） ---------------- */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

/* ---------------- 4. 模拟导出：与 renderBoardToCanvas 同序 ---------------- */
const W = 760, H = 570, SCALE = 1;
const cv = makeCanvas(Math.round(W * SCALE), Math.round(H * SCALE));
const ctx = cv.getContext('2d');

function lum(d, p) { return d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114; }
function regionStats(canvas, x, y, w, h) {
  const d = canvas._d;
  const vals = [];
  for (let j = y; j < y + h; j += 1) {
    for (let i = x; i < x + w; i += 1) {
      const p = (j * canvas.width + i) * 4;
      vals.push(lum(d, p));
    }
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) * (v - mean), 0) / vals.length);
  return { 均值: Math.round(mean), 起伏: Math.round(sd * 10) / 10, 最暗: Math.round(Math.min.apply(null, vals)), 最亮: Math.round(Math.max.apply(null, vals)) };
}

const outDir = process.argv[2] || path.resolve(__dirname, '..', 'test');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const report = { 尺寸: W + '×' + H, 各项: [] };

/* 逐个模板：画底色 → 纸纹 → 线条，然后量中央区域的起伏 */
PL.BG_TEMPLATES.forEach((t) => {
  /* 清空 */
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = t.paper || '#211d1c';
  ctx.fillRect(0, 0, W, H);

  if (t.textures && t.textures[0]) {
    PL.paintTexture(ctx, t.textures[0], 0, 0, W, H, 1, { seed: 0 });
  }
  if (t.line) PL.drawLines(ctx, t.line, W, H, SCALE);

  const st = regionStats(cv, 60, 60, 300, 220);
  report.各项.push({
    模板: t.name + '(' + t.key + ')',
    有纸纹: !!(t.textures && t.textures[0]),
    有线条: !!t.line,
    中央区域: st,
    判定: (t.textures && t.textures[0])
      ? (st.起伏 >= 0.8 ? '纸纹已进像素 ✔' : '纸纹几乎看不见 ✘')
      : '纯色（无需纸纹）'
  });
});

/* 挑「报纸」出一张真实 PNG 给我看 */
const news = PL.TPL_MAP['news'];
ctx.clearRect(0, 0, cv.width, cv.height);
ctx.fillStyle = news.paper;
ctx.fillRect(0, 0, W, H);
PL.paintTexture(ctx, 'news', 0, 0, W, H, 1, { seed: 0 });
PL.drawLines(ctx, news.line, W, H, SCALE);

/* 在纸上"贴"三块带纸纹的碎片（模拟贴纸：底色 + 纸纹 + 文字色块） */
const palettes = ['#fbf6ea', '#efe0c4', '#f3ead8'];
const texes = ['exam', 'aged', 'crease'];
const boxes = [{ x: 70, y: 90, w: 320, h: 78 }, { x: 330, y: 240, w: 280, h: 70 }, { x: 120, y: 380, w: 360, h: 84 }];
const pieceStats = [];
boxes.forEach((b, i) => {
  ctx.fillStyle = palettes[i];
  ctx.fillRect(b.x, b.y, b.w, b.h);
  if (texes[i] !== 'none') PL.paintTexture(ctx, texes[i], b.x, b.y, b.w, b.h, 1, { seed: 0 });
  /* 文字用一条深色横条代表（Node 侧没有字体渲染） */
  ctx.fillStyle = '#2a2622';
  for (let k = 0; k < 5; k++) ctx.fillRect(b.x + 18 + k * (b.w - 40) / 6, b.y + b.h / 2 - 9, (b.w - 40) / 9, 18);
  pieceStats.push({ 贴纸: i + 1, 纸感: texes[i], 区域: regionStats(cv, b.x + 6, b.y + 6, b.w - 16, b.h - 16) });
});
report.贴纸 = pieceStats;

writePng(path.join(outDir, 'export-preview-报纸.png'), cv.width, cv.height, cv._d);
report.预览图 = 'test/export-preview-报纸.png';

/* ---------------- 5. 质感对比图：墨感 / 褶皱 各档并排 ---------------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/* Node 侧没有字体，用一块"字身"矩形代表文字，正好可以量墨迹与颗粒的效果 */
const CW = 1040, CH = 420;
const cmp = makeCanvas(CW, CH);
const cc = cmp.getContext('2d');
cc.fillStyle = '#efe9dc';
cc.fillRect(0, 0, CW, CH);

/* 统一的样例绘制：屏幕与导出两侧的层序在这里集中体现，便于对照
   层序：纸背 → 纸纹 → 墨迹高光（字下面）→ 字身 → 缺墨颗粒 → 褶皱（折线×2 + 纤维） */
function drawSwatch(g, x, y, w, h, opt) {
  const tx = x + 18, ty = y + h / 2 - 11, tw = w - 36, th = 22;

  /* 纸背 */
  g.fillStyle = opt.palette;
  g.fillRect(x, y, w, h);

  /* 纸纹 */
  if (opt.tex && opt.tex !== 'none') {
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    PL.paintTexture(g, opt.tex, x, y, w, h, 1, { seed: 0 });
    g.restore();
  }

  /* 墨迹高光：画在字**下面**，只错开一点点、始终很淡 */
  if (opt.ink > 0) {
    const off = 0.25 + (opt.ink / 100) * 0.95;
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = clamp(0.14 + opt.ink / 420, 0.14, 0.4);
    g.fillStyle = '#fffdf7';
    g.fillRect(tx - off, ty - off, tw, th);
    g.restore();
  }

  /* 字身：纯色，不做混合 */
  g.fillStyle = '#241f1a';
  g.fillRect(tx, ty, tw, th);

  /* 缺墨：颗粒啃边 */
  if (opt.ink > 0) {
    const worn = PL.makeTexture('worn', { seed: 0 });
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = clamp(((opt.inkAmt == null ? 45 : opt.inkAmt) / 100) * 0.62, 0, 0.62);
    const pat = g.createPattern(worn, 'repeat');
    if (pat) { g.fillStyle = pat; g.fillRect(x, y, w, h); }
    g.restore();
  }

  /* 褶皱：纤维 + 两层交叉折线（与 src/script.js 的 applyPieceGrain 同参数） */
  if (opt.fold > 0.001) {
    const v = clamp(opt.fold / 100, 0, 1);
    const foldTex = PL.makeTexture('kiev', { seed: 0 });
    const fiberTex = PL.makeTexture('fiber', { seed: 0 });
    const foldPx = 620 - v * 260;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.34 + v * 0.46;
    if (foldTex) {
      g.save();
      g.translate(x, y);
      g.scale(foldPx / foldTex.width, foldPx / foldTex.height);
      const q = g.createPattern(foldTex, 'repeat');
      if (q) { g.fillStyle = q; g.fillRect(0, 0, (w / foldPx) * foldTex.width, (h / foldPx) * foldTex.height); }
      g.restore();
    }
    if (foldTex && v > 0.35) {
      g.save();
      g.translate(x + w / 2, y + h / 2);
      g.rotate(Math.PI / 2);
      const s2 = (foldPx * 1.35) / foldTex.width;
      g.scale(s2, s2);
      const q2 = g.createPattern(foldTex, 'repeat');
      const span = (Math.max(w, h) / s2) * 1.6;
      if (q2) { g.fillStyle = q2; g.fillRect(-span / 2, -span / 2, span, span); }
      g.restore();
    }
    if (fiberTex) {
      const q3 = g.createPattern(fiberTex, 'repeat');
      if (q3) { g.fillStyle = q3; g.fillRect(x, y, w, h); }
    }
    g.restore();
  }

  /* 边框，方便看清每格 */
  g.strokeStyle = 'rgba(0,0,0,.18)';
  g.lineWidth = 1;
  g.strokeRect(x + .5, y + .5, w - 1, h - 1);
}

/* 上排：用量 15 / 35 / 55 / 85（墨感固定 55） */
[15, 35, 55, 85].forEach((inkAmt, i) => {
  drawSwatch(cc, 20 + i * 252, 24, 232, 92, { palette: '#fbf6ea', tex: 'none', ink: 55, inkAmt, fold: 0 });
});
/* 中排：褶皱 0 / 40 / 80 / 100（墨感固定 40） */
[0, 40, 80, 100].forEach((fold, i) => {
  drawSwatch(cc, 20 + i * 252, 148, 232, 92, { palette: '#fbf6ea', tex: 'none', ink: 40, fold });
});
/* 下排：四种纸感 */
['exam', 'news', 'aged', 'crease'].forEach((tex, i) => {
  drawSwatch(cc, 20 + i * 252, 272, 232, 118, { palette: '#fbf6ea', tex, ink: 35, fold: 20 });
});
writePng(path.join(outDir, 'export-preview-质感对比.png'), CW, CH, cmp._d);
report.质感对比图 = 'test/export-preview-质感对比.png';

/* 量差异：墨感 0↔100、褶皱 0↔100 */
function swatchCanvas(opt) {
  const c = makeCanvas(232, 92);
  drawSwatch(c.getContext('2d'), 0, 0, 232, 92, opt);
  return c;
}
report.墨感差异 = pixelDiff(
  swatchCanvas({ palette: '#fbf6ea', tex: 'none', ink: 0, inkAmt: 0, fold: 0 })._d,
  swatchCanvas({ palette: '#fbf6ea', tex: 'none', ink: 100, inkAmt: 100, fold: 0 })._d);
report.褶皱差异 = pixelDiff(
  swatchCanvas({ palette: '#fbf6ea', tex: 'none', ink: 0, fold: 0 })._d,
  swatchCanvas({ palette: '#fbf6ea', tex: 'none', ink: 0, fold: 100 })._d);
function pixelDiff(d1, d2) {
  let diff = 0, maxd = 0, n = 0;
  for (let i = 0; i < d1.length; i += 4) {
    const d = Math.abs(d1[i] - d2[i]);
    diff += d; if (d > maxd) maxd = d; n++;
  }
  return { 平均差: Math.round((diff / n) * 10) / 10, 最大差: maxd };
}

console.log(JSON.stringify(report, null, 1));
