/*
  app.js ＝ 動き（押したら「何が起きるか」）

  このファイルの構成
    1. 問題データ      … 5問の中身（※フェーズ3で別ファイルに分離する予定）
    2. 小さな道具      … ルビを組み立てる、読み上げる、ボタンを作る、などの関数
    3. 画面の切り替え  … 項目ページと問題のどちらを見せるか
    4. 問題の表示と判定 … 1〜5を自由に行き来でき、解説は問題の下に開く
    5. クリックの受付  … どのボタンが押されたかを見て、仕事を振り分ける
*/

/* ============================================================
   1. 問題データ
   単語は { h: 漢字, p: ピンイン, s: 声調変化後の実際の発音（あれば） } で表す。
   句読点はただの文字列で書く。
   ============================================================ */

// 解説文の中に中国語を混ぜるための短い道具（r = ruby の頭文字）
function r(hanzi, pinyin) {
  return `<ruby lang="zh-CN">${hanzi}<rt>${pinyin}</rt></ruby>`;
}

const QUESTIONS = [
  {
    type: 'reorder',
    kind: '並べ替え',
    promptJa: '私は本を3冊買った。',
    promptEn: 'I bought three books.',
    tokens: [
      { h: '我', p: 'wǒ' }, { h: '买', p: 'mǎi' }, { h: '了', p: 'le' },
      { h: '三本', p: 'sān běn' }, { h: '书', p: 'shū' }
    ],
    // 正解の順番（tokens の番号で書く）
    answer: [0, 1, 2, 3, 4],
    correct: [{ h: '我', p: 'Wǒ', s: 'Wó' }, { h: '买了', p: 'mǎile' }, { h: '三', p: 'sān' }, { h: '本', p: 'běn' }, { h: '书', p: 'shū' }, '。'],
    ja: '私は本を3冊買った。',
    en: 'I bought three books.',
    why: `完了の${r('了', 'le')}は、動詞のすぐ後ろに置きます。数量（${r('三', 'sān')}${r('本', 'běn')}）や目的語（${r('书', 'shū')}）の後ろではありません。`,
    lecture: '#pattern'
  },
  {
    type: 'choice',
    kind: `${r('了', 'le')}は要る？`,
    promptJa: '私は昨日学校に行かなかった。',
    promptEn: "I didn't go to school yesterday.",
    sentence: [{ h: '我', p: 'Wǒ' }, { h: '昨天', p: 'zuótiān' }, { h: '没', p: 'méi' }, { h: '去', p: 'qù' }, { slot: '（　）' }, { h: '学校', p: 'xuéxiào' }, '。'],
    options: [{ html: `${r('了', 'le')}を入れる`, text: '了を入れる' }, { html: '入れない', text: '入れない' }],
    cols: 2,
    answerIndex: 1,
    correct: [{ h: '我', p: 'Wǒ' }, { h: '昨天', p: 'zuótiān' }, { h: '没', p: 'méi' }, { h: '去', p: 'qù' }, { h: '学校', p: 'xuéxiào' }, '。'],
    ja: '私は昨日学校に行かなかった。',
    en: "I didn't go to school yesterday.",
    why: `「${r('没', 'méi')}（${r('有', 'yǒu')}）＋動詞」で否定すると、完了の${r('了', 'le')}は消えます。実現しなかった動作には、「完了」を付けられないからです。`,
    lecture: '#negation'
  },
  {
    type: 'choice',
    kind: `${r('了', 'le')}の位置`,
    promptJa: '彼はコーヒーを2杯飲んだ。',
    promptEn: 'He drank two cups of coffee.',
    sentence: [{ h: '他', p: 'Tā' }, { slot: 'A' }, { h: '喝', p: 'hē' }, { slot: 'B' }, { h: '两', p: 'liǎng' }, { h: '杯', p: 'bēi' }, { slot: 'C' }, { h: '咖啡', p: 'kāfēi' }, { slot: 'D' }, '。'],
    options: [{ html: 'A', text: 'A' }, { html: 'B', text: 'B' }, { html: 'C', text: 'C' }, { html: 'D', text: 'D' }],
    cols: 4,
    answerIndex: 1,
    correct: [{ h: '他', p: 'Tā' }, { h: '喝了', p: 'hēle' }, { h: '两', p: 'liǎng' }, { h: '杯', p: 'bēi' }, { h: '咖啡', p: 'kāfēi' }, '。'],
    ja: '彼はコーヒーを2杯飲んだ。',
    en: 'He drank two cups of coffee.',
    why: `完了の${r('了', 'le')}は、動詞（${r('喝', 'hē')}）のすぐ後ろに置き、その後ろに数量（${r('两', 'liǎng')}${r('杯', 'bēi')}）と目的語（${r('咖啡', 'kāfēi')}）が続きます。文末（D）に置く${r('了', 'le')}は別の働きで、8-6で扱います。`,
    lecture: '#pattern'
  },
  {
    type: 'choice',
    kind: '自然な文はどれ',
    promptJa: '文として言い切るとき、自然なのはどちら？',
    promptEn: 'Which one sounds natural as a complete sentence?',
    options: [
      { zh: [{ h: '我', p: 'Wǒ' }, { h: '买了', p: 'mǎile' }, { h: '书', p: 'shū' }, '。'], ja: '私は本を買った。', en: 'I bought books.', text: '我买了书。' },
      { zh: [{ h: '我', p: 'Wǒ' }, { h: '买了', p: 'mǎile' }, { h: '一', p: 'yī' }, { h: '本', p: 'běn' }, { h: '书', p: 'shū' }, '。'], ja: '私は本を1冊買った。', en: 'I bought a book.', text: '我买了一本书。' }
    ],
    answerIndex: 1,
    correct: [{ h: '我', p: 'Wǒ', s: 'Wó' }, { h: '买了', p: 'mǎile' }, { h: '一', p: 'yī', s: 'yì' }, { h: '本', p: 'běn' }, { h: '书', p: 'shū' }, '。'],
    ja: '私は本を1冊買った。',
    en: 'I bought a book.',
    why: `目的語（${r('书', 'shū')}）に数量などが付いていないと、文が終わった感じがせず、続きが期待されます。${r('一', 'yī')}${r('本', 'běn')}のような数量を付けると、言い切りの文として自然になります。`,
    lecture: '#examples'
  },
  {
    type: 'choice',
    kind: '意味を選ぶ',
    promptJa: 'この文の意味は？',
    promptEn: 'What does this sentence mean?',
    sentence: [{ h: '我', p: 'Wǒ' }, { h: '明天', p: 'míngtiān' }, { h: '下了', p: 'xiàle' }, { h: '课', p: 'kè' }, { h: '就', p: 'jiù' }, { h: '去', p: 'qù' }, { h: '找', p: 'zhǎo', s: 'zháo' }, { h: '你', p: 'nǐ' }, '。'],
    options: [
      { ja: '明日授業が終わったら、あなたを訪ねます。', en: "I'll come see you after class tomorrow.", text: '明日授業が終わったら、あなたを訪ねます。' },
      { ja: '昨日授業が終わって、あなたを訪ねました。', en: 'I came to see you after class yesterday.', text: '昨日授業が終わって、あなたを訪ねました。' },
      { ja: '明日は授業がないので、あなたを訪ねます。', en: "There's no class tomorrow, so I'll come see you.", text: '明日は授業がないので、あなたを訪ねます。' }
    ],
    answerIndex: 0,
    correct: [{ h: '我', p: 'Wǒ' }, { h: '明天', p: 'míngtiān' }, { h: '下了', p: 'xiàle' }, { h: '课', p: 'kè' }, { h: '就', p: 'jiù' }, { h: '去', p: 'qù' }, { h: '找', p: 'zhǎo', s: 'zháo' }, { h: '你', p: 'nǐ' }, '。'],
    ja: '明日授業が終わったら、あなたを訪ねます。',
    en: "I'll come see you after class tomorrow.",
    why: `${r('了', 'le')}は「過去」ではなく「完了」を表します。ここでは「授業が終わったら（完了したら）」という未来の条件です。時を示しているのは${r('明天', 'míngtiān')}（明日）です。`,
    lecture: '#lecture'
  }
];

