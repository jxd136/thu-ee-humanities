/* ==========================================================================
   人文组 · 拼贴诗工作台 —— 纸张引擎
   --------------------------------------------------------------------------
   本文件只做一件事：程序化生成「纸」。
     1. 噪波与纹理   makeTexture()  —— 褶皱 / 折痕 / 纤维 / 旧纸 / 报纸 / 试卷
     2. 板面模板     BG_TEMPLATES  —— 纯色 / 横线 / 竖线 / 方格 / 稿纸 / 点阵 /
                                      信纸 / 牛皮纸 / 报纸 / 试卷 / 乐谱 / 日历孔
     3. 纹理列表     TEXTURE_LIST  —— 贴纸可选的纸感
   关键约定：屏幕侧把纹理当 DOM 背景铺（multiply 混合），导出侧用同一张
   canvas 纹理走 createPattern + multiply，两条路径共用同一份生成结果，
   所以「所见即所得」。
   ========================================================================== */
(function () {
  'use strict';

  /* ========================= 0. 小工具 ========================= */

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function round2(v) { return Math.round(v * 100) / 100; }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ========================= 1. 噪波 ========================= */
  /* Perlin 风格的值噪声，整数周期 → 纹理可以无缝平铺 */

  function makeNoise(seed) {
    const rnd = mulberry32(seed >>> 0);
    const P = new Uint8Array(256);
    for (let i = 0; i < 256; i++) P[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = P[i]; P[i] = P[j]; P[j] = t;
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = P[i & 255];
    const gx = new Float32Array(256), gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const a = rnd() * Math.PI * 2;
      gx[i] = Math.cos(a); gy[i] = Math.sin(a);
    }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    return function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const X = xi & 255, Y = yi & 255;
      const xf = x - xi, yf = y - yi;
      const u = fade(xf), v = fade(yf);
      const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
      const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
      const n00 = gx[aa] * xf + gy[aa] * yf;
      const n10 = gx[ba] * (xf - 1) + gy[ba] * yf;
      const n01 = gx[ab] * xf + gy[ab] * (yf - 1);
      const n11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);
      const nx0 = n00 + u * (n10 - n00);
      const nx1 = n01 + u * (n11 - n01);
      return nx0 + v * (nx1 - nx0);
    };
  }

  function fbm(noise, x, y, oct) {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); f *= 2; a *= 0.5; }
    return s;
  }

  /* ========================= 2. 纹理定义 ========================= */
  /* freqs 给的是「整个纹理里的周期数」，取整数才能平铺 */

  const TEXTURE_LIST = [
    { key: 'plain',  name: '纯净',   desc: '没有纹理的干净纸' },
    { key: 'crease', name: '褶皱',   desc: '像被揉过又展开的纸' },
    { key: 'folded', name: '折痕',   desc: '明显的大折痕与硬边' },
    { key: 'fiber',  name: '纤维',   desc: '纸张纤维与细颗粒' },
    { key: 'aged',   name: '旧纸',   desc: '泛黄、有水渍的旧纸' },
    { key: 'news',   name: '报纸',   desc: '新闻纸的灰底与网点' },
    { key: 'exam',   name: '试卷',   desc: '试卷纸的淡灰与轻微污渍' },
    { key: 'carbon', name: '复写',   desc: '复写纸式的斑驳墨感' },
    { key: 'kiev',   name: '折线',   desc: '成片的折痕，叠在别的纸上做揉皱效果' },
    { key: 'worn',   name: '缺墨',   desc: '几乎全黑、只有细密亮点的蒙版，用来"啃"字的边缘' }
  ];

  const TEX_CFG = {
    /* relief = 起伏的目标灰阶幅度（±），不再依赖噪声的绝对幅度 */
    crease: { size: 512, base: 255, fbmAt: 6, oct: 4, k: 1.0, relief: 13, fine: 3, seed: 1301 },
    /* 折线：噪声沿一个方向拉长 → 长条折痕；表面更陡，起伏感更强。
       base 必须留出余量，否则正负两侧会被 255 截断（截断就变纯白了）。 */
    kiev:   { size: 512, base: 236, fbmAt: 5, oct: 4, k: 2.2, relief: 22, fine: 2,
              stretch: [1, 0.16], seed: 8803 },
    /* 缺墨蒙版：中灰底 + 细密亮点 —— 亮的地方"啃"掉一点字。
       太高会把字洗白，太低啃不动，所以均值控制在 90~120 之间。 */
    worn:   { size: 256, base: 104, fbmAt: 20, oct: 3, k: 1.6, relief: 8, fine: 62,
              speckle: 0.0025, seed: 9907 },
    folded: { size: 512, base: 254, fbmAt: 3, oct: 3, k: 1.6, relief: 17, fine: 3, seed: 2603 },
    fiber:  { size: 256, base: 253, fbmAt: 15, oct: 3, k: 1.4, relief: 5, fine: 4, seed: 3907 },
    aged:   { size: 512, base: 247, fbmAt: 5, oct: 4, k: 1.0, relief: 6, fine: 3,
              tint: [8, 12, 26], seed: 4703 },
    news:   { size: 256, base: 236, fbmAt: 10, oct: 3, k: 1.5, relief: 4, fine: 4,
              halftone: 3, halftoneAmt: 15, seed: 5801 },
    exam:   { size: 256, base: 250, fbmAt: 4, oct: 3, k: 1.2, relief: 4, fine: 3,
              bleach: [0.986, 0.994, 1.0], seed: 6907 },
    carbon: { size: 512, base: 249, fbmAt: 9, oct: 3, k: 3.0, relief: 9, fine: 4,
              speckle: 0.0022, seed: 7919 }
  };

  const texCache = new Map();

  /* 生成一张灰度纸纹（RGB 略带色偏，A 恒为 255） */
  function makeTexture(kind, opt) {
    if (kind === 'plain') return null;
    const cfg = TEX_CFG[kind];
    if (!cfg) return null;
    const seedShift = (opt && opt.seed) || 0;
    const key = kind + '|' + seedShift;
    if (texCache.has(key)) return texCache.get(key);

    const size = cfg.size;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;

    const n1 = makeNoise(cfg.seed + seedShift * 101);
    const f = cfg.fbmAt / size;                 /* 归一化：整个纹理 0~fbmAt 个周期 */
    /* stretch：把噪声沿一个方向拉长，得到长条状折痕（[1,0.16] 表示横向拉伸） */
    const st = cfg.stretch || [1, 1];
    const hAt = (u, v) => fbm(n1, u * f * st[0], v * f * st[1], cfg.oct);
    /* 高度场的差分步长：按纹理自身的周期取，保证梯度是无量纲的合理量级 */
    const step = 1 / (cfg.fbmAt * 4);

    /* 自标定：噪声在不同频率下绝对幅度差很多，先量出这张高度场的标准差，
       再把梯度归一化，这样 cfg.relief 就是「褶皱起伏的灰阶幅度」，可预期。 */
    let hSum = 0, hSum2 = 0, hN = 0;
    const sampleStep = Math.max(1, Math.round(size / 72));
    for (let y = 0; y < size; y += sampleStep) {
      for (let x = 0; x < size; x += sampleStep) {
        const h = hAt(x / size, y / size);
        hSum += h; hSum2 += h * h; hN++;
      }
    }
    const hMean = hSum / hN;
    const hSd = Math.sqrt(Math.max(1e-9, hSum2 / hN - hMean * hMean));

    const tint = cfg.tint || [0, 0, 0];
    const bleach = cfg.bleach || null;
    const rnd = mulberry32(cfg.seed + 77 + seedShift * 13);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const h = (hAt(u, v) - hMean) / hSd;      /* 归一化后的高度场，标准差 = 1 */
        /* 差分求法线（同样用归一化后的场） */
        const e = size / 160;                      /* 采样间隔（以噪声周期为单位） */
        const hx = ((hAt(u + e / size, v) - hMean) / hSd - h) * (size / e);
        const hy = ((hAt(u, v + e / size) - hMean) / hSd - h) * (size / e);
        const k = cfg.k;
        const len = Math.sqrt(hx * hx * k * k + hy * hy * k * k + 1) || 1;
        /* 光的水平分量跟着拉伸方向走，否则沿光源方向拉长的折痕会看不见 */
        const lx = st[1] < st[0] ? -0.12 : -0.62;
        const ly = st[1] < st[0] ? -0.72 : -0.4;
        const diff = (lx * hx * k + ly * hy * k + 0.72) / len;

        let val = cfg.base + diff * cfg.relief + h * cfg.fine;

        if (cfg.halftone) {
          const cell = cfg.halftone;
          const gx = ((x % cell) / cell) - 0.5;
          const gy = ((y % cell) / cell) - 0.5;
          const dotv = 1 - Math.min(1, Math.sqrt(gx * gx + gy * gy) * 2.6);
          val -= dotv * cfg.halftoneAmt;
        }
        if (cfg.speckle && rnd() < cfg.speckle) val -= 60 + rnd() * 40;

        val = clamp(val, 0, 255);

        /* 色偏：旧纸偏黄褐，试卷偏冷 */
        let r = val + tint[0] * (1 - val / 255) * 3;
        let g = val + tint[1] * (1 - val / 255) * 3;
        let b = val + tint[2] * (1 - val / 255) * 3;
        if (bleach) { r *= bleach[0]; g *= bleach[1]; b *= bleach[2]; }

        const p = (y * size + x) * 4;
        d[p] = clamp(Math.round(r), 0, 255);
        d[p + 1] = clamp(Math.round(g), 0, 255);
        d[p + 2] = clamp(Math.round(b), 0, 255);
        d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    texCache.set(key, cv);
    return cv;
  }

  /* 屏幕侧用：纹理的 dataURL（缓存，避免反复编码） */
  const urlCache = new Map();
  function textureUrl(kind, opt) {
    if (kind === 'plain') return '';
    const key = kind + '|' + ((opt && opt.seed) || 0);
    if (urlCache.has(key)) return urlCache.get(key);
    const cv = makeTexture(kind, opt);
    const url = cv ? cv.toDataURL('image/png') : '';
    urlCache.set(key, url);
    return url;
  }

  /* 画布侧用：把纹理按 multiply 铺满一块区域（导出时调用） */
  function paintTexture(ctx, kind, x, y, w, h, alpha, opt) {
    if (kind === 'plain' || !kind) return false;
    const cv = makeTexture(kind, opt);
    if (!cv) return false;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const pat = ctx.createPattern(cv, 'repeat');
    if (!pat) { ctx.restore(); return false; }
    /* 把图案原点对到贴纸左上角，这样每块贴纸的纹理不会"跳" */
    if (pat.setTransform && ctx.setTransform) {
      try {
        const m = ctx.getTransform();
        pat.setTransform(new DOMMatrix([1, 0, 0, 1, (x + m.e) % cv.width, (y + m.f) % cv.height]));
      } catch (e) { /* 不支持就算了 */ }
    }
    ctx.fillStyle = pat;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return true;
  }

  /* ========================= 3. 板面模板 ========================= */
  /* 每个模板给出：底色、可选的纹理、以及叠在上面的线条参数。
     线条用页面自己的 canvas 画（画在 .board__paper 上），导出时同一个函数再画一遍。 */

  const BG_TEMPLATES = [
    {
      key: 'plain', name: '纯色', tone: 'charcoal', paper: null, line: null,
      desc: '最干净的黑板，适合色彩丰富的碎片'
    },
    {
      key: 'line', name: '横线纸', paper: '#fbf7ec', line: { type: 'h', gap: 34, color: 'rgba(64,110,150,.30)', width: 1 },
      textures: ['fiber'], texSize: 300, desc: '练习本横线，写字感最强'
    },
    {
      key: 'vline', name: '竖线纸', paper: '#fbf7ec', line: { type: 'v', gap: 34, color: 'rgba(64,110,150,.26)', width: 1 },
      desc: '竖格，适合竖排的短句'
    },
    {
      key: 'grid', name: '方格纸', paper: '#fcf9f1', line: { type: 'grid', gap: 30, color: 'rgba(64,110,150,.26)', width: 1 },
      textures: ['fiber'], texSize: 300, desc: '方格本，学生时代的感觉'
    },
    {
      key: 'manuscript', name: '稿纸', paper: '#fdfaf2',
      line: { type: 'grid', gap: 40, color: 'rgba(150,70,60,.34)', width: 1, doubleGap: 200 },
      textures: ['exam'], texSize: 280, desc: '红格稿纸，一格一字'
    },
    {
      key: 'dots', name: '点阵纸', paper: '#fbf8f0', line: { type: 'dots', gap: 26, color: 'rgba(70,80,95,.42)', width: 1.4 },
      desc: '点阵本，克制一点'
    },
    {
      key: 'letter', name: '信纸', paper: '#fdf8ee',
      line: { type: 'letter', gap: 30, color: 'rgba(120,140,170,.34)', width: 1, margin: 54 },
      textures: ['crease'], texSize: 300, desc: '带页边距与横线的信纸，右上角有邮票位'
    },
    {
      key: 'kraft', name: '牛皮纸', paper: '#c9a878', textures: ['folded'], texSize: 560, texOpacity: 1, line: null,
      desc: '牛皮纸，天然适合贴胶带'
    },
    {
      key: 'news', name: '报纸', paper: '#f0ece1',
      line: { type: 'news', color: 'rgba(60,55,48,.5)', width: 1 },
      textures: ['news'], texSize: 260, desc: '分栏与标题线，像一整版报纸'
    },
    {
      key: 'exam', name: '试卷', paper: '#f7f4ec',
      line: { type: 'exam', color: 'rgba(70,70,80,.42)', width: 1 },
      textures: ['exam'], texSize: 280, desc: '密封线、题号、装订孔'
    },
    {
      key: 'ivory', name: '米白纸', paper: '#efe7d7', textures: ['crease'], texSize: 460, line: null,
      desc: '干净的米白纸，最百搭'
    },
    {
      key: 'linen', name: '布纹纸', paper: '#f4efe4', textures: ['fiber'], texSize: 260, line: null,
      desc: '细布纹，安静'
    },
    {
      key: 'aged', name: '旧纸', paper: '#eee0c4', textures: ['aged'], texSize: 520, line: null,
      desc: '泛黄带水渍，很有年代感'
    },
    {
      key: 'music', name: '乐谱', paper: '#fcf8ef',
      line: { type: 'music', gap: 30, color: 'rgba(45,45,50,.5)', width: 1 },
      desc: '五线谱，随便贴几个字就像歌'
    },
    {
      key: 'calendar', name: '日历', paper: '#fdfaf3',
      line: { type: 'calendar', gap: 54, color: 'rgba(160,60,55,.40)', width: 1 },
      textures: ['exam'], texSize: 300, desc: '日历格，一格一句'
    },
    {
      key: 'carbon', name: '复写纸', paper: '#e7ebf0', textures: ['carbon'], texSize: 400, line: null,
      desc: '偏冷的复写纸，墨迹斑驳'
    },
    {
      key: 'dark', name: '深色纸', paper: '#2b2724', textures: ['crease'], texSize: 460, dark: true, line: null,
      desc: '深底浅字的纸，适合白色碎片'
    }
  ];

  const TPL_MAP = {};
  BG_TEMPLATES.forEach((t) => { TPL_MAP[t.key] = t; });

  /* 把线条画到 2D 上下文里；w/h 是纸面尺寸，scale 是导出倍率 */
  function drawLines(ctx, line, w, h, scale) {
    if (!line) return;
    const s = scale || 1;
    ctx.save();
    ctx.scale(s, s);
    ctx.strokeStyle = line.color || 'rgba(0,0,0,.3)';
    ctx.fillStyle = line.color || 'rgba(0,0,0,.3)';
    ctx.lineWidth = line.width || 1;
    const gap = line.gap || 32;
    const type = line.type;

    if (type === 'h' || type === 'letter') {
      const top = type === 'letter' ? 34 : 0;
      for (let y = top; y <= h / s; y += gap) {
        ctx.beginPath();
        if (type === 'letter') { ctx.moveTo(line.margin || 50, y); ctx.lineTo(w / s - (line.margin || 50), y); }
        else { ctx.moveTo(0, y); ctx.lineTo(w / s, y); }
        ctx.stroke();
      }
      if (type === 'letter') {
        /* 顶部小装饰线 + 右上角邮票框 */
        ctx.beginPath();
        ctx.moveTo(line.margin || 50, 22); ctx.lineTo(w / s - (line.margin || 50), 22);
        ctx.stroke();
        const m = line.margin || 50;
        ctx.strokeRect(w / s - m - 30, 34, 30, 38);
      }
    } else if (type === 'v') {
      for (let x = 0; x <= w / s; x += gap) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h / s); ctx.stroke();
      }
    } else if (type === 'grid') {
      for (let x = 0; x <= w / s; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h / s); ctx.stroke(); }
      for (let y = 0; y <= h / s; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w / s, y); ctx.stroke(); }
      if (line.doubleGap) {
        ctx.save();
        ctx.strokeStyle = 'rgba(150,70,60,.22)';
        for (let y = 0; y <= h / s; y += line.doubleGap) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w / s, y); ctx.stroke();
        }
        ctx.restore();
      }
    } else if (type === 'dots') {
      const r = (line.width || 1.4) / 2;
      for (let y = gap; y < h / s; y += gap) {
        for (let x = gap; x < w / s; x += gap) {
          ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
        }
      }
    } else if (type === 'music') {
      /* 五线谱：每 gap 一组，一组 5 条线 */
      const groupGap = gap * 3.2;
      for (let top = gap; top < h / s; top += groupGap) {
        for (let i = 0; i < 5; i++) {
          const y = top + i * (gap / 3.4);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w / s, y); ctx.stroke();
        }
      }
    } else if (type === 'news') {
      /* 报纸：页眉粗线 + 分栏细线 */
      const m = 26;
      ctx.save();
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(m, m); ctx.lineTo(w / s - m, m); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m, m + 7); ctx.lineTo(w / s - m, m + 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m, m + 46); ctx.lineTo(w / s - m, m + 46); ctx.stroke();
      /* 分栏线 */
      const cols = 4;
      ctx.strokeStyle = 'rgba(60,55,48,.26)';
      for (let i = 1; i < cols; i++) {
        const x = m + ((w / s - m * 2) / cols) * i;
        ctx.beginPath(); ctx.moveTo(x, m + 54); ctx.lineTo(x, h / s - m); ctx.stroke();
      }
      /* 文字灰条：模仿远处看不清的正文 */
      ctx.fillStyle = 'rgba(60,55,48,.13)';
      const colW = (w / s - m * 2) / cols - 10;
      for (let c = 0; c < cols; c++) {
        const x0 = m + ((w / s - m * 2) / cols) * c;
        for (let y = m + 56; y < h / s - m - 4; y += 11) {
          const wl = colW * (0.72 + ((c * 7 + y) % 5) * 0.05);
          ctx.fillRect(x0, y, wl, 3.4);
        }
      }
      ctx.restore();
    } else if (type === 'exam') {
      const m = 24;
      /* 装订孔 */
      ctx.save();
      ctx.fillStyle = 'rgba(70,70,80,.22)';
      for (let y = m + 30; y < h / s - m; y += 46) {
        ctx.beginPath(); ctx.arc(m, y, 4.2, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
      /* 密封线 */
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(m + 26, m); ctx.lineTo(m + 26, h / s - m); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(m + 16, h / s / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('密 封 线 内 不 要 答 题', 0, 0);
      ctx.restore();
      /* 题号与答题横线 */
      ctx.save();
      ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
      const left = m + 44;
      let no = 1;
      for (let y = m + 34; y < h / s - m; y += 78) {
        ctx.fillText(no + '.', left, y - 8);
        ctx.beginPath();
        ctx.moveTo(left + 22, y - 12); ctx.lineTo(w / s - m, y - 12);
        ctx.stroke();
        no++;
      }
      ctx.restore();
    } else if (type === 'calendar') {
      const gapY = gap;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w / s, h / s);
      ctx.clip();
      for (let y = 0; y <= h / s; y += gapY) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w / s, y); ctx.stroke();
      }
      for (let x = 0; x <= w / s; x += gapY) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h / s); ctx.stroke();
      }
      /* 每格左上角一个日期数字 */
      ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = 'rgba(160,60,55,.55)';
      let d = 1;
      for (let y = 0; y + gapY <= h / s; y += gapY) {
        for (let x = 0; x + gapY <= w / s; x += gapY) {
          ctx.fillText(String(d), x + 6, y + 16);
          d = d % 31 + 1;
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /* ========================= 4. 导出 ========================= */

  window.PaperLab = {
    TEXTURE_LIST,
    BG_TEMPLATES,
    TPL_MAP,
    makeTexture,
    textureUrl,
    paintTexture,
    drawLines,
    makeNoise,
    fbm,
    mulberry32,
    clamp,
    round2
  };
})();
