/*
  markup.js ＝ データの中の「中国語の書き方」を解釈する
     {漢字|ピンイン}          → 漢字の下にピンイン        例：{了|le}
     {漢字|ピンイン|実際の発音} → 声調が変わる字（点線）    例：{我|Wǒ|Wó}
     [文字]                  → 問題の空欄や記号          例：[（　）]  [A]
     **文字**                → 太字
*/

// データの中の < > & などを、ただの文字として扱う（データにHTMLが紛れ込んでも、画面が壊れないように）
function escapeHTML(text) {
  return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 書き方 → 画面に出すHTML（md は markup の略）
function md(src) {
  let s = escapeHTML(src || '');
  // 単語どうしの間の空白は消す。コピーしたとき漢字がつながって取れるように（見た目の間隔は CSS で付ける）
  s = s.replace(/([}\]])\s+(?=[{\[])/g, '$1');
  s = s.replace(/\{([^{}|]+)\|([^{}|]+)(?:\|([^{}|]+))?\}/g, function (all, hanzi, pinyin, actual) {
    const sandhi = actual ? ` class="sandhi" data-actual="${actual}"` : '';
    return `<ruby lang="zh-CN"${sandhi}>${hanzi}<rt>${pinyin}</rt></ruby>`;
  });
  s = s.replace(/\[([^\]]+)\]/g, '<span class="slot">$1</span>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  return s;
}

// 書き方 → 漢字だけの文（読み上げ・回答の表示用）
function plain(src) {
  return String(src || '')
    .replace(/\{([^{}|]+)\|[^{}]*\}/g, '$1')   // {漢字|…} → 漢字
    .replace(/\[[^\]]*\]/g, '')                 // 空欄は読まない
    .replace(/\*\*/g, '')
    .replace(/^[*?]/, '')                       // 誤用例の * や ? は読まない
    .replace(/\s+/g, '');
}

// 選択肢の「文字」：中国語・日本語・ただの文字のどれか
function optionText(o) { return o.zh || o.text || o.ja || ''; }