/* ============================================================
   2. 小さな道具（関数）
   ============================================================ */

// 単語の並びから、ルビ付きの中国語の文を組み立てる
function sentenceHTML(words) {
  return words.map(function (w) {
    if (typeof w === 'string') return w;                          // 句読点
    if (w.slot) return `<span class="slot">${w.slot}</span>`;     // 空欄・記号
    const sandhi = w.s ? ` class="sandhi" data-actual="${w.s}"` : '';
    return `<ruby${sandhi}>${w.h}<rt>${w.p}</rt></ruby>`;
  }).join(' ').replace(/ (?=[。，？])/g, '');                      // 句読点の前の空白は消す
}

// 単語の並びから、漢字だけの文を作る（読み上げ用）
function plainText(words) {
  return words.map(w => (typeof w === 'string' ? w : (w.h || ''))).join('');
}

// 記号（アイコン）。言葉の代わりに、意味がひと目で伝わる形を使う
const ICON = {
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  eye: '<svg class="icon-on" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg class="icon-off" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>'
};

// 読み上げボタン（「読む」と「×0.5」で1つの塊）
function audioButtonsHTML(text) {
  return `<span class="audio" role="group" aria-label="読み上げ">` +
    `<button type="button" data-action="speak" data-rate="1" data-text="${text}">${ICON.speaker}読む</button>` +
    `<button type="button" data-action="speak" data-rate="0.5" data-text="${text}" aria-label="0.5倍の速さで読む">×0.5</button>` +
    `</span>`;
}

