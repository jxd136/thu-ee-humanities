/**
 * 打包：把 src/index.html + styles.css + script.js 合成一个自包含的单文件 HTML。
 * 用法： node tools/build.js
 * 产物： build/人文组-拼贴诗工作台.html  和  build/index.html
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'build');
const OUT_NAME = '人文组-拼贴诗工作台.html';

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function main() {
  let html = read(path.join(srcDir, 'index.html'));
  const css = read(path.join(srcDir, 'styles.css'));
  /* 多个脚本按顺序拼接（paper.js 必须排在 script.js 之前） */
  const jsFiles = ['paper.js', 'corpus.js', 'script.js'];
  const js = jsFiles.map((f) => '/* ==== ' + f + ' ==== */\n' + read(path.join(srcDir, f))).join('\n\n');

  if (/<\/script>/i.test(js)) {
    throw new Error('脚本里出现了 </script>，会截断内联脚本');
  }

  const before = html.length;

  html = html.replace(
    /<link rel="stylesheet" href="src\/styles\.css">/,
    () => '<style>\n' + css + '\n</style>'
  );

  html = html.replace(
    /<script src="src\/script\.js"><\/script>/,
    () => '<script>\n' + js + '\n</script>'
  );

  if (html.indexOf('src/styles.css') >= 0 || html.indexOf('src/script.js') >= 0) {
    throw new Error('内联失败：仍有外部引用残留');
  }
  if (html.length <= before) {
    throw new Error('内联失败：产物没有变大，检查 index.html 里的 link/script 标签');
  }

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, OUT_NAME);
  fs.writeFileSync(outPath, html, 'utf8');
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');

  /* 项目根目录也放一份，方便直接取用（BBS 上只发这一个文件就够） */
  const rootCopy = path.join(root, '人文组.html');
  fs.writeFileSync(rootCopy, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log('✔ 已生成 ' + path.relative(root, outPath) + '  (' + kb + ' KB)');
  console.log('✔ 已同步 ' + path.relative(root, rootCopy));
  console.log('  css ' + (Buffer.byteLength(css, 'utf8') / 1024).toFixed(1) + ' KB · js ' +
    (Buffer.byteLength(js, 'utf8') / 1024).toFixed(1) + ' KB');
}

main();
