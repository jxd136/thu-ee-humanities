/* 语料库单测： node test/corpus-test.js [条数] */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'corpus.js'), 'utf8');
const sandbox = {};
new Function('window', src)(sandbox);
const C = sandbox.Corpus;

const N = Number(process.argv[2] || 12);

console.log('名句 ' + C.QUOTES.length + ' 条 · 论述术语 ' + C.ESSAY.noun.length +
  ' 个 · 句首 ' + C.ESSAY.open.length + ' 套 · 论证 ' + C.ESSAY.arg.length +
  ' 套 · 结论 ' + C.ESSAY.close.length + ' 套\n');

console.log('=== 论述摘句生成 ' + N + ' 条 ===');
const bad = [];
const seen = new Set();
for (let i = 0; i < N; i++) {
  const s = C.makeEssay('seed-' + i + '-' + Math.random());
  seen.add(s);
  console.log('  ' + s);
  if (/(因此|所以)[，]?(因此|所以)/.test(s)) bad.push('连词叠用: ' + s);
  if (/(恰恰相反|换言之|正因如此|尽管如此|在此基础上)(?=[^\s，。、；：])/.test(s)) bad.push('连接词后缺标点: ' + s);
  if (/[，。、]{2,}/.test(s)) bad.push('标点重复: ' + s);
  if (/^\s*[，。]/.test(s) || /[，。]\s*$/.test(s)) bad.push('首尾标点: ' + s);
  if (s.length > 46) bad.push('过长(' + s.length + '): ' + s);
  if (/\{[XYZ]|PRED/.test(s)) bad.push('占位符没替换: ' + s);
  if (/(的的|了了|，，)/.test(s)) bad.push('叠字: ' + s);
}
console.log('\n重复: ' + (N - seen.size) + '/' + N);

console.log('=== 体检 ===');
if (!bad.length) console.log('未发现明显问题 ✔');
else bad.forEach((b) => console.log('  ✗ ' + b));

const qbad = [];
C.QUOTES.forEach((q) => {
  if (!q.t || !q.s) qbad.push('缺字段: ' + JSON.stringify(q));
  if (q.t.length > 30) qbad.push('过长: ' + q.t);
});
console.log('\n名句字段: ' + (qbad.length ? qbad.join('; ') : '全部合格 ✔'));
console.log('名句重复: ' + (C.QUOTES.length - new Set(C.QUOTES.map((q) => q.t)).size) + ' 条');
console.log('池子: ' + C.POOLS.map((p) => p.name + '(' + (p.items ? p.items.length : p.count) + ')').join(' / '));

/* 「句子」面板的各子类各抽几条看看 */
console.log('\n=== 句子面板各子类抽样 ===');
const kinds = ['frame', 'seen', 'abstract', 'poetic', 'shortcut', 'quote'];
kinds.forEach((k) => {
  const out = [];
  for (let i = 0; i < 3; i++) out.push(C.makeSentence(k, 't-' + k + '-' + i + Math.random()));
  const bad = out.filter((s) => !s || s.length > 46 || /\{[XYZ]|PRED/.test(s) || /[，。、；：]{2,}/.test(s));
  console.log('  ' + k.padEnd(9) + (bad.length ? '✗ ' : '✔ ') + out.join(' │ '));
});

/* 四个列表的分组是否齐全 */
console.log('\n=== 列表分组 ===');
['sentence', 'vocab'].forEach((g) => {
  const list = C.POOLS.filter((p) => p.group === g);
  console.log('  ' + g + ': ' + list.length + ' 个子分类 → ' + list.map((p) => p.name).join('、'));
});
const extras = C.POOLS.filter((p) => !p.group);
console.log('  未分组(归入句子/词汇): ' + extras.map((p) => p.name).join('、'));