// ピンインの表示切り替えボタン（目の記号でオン・オフがわかる）
function pinyinToggleHTML(shown) {
  return `<button type="button" class="pinyin-toggle" data-action="toggle-pinyin" aria-pressed="${shown}">${ICON.eyeOff}${ICON.eye}ピンイン</button>`;
}

// 項目ページの例文に、ボタンを取り付ける（HTML には目印だけを書いてある）
function setupActions(root) {
  root.querySelectorAll('.actions').forEach(function (box) {
    let html = '';
    if (box.dataset.speak) html += audioButtonsHTML(box.dataset.speak);
    if (box.hasAttribute('data-pinyin-toggle')) html += pinyinToggleHTML(false);
    box.innerHTML = html;
  });
}

/* ---- 読み上げ ----
   ブラウザ（端末）に入っている音声を借りて読む。端末によって声が違うのはこのため。
   音声の一覧は後から届くことがあるので、届くまで少し待ってから中国語の声を選ぶ。 */
let zhVoice = null;

function findChineseVoice() {
  const voices = window.speechSynthesis.getVoices();
  zhVoice = voices.find(v => /^zh[-_]CN/i.test(v.lang)) || voices.find(v => /^zh/i.test(v.lang) && !/HK|yue/i.test(v.lang)) || null;
  return zhVoice;
}

function waitForVoices() {
  return new Promise(function (resolve) {
    if (findChineseVoice() || window.speechSynthesis.getVoices().length) { resolve(); return; }
    const done = () => { findChineseVoice(); resolve(); };
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);        // 待っても来ないときは先に進む
  });
}

async function speak(text, rate) {
  try {
    if (!('speechSynthesis' in window)) { showToast('この端末は読み上げに対応していません'); return; }
    await waitForVoices();
    if (!zhVoice) { showToast('この端末には中国語の音声がありません'); return; }   // 日本語読みにならないよう、読まずに知らせる
    window.speechSynthesis.cancel();                 // 読み上げ中なら止めてから
    const u = new SpeechSynthesisUtterance(text);
    u.voice = zhVoice;
    u.lang = zhVoice.lang;
    u.rate = rate;                                   // 1 = ふつう、0.5 = ゆっくり
    window.speechSynthesis.speak(u);
  } catch (e) {
    showToast('読み上げできませんでした');
  }
}

// 画面の下に短いお知らせを出す
function showToast(message) {
  let box = document.getElementById('toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#1A1A1A;color:#fff;padding:8px 14px;border-radius:10px;font-size:13px;line-height:1.6;z-index:20;max-width:90vw';
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { box.hidden = true; }, 2500);
}

