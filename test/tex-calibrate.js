/* 量高度场的梯度量级，给纸纹参数定标（纯 Node，无浏览器） */
const fs = require('fs');
const src = fs.readFileSync(require('path').resolve(__dirname, '..', 'src', 'paper.js'), 'utf8');

/* 极简 canvas 垫片：只要 makeNoise / fbm 可用即可 */
function cv(w, h) {
  const c = { width: w || 0, height: h || 0, _d: null, getContext() { return mk(c); }, toDataURL() { return 'data:,'; } };
  return c;
}
function mk(c) {
  const s = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '10px x' };
  const ens = () => {
    if (!c._d || c._d.length !== c.width * c.height * 4) c._d = new Uint8ClampedArray(c.width * c.height * 4);
    return c._d;
  };
  return {
    canvas: c,
    set fillStyle(v) { s.fillStyle = v; }, get fillStyle() { return s.fillStyle; },
    set strokeStyle(v) { s.strokeStyle = v; }, get strokeStyle() { return s.strokeStyle; },
    set lineWidth(v) { s.lineWidth = v; }, get lineWidth() { return s.lineWidth; },
    set globalAlpha(v) { s.globalAlpha = v; }, get globalAlpha() { return s.globalAlpha; },
    font: s.font, textAlign: 'left', textBaseline: 'top',
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) {
      const d = ens(); const o = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const sp = ((y + j) * c.width + (x + i)) * 4, tp = (j * w + i) * 4;
        o[tp] = d[sp]; o[tp + 1] = d[sp + 1]; o[tp + 2] = d[sp + 2]; o[tp + 3] = d[sp + 3];
      }
      return { width: w, height: h, data: o };
    },
    putImageData(img, x, y) {
      const d = ens();
      for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
        const sp = (j * img.width + i) * 4, tp = ((y + j) * c.width + (x + i)) * 4;
        d[tp] = img.data[sp]; d[tp + 1] = img.data[sp + 1]; d[tp + 2] = img.data[sp + 2]; d[tp + 3] = img.data[sp + 3];
      }
    },
    clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    getTransform() { return { e: 0, f: 0 }; },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, rect() {}, clip() {}, setLineDash() {},
    createPattern(img) { return { __pattern: true, img: img }; },
    drawImage() {}, measureText() { return { width: 0 }; }
  };
}
const doc = { createElement: (t) => (t === 'canvas' ? cv(0, 0) : {}) };

const sb = {};
new Function('window', 'document', src)(sb, doc);
const PL = sb.PaperLab;
if (!PL) { console.error('paper.js 加载失败'); process.exit(1); }

const n = PL.makeNoise(1301);
console.log('高度场梯度量级（决定褶皱/折痕要乘多大的 relief）\n');
console.log(' fbmAt   gx 范围                梯度幅值中位数   建议 relief');
[2, 3, 4, 6, 8, 12, 20, 30].forEach((fbmAt) => {
  const size = 512, f = fbmAt / size;
  const h = (u, v) => PL.fbm(n, u * f, v * f, 4);
  const eta = 1 / (fbmAt * 8);
  let gmin = 9e9, gmax = -9e9;
  const mags = [];
  for (let y = 0; y < size; y += 11) {
    for (let x = 0; x < size; x += 11) {
      const u = x / size, v = y / size;
      const gx = (h(u + eta, v) - h(u - eta, v)) / (2 * eta);
      const gy = (h(u, v + eta) - h(u, v - eta)) / (2 * eta);
      gmin = Math.min(gmin, gx); gmax = Math.max(gmax, gx);
      mags.push(Math.hypot(gx, gy));
    }
  }
  mags.sort((a, b) => a - b);
  const med = mags[Math.floor(mags.length / 2)];
  /* 目标：亮度起伏大约 ±12 灰阶 → diff 变化 ≈ 12/relief，diff≈0.9*grad/len */
  const relief = Math.max(1, Math.round(12 / Math.max(1e-6, 0.9 * med)));
  console.log('  ' + String(fbmAt).padStart(2) + '    ' + (gmin.toFixed(1) + ' ~ ' + gmax.toFixed(1)).padEnd(24) + ' ' +
    med.toFixed(1).padStart(6) + '          ' + relief);
});

/* 逐纸纹实测：生成后看标准差 */
console.log('\n各纸纹当前参数下的实际起伏：');
['crease', 'folded', 'fiber', 'aged', 'news', 'exam', 'carbon'].forEach((k) => {
  const t = PL.makeTexture(k, { seed: 0 });
  const d = t._d;
  let mn = 999, mx = -1, sum = 0, n2 = 0;
  for (let i = 0; i < d.length; i += 4 * 29) { mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); sum += d[i]; n2++; }
  const mean = sum / n2;
  let sd = 0;
  for (let i = 0; i < d.length; i += 4 * 29) sd += (d[i] - mean) * (d[i] - mean);
  sd = Math.sqrt(sd / n2);
  console.log('  ' + k.padEnd(8) + ' 亮度 ' + String(mn).padStart(3) + '~' + String(mx).padStart(3) +
    '  均值 ' + String(Math.round(mean)).padStart(3) + '  标准差 ' + sd.toFixed(1) +
    (sd >= 1.5 ? '  ✔' : '  ✘ 太平'));
});
