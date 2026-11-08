/*
  app.js ＝ 動き（押したら「何が起きるか」）

  フェーズ3から、教材の中身は data/items/<項目番号>.json に分けた。
  このファイルは「データを読み込んで、画面を組み立てる」ことだけを受け持つ。
  だから、教材を直したり増やしたりするときは、このファイルに触らなくてよい。

  このファイルの構成
    1. データの読み込み  … JSON ファイルを取りに行き、書き方の誤りがあれば知らせる
    2. 中国語の書き方の解釈 … {了|le} のような書き方を、ルビ付きの表示に変える
    3. 小さな道具        … 読み上げる、ボタンを作る、などの関数
    4. 項目ページの組み立て … 講義のブロックと例文を、データから並べる
    5. 画面の切り替え
    6. 問題の表示と判定  … 1〜5を自由に行き来でき、解説は問題の下に開く
    7. クリックの受付
*/

/* ============================================================
   1. データの読み込み
   ============================================================ */
let ITEM = null;        // 読み込んだ項目のデータ全体
let QUESTIONS = [];     // その中の振り返り問題

// どの項目を開くか：アドレスの末尾が #8-2 なら 8-2、何もなければ 8-1
function currentItemId() {
  const id = decodeURIComponent(location.hash.slice(1));
  return /^\d+-\d+$/.test(id) ? id : '8-1';
}

async function loadItem(id) {
  const path = `data/items/${id}.json`;
  // cache: 'no-cache' ＝ 毎回「新しくなっていないか」を確認してから使う（古い版が残りにくくなる）
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} が見つかりません（${res.status}）`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path} の書き方に誤りがあります${errorLine(text, e)}。`);
  }
}

// JSON の誤りが何行目かを、わかる範囲で調べる（ブラウザによって教えてくれる情報が違う）
function errorLine(text, e) {
  const pos = /position (\d+)/.exec(e.message);
  if (pos) return `（${text.slice(0, Number(pos[1])).split('\n').length}行目付近）`;
  const line = /line (\d+)/.exec(e.message);
  if (line) return `（${line[1]}行目付近）`;
  return '';
}

async function start() {
  const root = document.getElementById('item-root');
  try {
    ITEM = await loadItem(currentItemId());
    QUESTIONS = ITEM.quiz || [];
    renderItem(ITEM);
  } catch (e) {
    root.innerHTML = `<div class="error-box" role="alert"><p class="error-title">⚠ データを読み込めません</p><p>${escapeHTML(e.message)}</p></div>`;
  }
}

/* ============================================================
   2. 中国語の書き方の解釈
   データの中では、次の書き方を使う。
     {漢字|ピンイン}          → 漢字の下にピンイン        例：{了|le}
     {漢字|ピンイン|実際の発音} → 声調が変わる字（点線）    例：{我|Wǒ|Wó}
     [文字]                  → 問題の空欄や記号          例：[（　）]  [A]
     **文字**                → 太字
   ============================================================ */

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

/* ============================================================
   3. 小さな道具（関数）
   ============================================================ */

// 記号（アイコン）。言葉の代わりに、意味がひと目で伝わる形を使う
const ICON = {
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  eye: '<svg class="icon-on" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg class="icon-off" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>',
  // 正解・不正解・未回答：丸の中に記号（形・色・文字の3つで伝える）
  good: '<svg class="icon-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bad: '<svg class="icon-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
  none: '<svg class="icon-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6l1.5 1.5 2.5-2.5"/><path d="M3.5 12l1.5 1.5 2.5-2.5"/><path d="M3.5 18l1.5 1.5 2.5-2.5"/><path d="M11 6.5h9.5M11 12.5h9.5M11 18.5h9.5"/></svg>',
  retry: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 3.5v4.5h4.5"/></svg>'
};

// 状態（正解・不正解・未回答）に合う記号
function markIcon(status) { return ICON[status]; }

// 読み上げボタン（スピーカーの記号に速さだけを添える。×1.0 と ×0.5 で1つの塊）
function audioButtonsHTML(text) {
  return `<span class="audio" role="group" aria-label="読み上げ">` +
    `<button type="button" data-action="speak" data-rate="1" data-text="${text}" aria-label="読み上げ（ふつうの速さ）">${ICON.speaker}×1.0</button>` +
    `<button type="button" data-action="speak" data-rate="0.5" data-text="${text}" aria-label="読み上げ（0.5倍の速さ）">×0.5</button>` +
    `</span>`;
}