// 声調が変わる字に「押すと実際の発音が出る」仕組みを取り付ける
function setupSandhi(root) {
  root.querySelectorAll('ruby.sandhi').forEach(function (ruby) {
    if (ruby.parentElement.classList.contains('sandhi-wrap')) return;   // 取り付け済み
    const wrap = document.createElement('span');
    wrap.className = 'sandhi-wrap';
    ruby.parentNode.insertBefore(wrap, ruby);
    wrap.appendChild(ruby);

    const note = document.createElement('span');
    note.className = 'sandhi-note';
    note.textContent = '→ ' + ruby.dataset.actual;
    note.hidden = true;
    wrap.appendChild(note);

    // ボタンにすると中の文字をコピーできなくなるので、ruby のまま「押せる」ようにする
    ruby.setAttribute('role', 'button');
    ruby.setAttribute('tabindex', '0');
    ruby.setAttribute('aria-label', ruby.firstChild.textContent + '：続けて読むと ' + ruby.dataset.actual);
  });
}

function toggleSandhi(ruby) {
  const note = ruby.parentElement.querySelector('.sandhi-note');
  if (note) note.hidden = !note.hidden;
}

// ピンインの表示・非表示を切り替える
function togglePinyin(button) {
  const box = button.closest('.example, .q-area');
  const hiddenNow = box.classList.toggle('pinyin-hidden');
  button.setAttribute('aria-pressed', String(!hiddenNow));
  if (hiddenNow) box.querySelectorAll('.sandhi-note').forEach(n => { n.hidden = true; });
  if (box.classList.contains('q-area')) state.items[state.current].pinyin = !hiddenNow;   // 問題ごとに覚えておく
}

// 配列の順番をばらばらにする（並べ替え問題のカード用）
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============================================================
   3. 画面の切り替え
   ============================================================ */
function show(viewId) {
  ['view-item', 'view-quiz'].forEach(id => { document.getElementById(id).hidden = (id !== viewId); });
  window.scrollTo(0, 0);
}

/* ============================================================
   4. 問題の表示と判定
   「状態（state）」に、問題ごとの答えと結果を覚えておく。
   画面はいつも、この状態から組み立て直す。だから、どの番号に移っても前の答えが残る。
   ============================================================ */
const state = { current: 0, items: [] };

function newItem(q) {
  let order = null;
  if (q.type === 'reorder') {
    do { order = shuffle(q.tokens.map((_, i) => i)); } while (order.join() === q.answer.join());
  }
  return {
    order: order,       // 並べ替え：カード置き場の順番
    placed: [],         // 並べ替え：並べたカード
    selected: null,     // 選択式：選んだ番号
    done: false,        // 答え合わせ済みか
    ok: false,          // 正解か
    your: '',           // 自分の答え（文字）
    pinyin: false       // ピンインを表示しているか
  };
}

function startQuiz() {
  if (!state.items.length) state.items = QUESTIONS.map(newItem);
  const firstOpen = state.items.findIndex(it => !it.done);
  state.current = firstOpen === -1 ? 'summary' : firstOpen;
  render();
  show('view-quiz');
}

function restartQuiz() {
  state.items = QUESTIONS.map(newItem);
  state.current = 0;
  render();
  window.scrollTo(0, 0);
}

function allDone() { return state.items.every(it => it.done); }

function goTo(target) {
  state.current = target;
  render();
  window.scrollTo(0, 0);
}

// 画面全体を組み立てる：番号の列 → 本文 → 下のボタン
function render() {
  renderTabs();
  if (state.current === 'summary') renderSummary();
  else renderQuestion();
  renderMainButton();
}

function renderTabs() {
  const tabs = state.items.map(function (it, i) {
    const cls = it.done ? (it.ok ? ' good' : ' bad') : '';
    const mark = it.done ? `<span class="mark" aria-hidden="true">${it.ok ? '✓' : '✗'}</span>` : '';
    const status = it.done ? (it.ok ? '、正解' : '、不正解') : '';
    return `<button type="button" class="qtab${cls}" data-action="go" data-target="${i}" aria-current="${state.current === i}" aria-label="問${i + 1}${status}">${i + 1}${mark}</button>`;
  }).join('');
  const summary = `<button type="button" class="qtab" data-action="go" data-target="summary" aria-current="${state.current === 'summary'}" aria-label="結果" ${allDone() ? '' : 'disabled'}>Σ</button>`;
  document.getElementById('quiz-tabs').innerHTML = tabs + summary;
}

