/* 成品结构自检：确认四个列表、语料池、生成函数都进了单文件产物
   用法： node test/bundle-check.js */
'use strict';
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', '人文组.html');
const t = fs.readFileSync(file, 'utf8');

const checks = [
  ['四列表容器 #wmPanels', 'id="wmPanels"'],
  ['短语列表分组', "key: 'phrase'"],
  ['句子列表分组', "key: 'sentence'"],
  ['词汇列表分组', "key: 'vocab'"],
  ['自定义列表分组', "key: 'custom'"],
  ['子分类芯片渲染', 'wm__chips'],
  ['全选 / 全不选', 'wmSetAll'],
  ['句子池：论述整句', "id: 'senFrame'"],
  ['句子池：见闻陈述', "id: 'senSeen'"],
  ['句子池：抽象长句', "id: 'senAbstract'"],
  ['句子池：诗性句', "id: 'senPoetic'"],
  ['句子池：短句断句', "id: 'senShort'"],
  ['句子池：名句成句', "id: 'senQuote'"],
  ['词汇池：论述术语', "id: 'vocTerm'"],
  ['词汇池：意象词', "id: 'vocImage'"],
  ['句子生成器 makeSentence', 'function makeSentence'],
  ['随机拼诗跨列表取词', 'pickers.push'],
  ['自定义按空格拆词', 'customSplit'],
  ['纸纹自标定', 'hSd'],
  ['背景模板', 'BG_TEMPLATES'],
  ['质感预设', 'FX_PRESETS'],
  ['墨迹高光层', 'piece__ink-hi'],
  ['剪字抠图', 'estimateBg'],
  ['导出纹理绘制', 'paintTexture'],
  ['无外部依赖(无 http 引用)', null]
];

let bad = 0;
console.log('产物: ' + path.relative(path.resolve(__dirname, '..'), file) +
  '  (' + (Buffer.byteLength(t, 'utf8') / 1024).toFixed(1) + ' KB)\n');

const external = (t.match(/(src|href)="https?:\/\//g) || []).length;
checks.forEach(([name, needle]) => {
  let ok;
  if (needle === null) ok = external === 0;
  else ok = t.indexOf(needle) >= 0;
  if (!ok) bad++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + name + (needle === null ? ('（外链 ' + external + ' 个）') : ''));
});

/* 顺手统计一下语料规模 */
const Q = (t.match(/\{ t: '/g) || []).length;
console.log('\n  名句条目约 ' + Q + ' 条');
console.log(bad ? ('\n有 ' + bad + ' 项缺失 ✘') : '\n全部就位 ✔');
process.exit(bad ? 1 : 0);
