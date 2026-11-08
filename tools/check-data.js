/*
  データのチェック用プログラム
  使い方：  node tools/check-data.js
  data/items/ の中の JSON ファイルを1つずつ開き、次のことを確かめる。
    ・JSON の書き方として正しいか（誤りがあれば何行目かを示す）
    ・必要な項目がそろっているか
    ・{漢字|ピンイン} の書き方が崩れていないか（全角の ｛ ｝ ｜ が混ざっていないか、など）
    ・問題の正解の番号が、選択肢の範囲に入っているか
  誤りが1つでもあれば、最後に「✗」と件数を出して終わる（pushの前に必ず通す）。
*/
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'items');
const BLOCK_FIELDS = {
  map: ['title', 'cells'],
  text: ['title', 'body'],
  pattern: ['title', 'ja', 'en', 'zh'],
  panel: ['title', 'body'],
  compare: ['title', 'cards'],
  debate: ['title', 'body']
};

let errors = 0;
let warnings = 0;
function error(file, where, msg) { errors++; console.log(`  ✗ ${where}：${msg}`); }
function warn(file, where, msg) { warnings++; console.log(`  △ ${where}：${msg}`); }

// {漢字|ピンイン} の書き方を確かめる
function checkMarkup(file, where, text) {
  if (typeof text !== 'string') return;
  if (/[｛｝｜]/.test(text)) error(file, where, `全角の ｛ ｝ ｜ が混ざっています → 半角の { } | にしてください：「${text}」`);
  let depth = 0;
  for (const ch of text) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0 || depth > 1) { error(file, where, `{ } の対応が崩れています：「${text}」`); return; }
  }
  if (depth !== 0) { error(file, where, `{ } の対応が崩れています：「${text}」`); return; }
  if ((text.match(/\[/g) || []).length !== (text.match(/\]/g) || []).length) error(file, where, `[ ] の対応が崩れています：「${text}」`);
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    const parts = m[1].split('|');
    if (parts.length < 2 || parts.length > 3 || parts.some(p => p.trim() === '')) {
      error(file, where, `{${m[1]}} は {漢字|ピンイン} か {漢字|ピンイン|実際の発音} の形にしてください`);
      continue;
    }
    const [hanzi, ...pinyins] = parts;
    if (!/[㐀-鿿]/.test(hanzi)) warn(file, where, `{${m[1]}} の1つ目に漢字がありません`);
    for (const p of pinyins) {
      if (/[぀-ヿ㐀-鿿]/.test(p)) error(file, where, `{${m[1]}} のピンインの部分に、かなや漢字が入っています`);
    }
  }
}

// 中身の文字列をすべて調べる（どこにあっても書き方が崩れていないか）
function walk(file, node, where) {
  if (typeof node === 'string') return checkMarkup(file, where, node);
  if (Array.isArray(node)) return node.forEach((v, i) => walk(file, v, `${where}[${i}]`));
  if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(file, v, where ? `${where}.${k}` : k);
}

function need(file, obj, where, fields) {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === '' || (Array.isArray(obj[f]) && obj[f].length === 0)) error(file, where, `「${f}」がありません`);
  }
}

function checkItem(file, item) {
  const id = path.basename(file, '.json');
  if (item.id !== id) error(file, 'id', `ファイル名（${id}）と id（${item.id}）が違います`);
  need(file, item, '項目', ['id', 'chapter', 'title', 'terms', 'lecture', 'examples']);
  if (item.chapter) need(file, item.chapter, 'chapter', ['no', 'ja']);
  if (item.title) need(file, item.title, 'title', ['ja', 'en']);

  const anchors = new Set(['lecture', 'examples']);
  (item.lecture || []).forEach((b, i) => {
    const where = `lecture[${i}]`;
    if (!BLOCK_FIELDS[b.type]) { error(file, where, `type「${b.type}」は使えません（使えるもの：${Object.keys(BLOCK_FIELDS).join('・')}）`); return; }
    need(file, b, `${where}（${b.type}）`, BLOCK_FIELDS[b.type]);
    if (b.id) anchors.add(b.id);
  });

  (item.examples || []).forEach((ex, i) => {
    const where = `examples[${i}]`;
    if (ex.kind === 'wrong' || ex.kind === 'odd') need(file, ex, where, ['zh', 'explain']);
    else if (ex.kind) error(file, where, `kind「${ex.kind}」は使えません（wrong か odd、ふつうの例文は書かない）`);
    else need(file, ex, where, ['zh', 'ja', 'en']);
  });

  (item.quiz || []).forEach((q, i) => {
    const where = `quiz[${i}]`;
    need(file, q, where, ['type', 'kind', 'promptJa', 'promptEn', 'correct', 'ja', 'en', 'why', 'lecture']);
    if (q.lecture && !anchors.has(q.lecture)) error(file, where, `lecture「${q.lecture}」に当たる講義のブロックがありません（ブロックに "id": "${q.lecture}" を付けてください）`);
    if (q.type === 'reorder') {
      need(file, q, where, ['tokens', 'answer']);
      const n = (q.tokens || []).length;
      const ok = Array.isArray(q.answer) && q.answer.length === n && [...q.answer].sort((a, b) => a - b).every((v, k) => v === k);
      if (!ok) error(file, where, `answer は 0〜${n - 1} を1回ずつ並べたものにしてください`);
    } else if (q.type === 'choice') {
      need(file, q, where, ['options']);
      const n = (q.options || []).length;
      if (!(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < n)) error(file, where, `answerIndex は 0〜${n - 1} のどれかにしてください（0 が1つ目）`);
    } else {
      error(file, where, `type「${q.type}」は使えません（reorder か choice）`);
    }
    if (q.checked !== true) warn(file, where, 'ネイティブ未確認');
  });

  walk(file, item, '');
}

// JSON の誤りが何行目かを調べる
function lineOf(text, e) {
  const m = /position (\d+)/.exec(e.message) || /line (\d+)/.exec(e.message);
  if (!m) return '';
  if (/line/.test(m[0])) return `${m[1]}行目付近：`;
  return `${text.slice(0, Number(m[1])).split('\n').length}行目付近：`;
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
for (const f of files) {
  const file = path.join(DIR, f);
  console.log(`■ data/items/${f}`);
  const text = fs.readFileSync(file, 'utf8');
  let item;
  try {
    item = JSON.parse(text);
  } catch (e) {
    error(f, 'JSON', `${lineOf(text, e)}JSON の書き方に誤りがあります（${e.message}）`);
    continue;
  }
  const before = errors;
  checkItem(f, item);
  if (errors === before) console.log('  ✓ 誤りなし');
}
console.log(`\n${errors ? '✗' : '✓'} 誤り ${errors} 件、注意 ${warnings} 件（${files.length} ファイル）`);
process.exit(errors ? 1 : 0);