function renderQuestion() {
  const i = state.current;
  const q = QUESTIONS[i];
  const it = state.items[i];
  const lock = it.done ? ' disabled' : '';

  let area = `<p class="quiz-kind">問${i + 1} ・ ${q.kind}</p>`;
  area += `<p class="prompt-ja">${q.promptJa}</p>`;
  area += `<p lang="en" class="prompt-en">${q.promptEn}</p>`;

  if (q.type === 'reorder') {
    const tokenBtn = id => `<button type="button" class="token" lang="zh-CN" data-action="token" data-id="${id}"${lock}><ruby>${q.tokens[id].h}<rt>${q.tokens[id].p}</rt></ruby></button>`;
    area += `<div class="answer-area">${it.placed.map(tokenBtn).join('')}</div>`;
    const rest = it.order.filter(id => !it.placed.includes(id));
    area += `<div class="token-pool">${rest.map(tokenBtn).join('')}</div>`;
    if (!it.done) area += `<p class="note">カードを押すと上に並びます。並べたカードを押すと戻ります。</p>`;
  } else {
    if (q.sentence) area += `<p lang="zh-CN" class="zh-line big">${sentenceHTML(q.sentence)}</p>`;
    const cols = q.cols ? ` cols-${q.cols}` : '';
    area += `<div class="options${cols}">` + q.options.map(function (o, k) {
      let inner = '';
      if (o.zh) inner += `<span lang="zh-CN" class="zh-line">${sentenceHTML(o.zh)}</span><br>`;
      if (o.html) inner += o.html;
      if (o.ja) inner += `<span class="ja">${o.ja}</span>`;
      if (o.en) inner += `<span lang="en" class="en">${o.en}</span>`;
      // 答え合わせ後は、正解に ✓、選んだ不正解に ✗ を付ける
      let cls = '', mark = '';
      if (it.done && k === q.answerIndex) { cls = ' is-correct'; mark = '<span class="mark" aria-hidden="true">✓</span>'; }
      else if (it.done && k === it.selected) { cls = ' is-wrong'; mark = '<span class="mark" aria-hidden="true">✗</span>'; }
      return `<button type="button" class="option${cls}" data-action="option" data-index="${k}" aria-pressed="${it.selected === k}"${lock}>${mark}${inner}</button>`;
    }).join('') + `</div>`;
  }
  area += `<div class="actions">${pinyinToggleHTML(it.pinyin)}</div>`;

  let html = `<div class="q-area${it.pinyin ? '' : ' pinyin-hidden'}">${area}</div>`;
  if (it.done) html += feedbackHTML(q, it);

  const body = document.getElementById('quiz-body');
  body.innerHTML = html;
  setupSandhi(body);
}

// 答え合わせの結果（問題の下に開く。解説のピンインは常に表示）
function feedbackHTML(q, it) {
  const unanswered = it.your === '';
  let head = it.ok ? '✓ 正解' : (unanswered ? '✗ 未回答' : '✗ 不正解');
  let html = `<div class="result-box"><p class="result ${it.ok ? 'good' : 'bad'}">${head}</p>`;
  if (!it.ok && !unanswered) {
    const lang = q.type === 'reorder' ? ' lang="zh-CN"' : '';
    html += `<div><p class="label">あなたの答え</p><p class="your-answer"${lang}>${it.your}</p></div>`;
  }
  html += `<div><p class="label">正解</p>
    <p lang="zh-CN" class="zh-line big" style="padding-bottom:12px">${sentenceHTML(q.correct)}</p>
    <p class="ja">${q.ja}</p>
    <p lang="en" class="en">${q.en}</p>
    <div class="actions" style="margin-top:6px">${audioButtonsHTML(plainText(q.correct))}</div>
  </div>`;
  html += `<div class="why"><p class="why-title">なぜ？</p><p>${q.why}</p>
    <button type="button" class="link" data-action="goto-lecture" data-target="${q.lecture}">講義の該当箇所を読む ›</button></div>`;
  return html + `</div>`;
}

