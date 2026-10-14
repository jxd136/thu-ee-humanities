/**
 * 造词引擎单测（Node 直接跑，不需要浏览器）
 * 用法： node test/engine-test.js [每个结构条数]
 * 做法：把 script.js 里「词库 → 造词引擎」这一段抠出来，用 new Function 执行。
 */
const fs = require('fs');
const path = require('path');

const srcPath = path.resolve(__dirname, '..', 'src', 'script.js');
const src = fs.readFileSync(srcPath, 'utf8');

/* 引擎区段：从词库定义一直到拼贴板模块之前，整段抠出来在 Node 里执行 */
const start = src.indexOf('/* ========================= 1. 词库');
const end = src.indexOf('/* ========================= 3. 拼贴板');
if (start < 0 || end < 0) throw new Error('找不到引擎区段，检查 script.js 结构');

/* 随机数工具在基础工具区段里，另行截取 */
const utilStart = src.indexOf('function mulberry32');
const utilEnd = src.indexOf('let toastTimer');
if (utilStart < 0 || utilEnd < 0) throw new Error('找不到随机数工具');

let code = src.slice(utilStart, utilEnd) + '\n' + src.slice(start, end);

const full = code + '\nreturn { tokenize, generatePhrase, BANK, STRUCTS, BANK_SIZE };';

const api = new Function(full)();

const N = Number(process.argv[2] || 8);

console.log('词库规模：' + api.BANK_SIZE + ' 个词 · 结构 ' + api.STRUCTS.length + ' 种\n');

console.log('=== 模板分词检查 ===');
const tpls = [
  '动词+时间', '动词+一场+名词', '动词+这个+名词', '量词+形容词+的+名词',
  '指示+量词+名词', 'X的+名词', '时间+的+形容词+名词', '代词+动词+了+名词',
  '动词+满+量词+名词', '名词+的+名词', '形容词+与+形容词', '动词+得+补语'
];
for (const t of tpls) {
  console.log(t.padEnd(20), JSON.stringify(api.tokenize(t)));
}

console.log('\n=== 每个结构 ' + N + ' 条 ===');
const all = [];
for (const s of api.STRUCTS) {
  const out = [];
  const seen = new Set();
  for (let k = 0; k < N; k++) {
    const t = api.generatePhrase(s.key, 'seed-' + s.key + '-' + k + '-' + Math.random()).text;
    out.push(t);
    seen.add(t);
    all.push(t);
  }
  console.log(s.name.padEnd(11), out.join(' / '));
  if (seen.size < N * 0.6) console.log('   ⚠ 重复率偏高：' + seen.size + '/' + N);
}

/* 体检：明显的坏味道 */
const LITERAL_LEAK = /(名词|形容词|动词|量词|指示|代词|补语|短语|X)/;
const OK_DOUBLE = /(轻轻|慢慢|常常|渐渐|悄悄|静静|刚刚|星星|点点|层层|片片|声声|夜夜|天天|年年)/g;
const BAD = [];
for (const t of all) {
  if (LITERAL_LEAK.test(t)) BAD.push('词类名泄漏: ' + t);
  const stripped = t.replace(OK_DOUBLE, '□□');
  if (/(和和|与与|的的|了了|着着|过过|在在)/.test(stripped)) BAD.push('叠字: ' + t);
  if (Array.from(t).length > 13) BAD.push('过长: ' + t);
  if ((t.match(/的/g) || []).length > 2) BAD.push('的过多: ' + t);
  if (/(和和|与与|的的|了了)/.test(t)) BAD.push('虚词重复: ' + t);
}
console.log('\n=== 体检（共 ' + all.length + ' 条）===');
if (!BAD.length) console.log('未发现明显问题 ✔');
else BAD.forEach((b) => console.log('  ✗ ' + b));
