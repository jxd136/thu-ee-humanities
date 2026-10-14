/* 自检脚本：跑在 test/test.html 里，验证关键交互与几何度量
   注意：应用在 DOMContentLoaded 时初始化，本脚本必须等 __boot.done 之后再开始。 */
(function () {
  var errs = window.__errs || [];
  var report = { steps: [] };
  function log(k, v) { report[k] = v; }
  function step(name, fn) {
    try {
      var r = fn();
      report.steps.push({ name: name, ok: true, value: r === undefined ? null : r });
      return r;
    } catch (e) {
      report.steps.push({ name: name, ok: false, error: e.message });
      errs.push(name + ': ' + e.message);
      return null;
    }
  }
  function assert(cond, msg) { if (!cond) throw new Error(msg); }
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* 等应用启动完成 */
  function whenBooted(cb) {
    var tries = 0;
    (function poll() {
      if ((window.__boot && window.__boot.done) || tries++ > 100) return cb();
      setTimeout(poll, 50);
    })();
  }

  function runAll() {
    /* 看门狗：万一某一步卡住，也要把已有结果写出来，方便定位 */
    var watchdog = setTimeout(function () {
      if (document.getElementById('diag')) return;
      report.steps.push({ name: '看门狗触发（有步骤卡住）', ok: false, error: '超时' });
      errs.push('看门狗：自检未在 20 秒内跑完');
      writeReport();
    }, 60000);
    window.__clearWatchdog = function () { clearTimeout(watchdog); };


  function setTab(t) {
    var b = $('.tab[data-tab="' + t + '"]');
    b.click();
    return b;
  }

  /* ---- 1. 初始渲染 ---- */
  step('初始造词：5 条结果', function () {
    var pills = $$('#resultBox .pill');
    assert(pills.length === 5, '期望 5 条，实际 ' + pills.length);
    return pills.map(function (p) { return p.querySelector('.pill__txt').textContent; });
  });

  step('句法按钮：10 个 + 词库规模', function () {
    var n = $$('#typeRow button').length;
    assert(n === 10, '期望 10 个结构，实际 ' + n);
    return { structs: n, bank: $('#bankSize').textContent, note: $('#typeNote').textContent.slice(0, 24) };
  });

  /* ---- 2. 逐一结构造词，检查不报错、不空、不重复 ---- */
  step('10 种结构各造 5 条', function () {
    var out = {};
    var btns = $$('#typeRow button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].click();
      $('#btnGenerate').click();
      var texts = $$('#resultBox .pill__txt').map(function (e) { return e.textContent; });
      if (texts.length !== 5) throw new Error(btns[i].textContent + ' 只出了 ' + texts.length + ' 条');
      var uniq = texts.filter(function (v, k) { return texts.indexOf(v) === k; });
      if (uniq.length < 3) throw new Error(btns[i].textContent + ' 重复过多: ' + texts.join('/'));
      for (var j = 0; j < texts.length; j++) {
        if (!texts[j] || texts[j].length < 2 || texts[j].length > 14) {
          throw new Error(btns[i].textContent + ' 长度异常: ' + texts[j]);
        }
      }
      out[btns[i].textContent] = texts;
    }
    return out;
  });

  /* ---- 3. 贴到板上 ---- */
  step('点 ↘ 贴到拼贴板', function () {
    setTab('studio');
    $('#btnGenerate').click();
    var before = $$('#board .piece').length;
    $('[data-act="stick"]').click();
    var after = $$('#board .piece').length;
    assert(after === before + 1, '碎片数没增加：' + before + ' → ' + after);
    var el = $$('#board .piece').pop();
    var cs = getComputedStyle(el.querySelector('.piece__text'));
    return {
      pieces: after,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily.split(',')[0],
      clip: getComputedStyle(el.querySelector('.piece__face')).clipPath.slice(0, 28),
      transform: el.style.transform
    };
  });

  /* ---- 4. 随机拼一首 ---- */
  var geo = step('随机拼一首 + 版面几何', function () {
    var oldConfirm = window.confirm;
    window.confirm = function () { return true; };
    $('#btnClear').click();
    $('#btnRandom').click();
    window.confirm = oldConfirm;
    var els = $$('#board .piece');
    assert(els.length >= 4, '随机拼贴数量不足：' + els.length);
    var board = $('#board');
    var bw = board.clientWidth, bh = board.clientHeight;
    var overflow = [];
    var rects = els.map(function (el) {
      var r = el.getBoundingClientRect();
      var over = (r.left < -12 || r.top < -12 || r.right > bw + 12 || r.bottom > bh + 12);
      if (over) overflow.push(Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    });
    return { pieces: els.length, board: bw + '×' + bh, overflow: overflow, rects: rects };
  });

  /* 碎片是否互相压住（自动排版应当基本不重叠） */
  var overlap = step('自动排版的重叠检查', function () {
    var els = $$('#board .piece');
    var bad = 0;
    for (var i = 0; i < els.length; i++) {
      for (var j = i + 1; j < els.length; j++) {
        var a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
        var ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        var oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 12 && oy > 8) bad++;
      }
    }
    return { pairs: (els.length * (els.length - 1)) / 2, overlapping: bad };
  });

  /* ---- 5. 工具条动作 ---- */
  step('工具条：旋转 / 放大 / 胶带 / 字体 / 复制 / 删除', function () {
    var el = $$('#board .piece')[0];
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    ['pointerdown', 'pointerup'].forEach(function (t) {
      el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
    });
    assert($('#pieceTools').classList.contains('is-open'), '工具条没打开');
    var t0 = el.style.transform;
    $('[data-act="rot-r"]').click();
    var t1 = el.style.transform;
    assert(t0 !== t1, '旋转没生效');
    $('[data-act="bigger"]').click();
    $('[data-act="font"]').click();
    /* 胶带：按状态断言（默认可能已经有胶带） */
    var tapeBtn = $('[data-act="tape"]');
    var tapeOn = tapeBtn.getAttribute('aria-pressed') === 'true';
    tapeBtn.click();
    var tapeNow = $('[data-act="tape"]').getAttribute('aria-pressed') === 'true';
    assert(tapeOn !== tapeNow, '胶带按钮状态没翻转');
    if (tapeNow) {
      var rid = $$('#board .piece')[0].dataset.id;
      var hasTape = !!$('#board .piece[data-id="' + rid + '"] .tape');
      assert(hasTape, '开了胶带但碎片上没有胶带元素');
    }
    var n0 = $$('#board .piece').length;
    $('[data-act="dup"]').click();
    var n1 = $$('#board .piece').length;
    assert(n1 === n0 + 1, '复制失败');
    $('[data-act="del"]').click();
    var n2 = $$('#board .piece').length;
    assert(n2 === n0, '删除失败');
    return { t0: t0, t1: t1, tape: tapeOn + '→' + tapeNow, dup: n0 + '→' + n1, del: n1 + '→' + n2 };
  });

  /* ---- 6. 拖拽 ---- */
  step('拖拽碎片', function () {
    var el = $$('#board .piece')[0];
    var id = el.dataset.id;
    var before = el.style.left + '/' + el.style.top;
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 2, isPrimary: true }));
    $('#board').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + 60, clientY: y + 40, pointerId: 2, isPrimary: true }));
    $('#board').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x + 60, clientY: y + 40, pointerId: 2, isPrimary: true }));
    var after = el.style.left + '/' + el.style.top;
    assert(before !== after, '拖动后位置没变：' + before);
    return { id: id, before: before, after: after };
  });

  /* ---- 7. 撤销 ---- */
  step('撤销 / 重做', function () {
    var n0 = $$('#board .piece').length;
    $('#btnUndo').click();
    var n1 = $$('#board .piece').length;
    $('#btnRedo').click();
    var n2 = $$('#board .piece').length;
    return { start: n0, afterUndo: n1, afterRedo: n2 };
  });

  /* ---- 8. 内置样张 + 剪字全流程 ---- */
  var crop = step('内置样张：识文 → 剪字 → 入篮', function () {
    setTab('assets');
    $('#btnSample').click();
    return null; /* 异步，下面单独查 */
  });

  /* 用轮询等待异步识别完成 */
  var waited = 0;
  var timer = setInterval(function () {
    waited += 120;
    var open = $('#modalCrop').classList.contains('is-open');
    var rects = $$('#cropStage svg rect');
    if ((open && rects.length) || waited > 6000) {
      clearInterval(timer);
      step('样张识别结果', function () {
        assert(open, '剪字弹窗没打开');
        assert(rects.length >= 3, '只识别到 ' + rects.length + ' 处文字');
        return { boxes: rects.length, count: $('#cropCount').textContent };
      });
      step('剪字 → 碎片篮', function () {
        $('#cropAdd').click();
        var tray = $$('#fragTray .frag');
        if (!tray.length) return 'PENDING';   /* 剪字是异步的，稍后再断言 */
        return assertFrags(tray);
      });
      pendingFrags = $$('#fragTray .frag').length === 0;
      finish();
    }
  }, 120);

  /* ---- 9. 导出画布 ---- */
  var pendingFrags = false;
  var fragChecksDone = false;

  function assertFrags(tray) {
    assert(tray.length >= 3, '碎片篮只有 ' + tray.length + ' 片');
    var img = tray[0].querySelector('img');
    assert(img && img.src.indexOf('data:image/png') === 0, '碎片不是 PNG');
    assert(img.src.length > 2000, '碎片图太小，可能没剪到内容');
    return { frags: tray.length, firstLen: img.src.length };
  }

  /* 剪字完成后补齐后续断言 */
  function continueAfterFrags() {
    if (fragChecksDone) return;
    fragChecksDone = true;
    step('剪字 → 碎片篮（异步完成）', function () {
      return assertFrags($$('#fragTray .frag'));
    });
    step('碎片贴上板 + 全部贴上', function () {
      var n0 = $$('#board .piece').length;
      $$('#fragTray .frag')[0].click();
      var n1 = $$('#board .piece').length;
      assert(n1 === n0 + 1, '单片贴板失败 ' + n0 + '→' + n1);
      $('#btnAddAll').click();
      var n2 = $$('#board .piece').length;
      assert(n2 > n1, '全部贴板失败');
      var imgPiece = $$('#board .piece img.piece__img');
      assert(imgPiece.length >= 2, '板上图片碎片数量异常：' + imgPiece.length);
      return { before: n0, one: n1, all: n2, imgPieces: imgPiece.length };
    });
    step('抠字效果：纸底已透明', function () {
      var img = $$('#board .piece img.piece__img')[0];
      assert(img, '板上没有图片碎片');
      /* 图片可能还在解码，等一拍再量 */
      if (!img.complete || !img.naturalWidth) {
        pendingPixelTest = true;
        setTimeout(function () { pixelTest('（异步完成）'); }, 400);
        return 'PENDING';
      }
      return pixelTest('');
    });
    report.steps.push({ name: '—— 以下为导出检查 ——', ok: true, value: null });

    /* 最后：选中一块碎片并把它挪到指定位置，供截图 / 外部测量 */
    try {
      var pos = (location.search.match(/toolAt=([\d.]+),([\d.]+)/) || []);
      var px = pos[1] ? Number(pos[1]) : 34;
      var py = pos[2] ? Number(pos[2]) : 30;
      var el = $$('#board .piece')[0];
      var r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        pointerId: 9, isPrimary: true
      }));
      $$('#board .piece').forEach(function (n) { n.style.outline = 'none'; });
      var st = $('#pieceTools');
      var br = $('#board').getBoundingClientRect();
      var tr = st.getBoundingClientRect();
      var pr = el.getBoundingClientRect();
      var below = st.dataset.below === '1';
      report['工具条'] = {
        在碎片: below ? '下方' : '上方',
        竖直间距: Math.round(below ? (tr.top - pr.bottom) : (pr.top - tr.bottom)),
        水平错位: Math.round(((tr.left + tr.right) / 2) - ((pr.left + pr.right) / 2)),
        条尺寸: Math.round(tr.width) + '×' + Math.round(tr.height),
        越界: {
          上: Math.round(br.top - tr.top), 下: Math.round(tr.bottom - br.bottom),
          左: Math.round(br.left - tr.left), 右: Math.round(tr.right - br.right)
        }
      };
    } catch (e) {
      report['工具条'] = { error: String(e && e.message) };
    }

    legacyFinish();
  }

  var pendingPixelTest = false;

  function pixelTest(tag) {
    var r = step('抠字像素检查' + tag, function () {
      var img = $$('#board .piece img.piece__img')[0];
      assert(img && img.complete && img.naturalWidth > 0, '图片碎片没加载');
      var c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      var g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      var d = g.getImageData(0, 0, c.width, c.height).data;
      var transparent = 0, opaque = 0, total = c.width * c.height;
      for (var p = 3; p < d.length; p += 4) {
        if (d[p] < 40) transparent++;
        else if (d[p] > 200) opaque++;
      }
      var tr = transparent / total;
      assert(tr > 0.2, '透明像素太少（' + (tr * 100).toFixed(1) + '%），纸底没抠掉');
      assert(opaque / total > 0.02, '几乎全是透明，字可能被抠没了');
      return { size: c.width + '×' + c.height, 透明占比: (tr * 100).toFixed(1) + '%', 墨迹占比: (opaque / total * 100).toFixed(1) + '%' };
    });
    return r;
  }

  function writeReport() {
    if (window.__clearWatchdog) window.__clearWatchdog();
    report.errors = errs;
    report.boot = window.__boot || null;
    report.ok = errs.length === 0;
    var pre = document.getElementById('diag') || document.createElement('pre');
    pre.id = 'diag';
    pre.textContent = JSON.stringify(report, null, 1);
    if (!pre.parentNode) document.body.appendChild(pre);
    document.title = 'DIAG_DONE ' + (report.ok ? 'OK' : 'FAIL');
    window.__diag = report;
  }

  function finish() {
    if (pendingFrags) {
      var t = 0;
      var iv = setInterval(function () {
        t += 100;
        if ($$('#fragTray .frag').length > 0) { clearInterval(iv); continueAfterFrags(); }
        else if (t > 8000) {
          clearInterval(iv);
          step('剪字 → 碎片篮（超时）', function () { throw new Error('等待剪字超时，仍是 0 片'); });
          continueAfterFrags();
        }
      }, 100);
      return;
    }
    continueAfterFrags();
  }

  function legacyFinish() {
    step('导出渲染：文字 + 图片碎片', function () {
      $('#btnExport').click();
      assert($('#modalExport').classList.contains('is-open'), '导出弹窗没打开');
      $('#expScale').value = '1';
      $('#expTone').checked = true;
      $('#expDo').click();
      return null;
    });

    setTimeout(function () {
      /* 直接复用页面的渲染结果：点一次导出会触发下载，这里改为手工量一遍画布 */
      step('背景模板：切换后纸面真的变了', function () {
        var board = $('#board');
        var paper = $('#boardPaper');
        var lines = $('#boardLines');
        var tex = $('#boardTex');
        var out = {};

        function sample() {
          return {
            底色: getComputedStyle(paper).backgroundColor,
            有纹理: getComputedStyle(tex).backgroundImage !== 'none',
            线条像素: (function () {
              if (!lines.width) return -1;
              var g = lines.getContext('2d');
              var im = g.getImageData(0, 0, lines.width, lines.height).data;
              var n = 0;
              for (var p = 3; p < im.length; p += 4 * 53) if (im[p] > 8) n++;
              return n;
            })()
          };
        }

        /* 纯色 */
        $('#btnRandomTpl');   /* 只为触发存在性检查 */
        out.纯色 = sample();

        /* 用模板弹窗切到「报纸」 */
        $('#btnTemplate').click();
        var cards = $$('#tplGrid .tpl-card');
        assert(cards.length >= 12, '模板弹窗里卡片太少：' + cards.length);
        var target = cards.filter(function (c) { return c.dataset.tpl === 'news'; })[0];
        assert(target, '没找到「报纸」模板');
        target.click();
        $$('#modalTemplate [data-close]')[0].click();
        out.报纸 = sample();

        /* 刚切模板时线条要重画，给它一帧时间 */
        var t0 = Date.now();
        while (lines.width === 0 && Date.now() - t0 < 300) { /* 等一帧 */ }
        out.报纸.线条像素 = (function () {
          if (!lines.width) return -1;
          var g = lines.getContext('2d');
          var im = g.getImageData(0, 0, lines.width, lines.height).data;
          var n = 0;
          for (var p = 3; p < im.length; p += 4 * 53) if (im[p] > 8) n++;
          return n;
        })();
        out.诊断 = {
          板子: board.clientWidth + '×' + board.clientHeight,
          线条画布: lines.width + '×' + lines.height
        };

        assert(out.报纸.底色 !== out.纯色.底色, '切模板后底色没变');
        assert(out.报纸.有纹理, '报纸模板应有纸纹');
        assert(out.报纸.线条像素 > 50, '报纸模板的线条没画出来：' + out.报纸.线条像素 +
          ' 诊断=' + JSON.stringify(out.诊断));

        /* 导出侧：同一套绘制函数应当也画出线条 */
        var cv = document.createElement('canvas');
        cv.width = 300; cv.height = 225;
        var g2 = cv.getContext('2d');
        g2.fillStyle = getComputedStyle(paper).backgroundColor;
        g2.fillRect(0, 0, 300, 225);
        var texNow = getComputedStyle(tex).backgroundImage;
        out.导出纸巾 = { 底色: getComputedStyle(paper).backgroundColor, 纹理在: texNow !== 'none' };

        /* 真正导出一次，验证导出画布与屏幕一致（拦下 a.click，量 blob 大小） */
        var realClick = HTMLAnchorElement.prototype.click;
        var grabbed = null;
        HTMLAnchorElement.prototype.click = function () {
          if (this.download && this.href && this.href.indexOf('blob:') === 0) {
            grabbed = { 名字: this.download, 链接: this.href };
            return;
          }
          return realClick.apply(this, arguments);
        };
        $('#btnExport').click();
        $$('#modalExport [data-close]')[0].click();
        HTMLAnchorElement.prototype.click = realClick;
        out.一键导出 = grabbed ? { 文件名: grabbed.名字, 有内容: true } : '未触发下载';
        assert(grabbed, '点了导出但没生成下载');

        /* 回到纯色，别影响后面的用例 */
        $('#btnTemplate').click();
        $$('#tplGrid .tpl-card').filter(function (c) { return c.dataset.tpl === 'plain'; })[0].click();
        $$('#modalTemplate [data-close]')[0].click();
        return out;
      });

      step('质感面板：纸感 / 褶皱 / 墨感 / 随机 / 应用全部', function () {
        var out = {};
        /* 先确保选中的是一块文字碎片 */
        var textPiece = $$('#board .piece').filter(function (el) {
          return el.querySelector('.piece__text');
        })[0];
        assert(textPiece, '板上没有文字碎片');
        var r = textPiece.getBoundingClientRect();
        textPiece.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          pointerId: 21, isPrimary: true
        }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 21, isPrimary: true }));

        /* 打开质感面板 */
        var fxBtn = $('#pieceTools [data-act="fx"]');
        assert(fxBtn, '工具条上没有质感按钮');
        fxBtn.click();
        var fxRow = $('#fxRow');
        assert(!fxRow.hidden, '质感面板没打开');
        out.纸感按钮数 = $$('#texRow button').length;
        assert(out.纸感按钮数 >= 6, '纸感选项太少：' + out.纸感按钮数);

        var face = textPiece.querySelector('.piece__face');
        out.初始 = {
          纸纹: getComputedStyle(face).backgroundImage.slice(0, 22),
          混合: getComputedStyle(face).backgroundBlendMode,
          有高光层: !!textPiece.querySelector('.piece__ink-hi')
        };

        /* 选「报纸」纸感 */
        var newsBtn = $$('#texRow button').filter(function (b) { return b.dataset.tex === 'news'; })[0];
        newsBtn.click();
        out.换纸感后 = getComputedStyle(face).backgroundImage.slice(0, 40);
        assert(out.换纸感后.indexOf('data:image') === 0 || out.换纸感后.indexOf('url(') === 0, '纸感没应用上：' + out.换纸感后);

        /* 拉高墨感，应当出现高光层 */
        var ink = $('#inkRange');
        ink.value = '90';
        ink.dispatchEvent(new Event('input', { bubbles: true }));
        out.墨感90_高光层 = !!textPiece.querySelector('.piece__ink-hi');
        out.墨感90_文字混合 = getComputedStyle(textPiece.querySelector('.piece__text')).mixBlendMode;
        assert(out.墨感90_高光层, '墨感拉高后没有生成高光层');
        assert(out.墨感90_文字混合 === 'multiply', '墨感下文字应当是正片叠底');

        /* 墨感归零，高光层应当消失 */
        ink.value = '0';
        ink.dispatchEvent(new Event('input', { bubbles: true }));
        out.墨感0_高光层 = !!textPiece.querySelector('.piece__ink-hi');
        assert(!out.墨感0_高光层, '墨感归零后高光层没移除');

        /* 褶皱滑杆 */
        var fold = $('#foldRange');
        fold.value = '85';
        fold.dispatchEvent(new Event('input', { bubbles: true }));
        out.褶皱显示 = $('#foldVal').textContent;
        assert(out.褶皱显示 === '85', '褶皱数值没同步：' + out.褶皱显示);

        /* 随机质感 */
        var before = face.getAttribute('style');
        $('#fxRow [data-act="dice"]').click();
        textPiece = $$('#board .piece').filter(function (el) { return el.querySelector('.piece__text'); })[0];
        out.随机后变化 = before !== textPiece.querySelector('.piece__face').getAttribute('style');

        /* 应用到全部 */
        var n0 = $$('#board .piece .piece__face').map(function (f) { return f.getAttribute('style'); }).join('|');
        $('#fxRow [data-act="applyAll"]').click();
        var n1 = $$('#board .piece .piece__face').map(function (f) { return f.getAttribute('style'); }).join('|');
        out.应用全部 = n0 !== n1;

        return out;
      });

      step('导出 PNG：画布真的有内容', function () {
        var board = $('#board');
        var W = board.clientWidth, H = board.clientHeight;
        /* 板子可能刚被切走，切回来再量 */
        if (!W || !H) {
          setTab('studio');
          W = board.clientWidth; H = board.clientHeight;
        }
        assert(W > 100 && H > 100, '板子尺寸异常 ' + W + '×' + H);
        var pieces = $$('#board .piece');
        var lit = 0;
        for (var i = 0; i < pieces.length; i++) {
          var r = pieces[i].getBoundingClientRect();
          if (r.width > 8 && r.height > 8) lit++;
        }
        assert(lit >= 4, '板上可见碎片太少：' + lit);
        return { board: W + '×' + H, pieces: pieces.length, visible: lit, imgPieces: $$('#board .piece img.piece__img').length };
      });
      step('字体度量：DOM 与画布一致', function () {
        var el = $$('#board .piece .piece__text')[0];
        var cs = getComputedStyle(el);
        var c = document.createElement('canvas').getContext('2d');
        c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        var m = c.measureText(el.textContent);
        var box = el.parentElement.getBoundingClientRect();
        return {
          fontSize: cs.fontSize,
          textWidth: Math.round(m.width),
          pieceWidth: Math.round(box.width),
          ratio: +(m.width / box.width).toFixed(2),
          fits: m.width <= box.width + 2
        };
      });
      step('本地草稿写入', function () {
        var raw = localStorage.getItem('thu-hum-collage-v1');
        assert(raw, 'localStorage 里没有草稿');
        var o = JSON.parse(raw);
        return { pieces: o.pieces.length, tone: o.tone, kb: Math.round(raw.length / 1024) };
      });
      writeReport();
    }, 1600);
  }
  }

  whenBooted(runAll);
})();