function renderSummary() {
  const score = state.items.filter(it => it.ok).length;
  const rows = state.items.map(function (it, i) {
    const kind = QUESTIONS[i].kind;
    return `<button type="button" class="summary-row" data-action="go" data-target="${i}">
      <span class="mark ${it.ok ? 'good' : 'bad'}" aria-label="${it.ok ? '正解' : '不正解'}">${it.ok ? '✓' : '✗'}</span>
      <span>問${i + 1} ・ ${kind}</span><span class="chev" aria-hidden="true">›</span></button>`;
  }).join('');
  document.getElementById('quiz-body').innerHTML =
    `<p class="label">結果</p>
     <p class="score">${score} / ${QUESTIONS.length}</p>
     <div class="summary-list">${rows}</div>
     <button type="button" class="link" data-action="back-to-item">‹ 講義に戻る</button>`;
}

// 下に固定したボタン：状況に応じて役割が変わる
function renderMainButton() {
  const b = document.getElementById('main-button');
  if (state.current === 'summary') {
    b.textContent = 'もう一度解く'; b.dataset.action = 'restart';
  } else if (!state.items[state.current].done) {
    b.textContent = '答え合わせ'; b.dataset.action = 'check';   // 何も答えていなくても押せる（未回答＝不正解）
  } else if (allDone()) {
    b.textContent = '結果を見る'; b.dataset.action = 'summary';
  } else {
    b.textContent = '次の問題 ›'; b.dataset.action = 'next';
  }
}

// 並べ替えのカードを押したとき：置き場 ⇔ 並べる場所 を行き来する
function moveToken(id) {
  const it = state.items[state.current];
  if (it.placed.includes(id)) it.placed = it.placed.filter(x => x !== id);
  else it.placed.push(id);
  renderQuestion();
}

// 選択肢を押したとき（もう一度押すと選択を外せる）
function pickOption(index) {
  const it = state.items[state.current];
  it.selected = (it.selected === index) ? null : index;
  renderQuestion();
}

// 答え合わせ
function check() {
  const q = QUESTIONS[state.current];
  const it = state.items[state.current];
  if (q.type === 'reorder') {
    it.ok = it.placed.join() === q.answer.join();
    it.your = it.placed.length ? it.placed.map(i => q.tokens[i].h).join('') + (it.placed.length === q.tokens.length ? '。' : '…') : '';
  } else {
    it.ok = it.selected === q.answerIndex;
    it.your = it.selected === null ? '' : q.options[it.selected].text;
  }
  it.done = true;
  render();
}

// 次の未回答の問題へ（最後まで行ったら最初に戻って探す）
function next() {
  const n = state.items.length;
  for (let step = 1; step <= n; step++) {
    const k = (state.current + step) % n;
    if (!state.items[k].done) { goTo(k); return; }
  }
  goTo('summary');
}

/* ============================================================
   5. クリックの受付
   ページ全体で1か所だけ「押された」を待ち受け、data-action を見て振り分ける。
   （ボタンごとに受付を作るより、あとから作られるボタンにも効くので便利）
   ============================================================ */
document.addEventListener('click', function (event) {
  const sandhi = event.target.closest('ruby.sandhi');
  if (sandhi) { toggleSandhi(sandhi); return; }

  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  switch (el.dataset.action) {
    case 'speak': speak(el.dataset.text, Number(el.dataset.rate)); break;
    case 'toggle-pinyin': togglePinyin(el); break;
    case 'start-quiz': startQuiz(); break;
    case 'back-to-item': show('view-item'); break;
    case 'go': goTo(el.dataset.target === 'summary' ? 'summary' : Number(el.dataset.target)); break;
    case 'token': moveToken(Number(el.dataset.id)); break;
    case 'option': pickOption(Number(el.dataset.index)); break;
    case 'check': check(); break;
    case 'next': next(); break;
    case 'summary': goTo('summary'); break;
    case 'restart': restartQuiz(); break;
    case 'goto-lecture': {
      show('view-item');
      const target = document.querySelector(el.dataset.target);
      if (target) target.scrollIntoView({ block: 'start' });
      break;
    }
  }
});

// キーボード操作でも声調変化を開けるように（Enter / スペース）
document.addEventListener('keydown', function (event) {
  const sandhi = event.target.closest && event.target.closest('ruby.sandhi');
  if (sandhi && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    toggleSandhi(sandhi);
  }
});

// 最初に1回：項目ページのボタンと声調変化を準備し、音声の一覧を読み込ませておく
setupActions(document.getElementById('view-item'));
setupSandhi(document.getElementById('view-item'));
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', findChineseVoice);
}