// ピンインの表示切り替えボタン（目の記号でオン・オフがわかる）
function pinyinToggleHTML(shown) {
  return `<button type="button" class="pinyin-toggle" data-action="toggle-pinyin" aria-pressed="${shown}">${ICON.eyeOff}${ICON.eye}ピンイン</button>`;
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
    if (!('speechSynthesis' in window)) { showToast('この端末は読み上げ非対応'); return; }
    await waitForVoices();
    if (!zhVoice) { showToast('この端末に中国語の音声なし'); return; }   // 日本語読みにならないよう、読まずに知らせる
    window.speechSynthesis.cancel();                 // 読み上げ中なら止めてから
    const u = new SpeechSynthesisUtterance(text);
    u.voice = zhVoice;
    u.lang = zhVoice.lang;
    u.rate = rate;                                   // 1 = ふつう、0.5 = ゆっくり
    window.speechSynthesis.speak(u);
  } catch (e) {
    showToast('読み上げ失敗');
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
   4. 項目ページの組み立て
   講義は「ブロック」を上から順に並べる。ブロックの種類（type）ごとに、組み立て方を決めてある。
   新しい種類のブロックが必要になったときだけ、ここに組み立て方を1つ足す。
   ============================================================ */
const BLOCKS = {
  // この章の地図
  map: b => `<h3>${md(b.title)}</h3><div class="chapter-map">` +
    b.cells.map(c => `<div class="map-cell${c.current ? ' current' : ''}"><span class="map-zh">${md(c.zh)}</span><span class="map-ja">${md(c.ja)}</span></div>`).join('') +
    `</div>`,
  // 見出し＋文章
  text: b => `<h3>${md(b.title)}</h3><p>${md(b.body)}</p>`,
  // 型（日本語・英語・中国語の例）
  pattern: b => `<div class="panel"${anchor(b)}><h3>${md(b.title)}</h3>
    <p class="pattern">${md(b.ja)}</p>
    <p lang="en" class="pattern-en">${md(b.en)}</p>
    <p lang="zh-CN" class="zh-line">${md(b.zh)}</p></div>`,
  // 灰色の枠の中に見出し＋文章
  panel: b => `<div class="panel"${anchor(b)}><h3>${md(b.title)}</h3><p>${md(b.body)}</p></div>`,
  // ほかの言語との比較（カードを並べる）
  compare: b => `<h3>${md(b.title)}</h3>` +
    b.cards.map(c => `<div class="card"><p class="card-label">${md(c.label)}</p><p>${md(c.body)}</p></div>`).join(''),
  // 説が分かれる点
  debate: b => `<div class="debate"${anchor(b)}><p class="debate-label">${md(b.title)}</p><p>${md(b.body)}</p></div>`
};

// ブロックに id があれば、解説の「講義の該当箇所 ›」から飛べる目印にする
function anchor(b) { return b.id ? ` id="${escapeHTML(b.id)}"` : ''; }

function exampleHTML(ex) {
  // 誤用例（誤った文・不自然な文）：解説の一部なので、ピンインは常に表示
  if (ex.kind === 'wrong' || ex.kind === 'odd') {
    const label = ex.kind === 'wrong' ? '誤った文' : 'これだけでは不自然な文';
    return `<article class="example wrong">
      <p class="tag tag-${ex.kind}">${label}</p>
      <p lang="zh-CN" class="zh-line big">${md(ex.zh)}</p>
      <p class="explain">${md(ex.explain)}</p></article>`;
  }
  // ふつうの例文：ピンインは最初は隠す
  const status = [ex.note ? md(ex.note) : '', ex.checked ? '' : 'ネイティブ未確認'].filter(Boolean).join(' ・ ');
  return `<article class="example pinyin-hidden">
    <p lang="zh-CN" class="zh-line big">${md(ex.zh)}</p>
    <div class="actions">${audioButtonsHTML(plain(ex.zh))}${pinyinToggleHTML(false)}</div>
    <p class="ja">${md(ex.ja)}</p>
    <p lang="en" class="en">${md(ex.en)}</p>
    ${status ? `<p class="status">${status}</p>` : ''}</article>`;
}

function renderItem(item) {
  document.title = `${plain(item.title.ja)} – 中国語文法ノート`;
  document.getElementById('item-path').textContent = `${item.chapter.no}章 ${item.chapter.ja} › ${item.id}`;

  const lecture = item.lecture.map(b => (BLOCKS[b.type] ? BLOCKS[b.type](b) : `<p class="note">（未対応のブロック：${escapeHTML(b.type)}）</p>`)).join('\n');
  const n = (item.quiz || []).length;

  document.getElementById('item-root').innerHTML = `
    <section class="intro">
      <h1>${md(item.title.ja)}</h1>
      <p lang="en" class="title-en">${md(item.title.en)}</p>
      <p class="terms">用語：${md(item.terms)}</p>
      <nav class="chips" aria-label="ページ内の段階">
        <a href="#lecture" data-action="scroll" data-target="lecture">① 講義</a>
        <a href="#examples" data-action="scroll" data-target="examples">② 例文</a>
        ${n ? '<button type="button" class="chip-button" data-action="start-quiz">③ 問題</button>' : ''}
      </nav>
    </section>
    <section id="lecture" class="block">
      <h2>① 講義</h2>
      ${lecture}
    </section>
    <section id="examples" class="block">
      <h2>② 例文</h2>
      ${item.examples.map(exampleHTML).join('\n')}
      ${n ? `<button type="button" class="primary" data-action="start-quiz">振り返り ${n}問 ›</button>` : ''}
    </section>`;
  setupSandhi(document.getElementById('item-root'));
}

/* ============================================================
   5. 画面の切り替え
   ============================================================ */
function show(viewId) {
  ['view-item', 'view-quiz'].forEach(id => { document.getElementById(id).hidden = (id !== viewId); });
  window.scrollTo(0, 0);
}

/* ============================================================
   6. 問題の表示と判定
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

// 1問だけやり直す
function retryQuestion() {
  state.items[state.current] = newItem(QUESTIONS[state.current]);
  render();
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

function statusOf(it) { return it.done ? (it.ok ? 'good' : 'bad') : 'none'; }
const STATUS_TEXT = { good: '正解', bad: '不正解', none: '未回答' };

function renderTabs() {
  const tabs = state.items.map(function (it, i) {
    const st = statusOf(it);
    const icon = it.done ? markIcon(st) : '';
    return `<button type="button" class="qtab ${st}" data-action="go" data-target="${i}" aria-current="${state.current === i}" aria-label="問${i + 1}、${STATUS_TEXT[st]}">${icon}<span>${i + 1}</span></button>`;
  }).join('');
  // 結果（一覧）はいつでも開ける。未回答の問題は「未回答」として表示
  const summary = `<button type="button" class="qtab list" data-action="go" data-target="summary" aria-current="${state.current === 'summary'}" aria-label="結果の一覧">${ICON.list}</button>`;
  document.getElementById('quiz-tabs').innerHTML = tabs + summary;
}

function renderQuestion() {
  const i = state.current;
  const q = QUESTIONS[i];
  const it = state.items[i];
  const lock = it.done ? ' disabled' : '';

  let area = `<p class="quiz-kind">問${i + 1} ・ ${md(q.kind)}</p>`;
  area += `<p class="prompt-ja">${md(q.promptJa)}</p>`;
  area += `<p lang="en" class="prompt-en">${q.promptEn}</p>`;

  if (q.type === 'reorder') {
    const tokenBtn = id => `<button type="button" class="token" lang="zh-CN" data-action="token" data-id="${id}"${lock}>${md(q.tokens[id])}</button>`;
    area += `<div class="answer-area">${it.placed.map(tokenBtn).join('')}</div>`;
    const rest = it.order.filter(id => !it.placed.includes(id));
    area += `<div class="token-pool">${rest.map(tokenBtn).join('')}</div>`;
    if (!it.done) area += `<p class="note">タップで移動</p>`;
  } else {
    if (q.sentence) area += `<p lang="zh-CN" class="zh-line big">${md(q.sentence)}</p>`;
    const cols = q.cols ? ` cols-${q.cols}` : '';
    area += `<div class="options${cols}">` + q.options.map(function (o, k) {
      let inner = '';
      if (o.zh) inner += `<span lang="zh-CN" class="zh-line">${md(o.zh)}</span><br>`;
      if (o.text) inner += md(o.text);
      if (o.ja) inner += `<span class="ja">${md(o.ja)}</span>`;
      if (o.en) inner += `<span lang="en" class="en">${o.en}</span>`;
      // 答え合わせ後は、正解に緑の丸、選んだ不正解に赤の丸を付ける
      let cls = '', mark = '';
      if (it.done && k === q.answerIndex) { cls = ' is-correct'; mark = `<span class="mark">${ICON.good}</span>`; }
      else if (it.done && k === it.selected) { cls = ' is-wrong'; mark = `<span class="mark">${ICON.bad}</span>`; }
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
  const st = it.ok ? 'good' : 'bad';
  const head = it.ok ? '正解' : (unanswered ? '未回答' : '不正解');
  let html = `<div class="result-box"><p class="result ${st}">${markIcon(st)}${head}</p>`;
  if (!it.ok && !unanswered) {
    const lang = q.type === 'reorder' ? ' lang="zh-CN"' : '';
    html += `<div><p class="label">回答</p><p class="your-answer"${lang}>${it.your}</p></div>`;
  }
  html += `<div><p class="label">正解</p>
    <p lang="zh-CN" class="zh-line big" style="padding-bottom:12px">${md(q.correct)}</p>
    <p class="ja">${md(q.ja)}</p>
    <p lang="en" class="en">${q.en}</p>
    <div class="actions" style="margin-top:6px">${audioButtonsHTML(plain(q.correct))}</div>
  </div>`;
  html += `<div class="why"><p class="why-title">なぜ？</p><p>${md(q.why)}</p>
    <button type="button" class="link" data-action="goto-lecture" data-target="${q.lecture}">講義の該当箇所 ›</button></div>`;
  return html + `</div>`;
}

function renderSummary() {
  const score = state.items.filter(it => it.ok).length;
  const open = state.items.filter(it => !it.done).length;
  const rows = state.items.map(function (it, i) {
    const st = statusOf(it);
    return `<button type="button" class="summary-row ${st}" data-action="go" data-target="${i}" aria-label="問${i + 1}、${STATUS_TEXT[st]}">
      <span class="mark">${markIcon(st)}</span>
      <span>問${i + 1} ・ ${md(QUESTIONS[i].kind)}</span><span class="chev" aria-hidden="true">›</span></button>`;
  }).join('');
  document.getElementById('quiz-body').innerHTML =
    `<p class="label">結果</p>
     <p class="score">${score} / ${QUESTIONS.length}</p>
     ${open ? `<p class="note">未回答 ${open}</p>` : ''}
     <div class="summary-list">${rows}</div>
     <button type="button" class="link" data-action="back-to-item">‹ 講義</button>`;
}

// 下に固定したボタン：状況に応じて役割が変わる
function renderMainButton() {
  const b = document.getElementById('main-button');
  const retry = document.getElementById('retry-button');
  const onQuestion = state.current !== 'summary';
  const done = onQuestion && state.items[state.current].done;
  retry.hidden = !done;                       // 答え合わせ後だけ「やり直し」を出す
  retry.innerHTML = ICON.retry;
  if (!onQuestion) {
    b.textContent = '全問やり直し'; b.dataset.action = 'restart';
  } else if (!done) {
    b.textContent = '答え合わせ'; b.dataset.action = 'check';   // 何も答えていなくても押せる（未回答＝不正解）
  } else if (allDone()) {
    b.textContent = '結果 ›'; b.dataset.action = 'summary';
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
    it.your = it.placed.length ? it.placed.map(i => plain(q.tokens[i])).join('') + (it.placed.length === q.tokens.length ? '。' : '…') : '';
  } else {
    it.ok = it.selected === q.answerIndex;
    it.your = it.selected === null ? '' : plain(optionText(q.options[it.selected]));
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
   7. クリックの受付
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
    case 'scroll': {                       // ページ内の移動（アドレスの # は項目番号用に残しておく）
      event.preventDefault();
      const target = document.getElementById(el.dataset.target);
      if (target) target.scrollIntoView({ block: 'start' });
      break;
    }
    case 'go': goTo(el.dataset.target === 'summary' ? 'summary' : Number(el.dataset.target)); break;
    case 'token': moveToken(Number(el.dataset.id)); break;
    case 'option': pickOption(Number(el.dataset.index)); break;
    case 'check': check(); break;
    case 'next': next(); break;
    case 'summary': goTo('summary'); break;
    case 'restart': restartQuiz(); break;
    case 'retry': retryQuestion(); break;
    case 'goto-lecture': {
      show('view-item');
      const target = document.getElementById(el.dataset.target);
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

// 最初に1回：データを読み込んで画面を作り、音声の一覧を読み込ませておく
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', findChineseVoice);
}
start();

// アドレスの # が変わったら（例：#8-1 → #8-2）、その項目を読み込み直す
window.addEventListener('hashchange', function () {
  state.items = [];
  show('view-item');
  start();
});
