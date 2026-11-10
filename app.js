/*
  app.js ＝ 動き（押したら「何が起きるか」）

  役割の分担
    markup.js … データの中の {了|le} のような書き方を、ルビ付きの表示に変える
    store.js  … 学習記録（読了・正誤）と、復習の時期の計算、書き出し・読み込み
    app.js    … データを読み込み、画面を組み立て、操作に応える（このファイル）

  画面はアドレスの末尾（# のあと）で切り替える
    #toc（または何もなし） → ホーム：目次
    #drill                 → ホーム：問題集
    #review                → ホーム：復習
    #8-1 など              → その項目のページ
  問題の画面だけは # を使わず、ボタンで開く

  このファイルの構成
    1. データの読み込み
    2. 小さな道具（記号・読み上げ・ピンイン・声調変化）
    3. 項目ページの組み立て
    4. ホーム（目次・問題集・復習）の組み立て
    5. 問題の表示と判定
    6. 画面の切り替えとクリックの受付
*/

/* ============================================================
   1. データの読み込み
   ============================================================ */
let CATALOG = null;                 // 目次（data/catalog.json）
const ITEMS = {};                   // 読み込んだ項目（同じ項目は二度読まない）

async function loadJSON(path) {
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

async function loadCatalog() {
  if (!CATALOG) CATALOG = await loadJSON('data/catalog.json');
  return CATALOG;
}

async function loadItem(id) {
  if (!ITEMS[id]) ITEMS[id] = await loadJSON(`data/items/${id}.json`);
  return ITEMS[id];
}

const DRILLS = {};                  // 読み込んだ問題集
async function loadDrill(id) {
  if (!DRILLS[id]) DRILLS[id] = await loadJSON(`data/drills/${id}.json`);
  return DRILLS[id];
}

// 記録の名前（例：「8-1/q1」「aspect/a101」）から、問題とその項目を探す
//   ・前半が項目番号なら、その項目の振り返り問題
//   ・それ以外なら、問題集の問題（問題ごとに item でどの項目かが書いてある）
async function questionByKey(key) {
  const [src, qid] = key.split('/');
  if (/^\d+-\d+$/.test(src)) {
    const item = await loadItem(src);
    const q = (item.quiz || []).find(x => x.id === qid);
    return q ? withSource(item, q, key) : null;
  }
  const drill = await loadDrill(src);
  const q = (drill.questions || []).find(x => x.id === qid);
  return q ? withSource(await loadItem(q.item), q, key) : null;
}

function errorHTML(e) {
  return `<div class="error-box" role="alert"><p class="error-title">⚠ データを読み込めません</p><p>${escapeHTML(e.message)}</p></div>`;
}

/* ============================================================
   2. 小さな道具（関数）
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


// ホーム・目次・記録で使う記号
Object.assign(ICON, {
  check: '<svg class="icon-check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg class="tri" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2L10 6L4 10Z" fill="currentColor"/></svg>',
  down: '<svg class="tri" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4L10 4L6 10Z" fill="currentColor"/></svg>',
  share: '<svg class="icon-share" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/></svg>'
});

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
   3. 項目ページの組み立て
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


// 読了ボタン（押すたびに 読了 ⇔ 未読 が切り替わる）
function readButtonHTML(itemId) {
  const on = Store.isRead(itemId);
  return `<button type="button" class="read-toggle" data-action="toggle-read" data-item="${escapeHTML(itemId)}" aria-pressed="${on}">${ICON.check}<span>${on ? '読了' : '読了にする'}</span></button>`;
}

async function renderItemPage(id) {
  const root = document.getElementById('item-root');
  document.getElementById('item-path').textContent = '';
  root.innerHTML = '<p class="loading">読み込み中…</p>';
  let item;
  try { item = await loadItem(id); } catch (e) { root.innerHTML = errorHTML(e); return; }

  document.title = `${plain(item.title.ja)} – 中国語文法ノート`;
  document.getElementById('item-path').textContent = `${item.chapter.no}章 › ${item.id}`;

  const lecture = item.lecture.map(b => (BLOCKS[b.type] ? BLOCKS[b.type](b) : `<p class="note">（未対応のブロック：${escapeHTML(b.type)}）</p>`)).join('\n');
  const n = (item.quiz || []).length;

  root.innerHTML = `
    <section class="intro">
      <h1>${md(item.title.ja)}</h1>
      <p lang="en" class="title-en">${md(item.title.en)}</p>
      <p class="terms">用語：${md(item.terms)}</p>
      <nav class="chips" aria-label="ページ内の段階">
        <a href="#lecture" data-action="scroll" data-target="lecture">① 講義</a>
        <a href="#examples" data-action="scroll" data-target="examples">② 例文</a>
        ${n ? `<button type="button" class="chip-button" data-action="start-quiz" data-item="${escapeHTML(id)}">③ 問題</button>` : ''}
      </nav>
    </section>
    <section id="lecture" class="block">
      <h2>① 講義</h2>
      ${lecture}
    </section>
    <section id="examples" class="block">
      <h2>② 例文</h2>
      ${item.examples.map(exampleHTML).join('\n')}
      <div class="item-end">
        ${readButtonHTML(id)}
        ${n ? `<button type="button" class="primary" data-action="start-quiz" data-item="${escapeHTML(id)}">振り返り ${n}問 ›</button>` : ''}
      </div>
    </section>`;
  setupSandhi(root);
}

/* ============================================================
   4. ホーム（目次・問題集・復習）の組み立て
   ============================================================ */
const openChapters = new Set([8]);        // 目次で開いている章（最初は8章）

function isStandalone() {                 // ホーム画面から開いているか
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function homeTabsHTML(tab) {
  const due = Store.dueKeys().length;
  const t = (id, label, extra = '') => `<a href="#${id}" class="seg${tab === id ? ' current' : ''}"${tab === id ? ' aria-current="page"' : ''}>${label}${extra}</a>`;
  const badge = due ? `<span class="badge" aria-label="${due}件">${due}件</span>` : '';
  return `<nav class="segmented" aria-label="切り替え">${t('toc', '講義')}${t('drill', '問題集')}${t('review', '復習', badge)}</nav>`;
}

async function renderHome(tab) {
  document.title = '中国語文法ノート';
  document.getElementById('home-tabs').innerHTML = homeTabsHTML(tab);
  const root = document.getElementById('home-root');
  try {
    if (tab === 'toc') root.innerHTML = tocHTML(await loadCatalog());
    else if (tab === 'drill') root.innerHTML = await drillHTML();
    else root.innerHTML = await reviewHTML();
  } catch (e) {
    root.innerHTML = errorHTML(e);
  }
}

/* ---- 目次 ---- */
function tocHTML(cat) {
  return `<h1 class="home-title">目次</h1><div class="toc">` + cat.chapters.map(function (c) {
    const open = openChapters.has(c.no);
    const items = c.items || [];
    const head = `<button type="button" class="chapter" data-action="toggle-chapter" data-no="${c.no}" aria-expanded="${open}">
        ${open ? ICON.down : ICON.right}<span class="ch-no">${c.no}</span>
        <span class="ch-title"><span>${md(c.ja)}</span><span lang="en" class="ch-en">${md(c.en)}</span></span>
        <span class="ch-count">${items.length ? `${items.length}項目` : '準備中'}</span></button>`;
    if (!open) return `<div class="chapter-box">${head}</div>`;
    const note = c.note ? `<p class="ch-note">${md(c.note)}</p>` : '';
    const list = items.length ? items.map(function (it) {
      const title = `<span class="it-title"><span>${md(it.ja)}</span><span lang="en" class="ch-en">${md(it.en)}</span></span>`;
      if (!it.ready) return `<div class="toc-item off"><span class="it-no">${escapeHTML(it.id)}</span>${title}<span class="it-state">準備中</span></div>`;
      const read = Store.isRead(it.id) ? `<span class="read-mark" aria-label="読了">${ICON.check}</span>` : '';
      return `<a class="toc-item" href="#${escapeHTML(it.id)}"><span class="it-no">${escapeHTML(it.id)}</span>${title}${read}<span class="chev" aria-hidden="true">›</span></a>`;
    }).join('') : `<p class="ch-note">準備中</p>`;
    return `<div class="chapter-box open">${head}${note}${list}</div>`;
  }).join('') + `</div>`;
}

/* ---- 問題集 ----
   テーマごとに、いくつかの項目の問題を混ぜて出す（インターリーブ練習）。
   出題範囲は最初「読んだ項目だけ」。未読の項目も、押せば範囲に入れられる。 */
const drillSel = {};                 // 問題集ごとに、範囲に入れた項目（このページを開いている間だけ覚える）
const drillCount = {};               // 問題集ごとに、1回に解く問題数
const DRILL_COUNTS = [10, 20, 0];    // 0 ＝ 全部

function selectionOf(drill) {
  if (!drillSel[drill.id]) drillSel[drill.id] = new Set(drill.items.filter(id => Store.isRead(id)));
  return drillSel[drill.id];
}

async function drillHTML() {
  const cat = await loadCatalog();
  const titles = {};
  cat.chapters.forEach(c => (c.items || []).forEach(it => { titles[it.id] = it; }));
  let html = `<h1 class="home-title">問題集</h1>`;
  for (const id of cat.drills || []) {
    const drill = await loadDrill(id);
    const sel = selectionOf(drill);
    const per = {};
    drill.questions.forEach(q => { per[q.item] = (per[q.item] || 0) + 1; });
    const pool = drill.questions.filter(q => sel.has(q.item)).length;
    const count = drillCount[id] === undefined ? 10 : drillCount[id];
    const rows = drill.items.map(function (itemId) {
      const t = titles[itemId] || { ja: itemId, en: '' };
      const on = sel.has(itemId);
      const unread = Store.isRead(itemId) ? '' : `<span class="tag">未読</span>`;
      return `<button type="button" class="drill-item" data-action="toggle-drill-item" data-drill="${escapeHTML(id)}" data-item="${escapeHTML(itemId)}" aria-pressed="${on}">
        <span class="check-box" aria-hidden="true">${on ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}</span>
        <span class="it-no">${escapeHTML(itemId)}</span>
        <span class="it-title"><span>${md(t.ja)}</span></span>${unread}<span class="ch-count">${per[itemId] || 0}問</span></button>`;
    }).join('');
    const counts = DRILL_COUNTS.map(n => `<button type="button" class="seg${n === count ? ' current' : ''}" data-action="drill-count" data-drill="${escapeHTML(id)}" data-n="${n}" aria-pressed="${n === count}">${n ? `${n}問` : '全部'}</button>`).join('');
    html += `<section class="drill-card">
      <p class="drill-title">${md(drill.title.ja)} <span lang="en" class="ch-en">${md(drill.title.en)}</span></p>
      ${drill.note ? `<p class="note">${md(drill.note)}</p>` : ''}
      <p class="label">出題範囲</p>
      <div class="drill-items">${rows}</div>
      ${sel.size ? '' : `<p class="note">講義の「読了」を付けると、その項目が自動で入ります。</p>`}
      <p class="label">問題数</p>
      <div class="segmented">${counts}</div>
      <button type="button" class="primary" data-action="start-drill" data-drill="${escapeHTML(id)}"${pool ? '' : ' disabled'}>始める（${count && count < pool ? count : pool}問） ›</button>
    </section>`;
  }
  if (!(cat.drills || []).length) html += `<div class="empty">${ICON.list}<p>準備中</p></div>`;
  return html;
}

async function startDrill(id) {
  const drill = await loadDrill(id);
  const sel = selectionOf(drill);
  const pool = shuffle(drill.questions.filter(q => sel.has(q.item)));
  const count = drillCount[id] === undefined ? 10 : drillCount[id];
  const picked = count ? pool.slice(0, count) : pool;
  const questions = [];
  for (const q of picked) questions.push(withSource(await loadItem(q.item), q, `${drill.id}/${q.id}`));
  if (!questions.length) return;
  openQuiz({ mode: 'drill', back: '#drill', backLabel: '問題集', title: '問題集', questions: questions });
}

/* ---- 復習 ---- */
async function reviewHTML() {
  let html = `<h1 class="home-title">復習</h1>`;

  // Safari で開いているときだけ：ホーム画面に追加する案内
  if (!isStandalone()) {
    html += `<div class="hint">${ICON.share}<div><p class="hint-title">ホーム画面に追加</p>
      <p>Safariの共有ボタン → 「ホーム画面に追加」。7日間開かなくても記録が消えなくなります。</p></div></div>`;
  }

  const keys = Store.dueKeys();
  if (keys.length) {
    const rows = [];
    for (const key of keys) {
      try {
        const q = await questionByKey(key);
        const box = Store.card(key).box;
        if (q) rows.push(`<li class="review-row"><span class="it-no">${escapeHTML(q._item.id)}</span><span>${md(q.kind)}</span><span class="box" aria-label="箱${box}">${'●'.repeat(box)}${'○'.repeat(Store.INTERVALS.length - box)}</span></li>`);
      } catch (e) { /* 消えた項目の記録は表示しない */ }
    }
    html += `<p class="label">今日の復習</p><p class="score">${rows.length}問</p>
      <ul class="review-list">${rows.join('')}</ul>
      <button type="button" class="primary" data-action="start-review">復習を始める ›</button>`;
  } else {
    const next = Store.nextDue();
    html += `<div class="empty">${ICON.check}<p>今日の復習 なし</p>${next ? `<p class="note">次回 ${formatDate(next.date)}・${next.count}問</p>` : ''}</div>`;
  }

  // 記録の書き出し・読み込み
  const at = Store.exportedAt();
  html += `<div class="records"><p class="label">記録</p>
    <div class="actions">
      <button type="button" class="small-action" data-action="export">${ICON.download}書き出し</button>
      <button type="button" class="small-action" data-action="import">${ICON.upload}読み込み</button>
    </div>
    <p class="note">最終書き出し：${at ? formatDate(at) : 'なし'}</p></div>`;
  return html;
}

function formatDate(d) {
  const [, m, day] = d.split('-').map(Number);
  return `${m}月${day}日`;
}

/* ---- 書き出し・読み込み ---- */
function exportRecords() {
  const blob = new Blob([Store.exportText()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chinese-grammar-note-${Store.today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('書き出し完了');
  route();
}

function importRecords() {
  const input = document.getElementById('import-file');
  input.value = '';
  input.click();
}

document.getElementById('import-file').addEventListener('change', async function () {
  const file = this.files && this.files[0];
  if (!file) return;
  if (Store.hasAny() && !window.confirm('今の記録を、このファイルの記録で置き換えます。よろしいですか？')) return;
  try {
    Store.importText(await file.text());
    showToast('読み込み完了');
    route();
  } catch (e) {
    showToast('読み込めないファイルです');
  }
});

/* ============================================================
   5. 問題の表示と判定
   問題の画面は2つの使い方がある
     ・振り返り：1つの項目の問題を全部解く（項目ページから）
     ・復習    ：復習の時期が来た問題だけを解く（いくつかの項目にまたがる）
   どちらも、問題ごとの答えと結果を「状態（state）」に覚え、画面はいつもそこから組み立て直す。
   答え合わせのたびに、store.js に正誤を記録し、次の復習日が決まる。
   ============================================================ */
const state = { current: 0, items: [], questions: [], mode: 'item', back: '#toc', title: '振り返り' };

function newItem(q) {
  let order = null;
  if (q.type === 'reorder') {
    do { order = shuffle(q.tokens.map((_, i) => i)); } while (order.join() === q.answer.join());
  }
  return { order: order, placed: [], selected: null, text: '', revealed: false, done: false, ok: false, your: '', pinyin: false };
}

// 問題に「どの項目の、どの問題か」を書き添える（記録の名前＝ 項目ID/問題ID）
function withSource(item, q, key) { return Object.assign({}, q, { _item: item, _key: key || `${item.id}/${q.id}` }); }

// 振り返り：その項目の問題を全部
async function startItemQuiz(itemId) {
  const item = await loadItem(itemId);
  openQuiz({ mode: 'item', back: `#${itemId}`, backLabel: '講義', title: '振り返り', questions: item.quiz.map(q => withSource(item, q)) });
}

// 復習：時期が来た問題だけ
async function startReview() {
  const questions = [];
  for (const key of Store.dueKeys()) {
    try {
      const q = await questionByKey(key);
      if (q) questions.push(q);
    } catch (e) { /* 読めない項目は飛ばす */ }
  }
  if (!questions.length) { showToast('今日の復習 なし'); return; }
  openQuiz({ mode: 'review', back: '#review', backLabel: '復習', title: '復習', questions: questions });
}

function openQuiz(opts) {
  Object.assign(state, opts);
  state.items = state.questions.map(newItem);
  state.current = 0;
  document.getElementById('quiz-back').textContent = `‹ ${opts.backLabel}`;
  document.getElementById('quiz-title').textContent = opts.title;
  render();
  show('view-quiz');
}

function retryQuestion() {
  state.items[state.current] = newItem(state.questions[state.current]);
  render();
}

function restartQuiz() {
  state.items = state.questions.map(newItem);
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
  const nav = document.getElementById('quiz-tabs');
  nav.classList.toggle('many', state.items.length > 5);
  nav.innerHTML = tabs + summary;
  // 横に並べたときは、今の問題の番号が見える位置まで動かす
  const cur = nav.querySelector('.qtab[aria-current="true"]:not(.list)');
  if (cur && nav.classList.contains('many')) nav.scrollLeft = cur.offsetLeft - nav.clientWidth / 2 + cur.offsetWidth / 2;
}

function renderQuestion() {
  const i = state.current;
  const q = state.questions[i];
  const it = state.items[i];
  const lock = it.done ? ' disabled' : '';

  // 復習では、どの項目の問題かを添える（振り返りでは同じ項目なので省く）
  // 問題集では、答えるまで項目を伏せる（どの文法かを自分で見分ける練習にするため）
  const from = (state.mode === 'review' || (state.mode === 'drill' && it.done)) ? `${escapeHTML(q._item.id)} ・ ` : '';
  let area = `<p class="quiz-kind">問${i + 1} ・ ${from}${md(q.kind)}</p>`;
  area += `<p class="prompt-ja">${md(q.promptJa)}</p>`;
  area += `<p lang="en" class="prompt-en">${md(q.promptEn)}</p>`;

  if (q.type === 'reorder') {
    const tokenBtn = id => `<button type="button" class="token" lang="zh-CN" data-action="token" data-id="${id}"${lock}>${md(q.tokens[id])}</button>`;
    area += `<div class="answer-area">${it.placed.map(tokenBtn).join('')}</div>`;
    const rest = it.order.filter(id => !it.placed.includes(id));
    area += `<div class="token-pool">${rest.map(tokenBtn).join('')}</div>`;
    if (!it.done) area += `<p class="note">タップで移動</p>`;
  } else if (q.type === 'fix') {
    // 誤りを探す：誤りのある語をタップ。なければ「誤りなし」
    const mark = function (k) {
      if (!it.done) return ['', ''];
      if (k === q.answerIndex) return [' is-correct', ''];
      if (k === it.selected) return [' is-wrong', ''];
      return ['', ''];
    };
    area += `<div class="fix-line" lang="zh-CN">` + q.tokens.map(function (t, k) {
      const [cls] = mark(k);
      return `<button type="button" class="token fix-token${cls}" data-action="option" data-index="${k}" aria-pressed="${it.selected === k}"${lock}>${md(t)}</button>`;
    }).join('') + `</div>`;
    const [noneCls] = mark(-1);
    area += `<button type="button" class="option no-error${noneCls}" data-action="option" data-index="-1" aria-pressed="${it.selected === -1}"${lock}>誤りなし</button>`;
    if (!it.done) area += `<p class="note">誤りのある語をタップ</p>`;
  } else if (q.type === 'write') {
    // 日→中：中国語で書いてから「答えを見る」。完全に一致しなければ、自分で○×を付ける
    const ro = (it.revealed || it.done) ? ' readonly' : '';
    area += `<textarea id="write-input" class="write-input" lang="zh-CN" rows="2" placeholder="中国語で入力" autocomplete="off" autocorrect="off" spellcheck="false"${ro}>${escapeHTML(it.text)}</textarea>`;
    if (!it.done && !it.revealed) area += `<p class="note">中国語のキーボード（簡体・ピンイン）で入力</p>`;
  } else {
    if (q.sentence) area += `<p lang="zh-CN" class="zh-line big">${md(q.sentence)}</p>`;
    const cols = q.cols ? ` cols-${q.cols}` : '';
    area += `<div class="options${cols}">` + q.options.map(function (o, k) {
      let inner = '';
      if (o.zh) inner += `<span lang="zh-CN" class="zh-line">${md(o.zh)}</span><br>`;
      if (o.text) inner += md(o.text);
      if (o.ja) inner += `<span class="ja">${md(o.ja)}</span>`;
      if (o.en) inner += `<span lang="en" class="en">${md(o.en)}</span>`;
      // 答え合わせ後は、正解に緑の丸、選んだ不正解に赤の丸を付ける
      let cls = '', mark = '';
      if (it.done && k === q.answerIndex) { cls = ' is-correct'; mark = `<span class="mark">${ICON.good}</span>`; }
      else if (it.done && k === it.selected) { cls = ' is-wrong'; mark = `<span class="mark">${ICON.bad}</span>`; }
      return `<button type="button" class="option${cls}" data-action="option" data-index="${k}" aria-pressed="${it.selected === k}"${lock}>${mark}${inner}</button>`;
    }).join('') + `</div>`;
  }
  area += `<div class="actions">${pinyinToggleHTML(it.pinyin)}</div>`;

  let html = `<div class="q-area${it.pinyin ? '' : ' pinyin-hidden'}">${area}</div>`;
  if (it.done || it.revealed) html += feedbackHTML(q, it);

  const body = document.getElementById('quiz-body');
  body.innerHTML = html;
  setupSandhi(body);
}

// 答え合わせの結果（問題の下に開く。解説のピンインは常に表示）
function feedbackHTML(q, it) {
  const unanswered = it.your === '';
  const st = it.ok ? 'good' : 'bad';
  const head = it.ok ? '正解' : (unanswered ? '未回答' : '不正解');
  let html = `<div class="result-box">`;
  if (it.done) html += `<p class="result ${st}">${markIcon(st)}${head}</p>`;
  if (q.type === 'write' && !it.done) {
    // 自己採点：模範解答と見比べて、自分で判断する
    html += `<div class="self-grade"><p class="label">自己採点</p><div class="self-grade-buttons">
      <button type="button" class="grade good" data-action="self-grade" data-ok="1">${ICON.good}合っていた</button>
      <button type="button" class="grade bad" data-action="self-grade" data-ok="0">${ICON.bad}違っていた</button></div></div>`;
  }
  if (q.type === 'write' && it.text.trim()) {
    // 自己採点の前と、正解のときは、取り消し線を付けない
    const cls = (it.done && !it.ok) ? 'your-answer' : 'your-answer neutral';
    html += `<div><p class="label">回答</p><p class="${cls}" lang="zh-CN">${escapeHTML(it.text.trim())}</p></div>`;
  } else if (!it.ok && !unanswered && it.done) {
    const lang = (q.type === 'reorder' || q.type === 'fix') ? ' lang="zh-CN"' : '';
    html += `<div><p class="label">回答</p><p class="your-answer"${lang}>${escapeHTML(it.your)}</p></div>`;
  }
  html += `<div><p class="label">正解</p>
    <p lang="zh-CN" class="zh-line big" style="padding-bottom:12px">${md(q.correct)}</p>
    <p class="ja">${md(q.ja)}</p>
    <p lang="en" class="en">${md(q.en)}</p>
    <div class="actions" style="margin-top:6px">${audioButtonsHTML(plain(q.correct))}</div>
  </div>`;
  html += `<div class="why"><p class="why-title">なぜ？</p><p>${md(q.why)}</p>
    <button type="button" class="link" data-action="goto-lecture" data-item="${escapeHTML(q._item.id)}" data-target="${escapeHTML(q.lecture)}">講義の該当箇所 ›</button></div>`;
  // 次の復習日（記録から）
  const card = Store.card(q._key);
  if (it.done && card && card.due) html += `<p class="note">次の復習：${formatDate(card.due)}</p>`;
  return html + `</div>`;
}

function renderSummary() {
  const score = state.items.filter(it => it.ok).length;
  const open = state.items.filter(it => !it.done).length;
  const rows = state.items.map(function (it, i) {
    const st = statusOf(it);
    const q = state.questions[i];
    const from = (state.mode === 'review' || (state.mode === 'drill' && it.done)) ? `${escapeHTML(q._item.id)} ・ ` : '';
    return `<button type="button" class="summary-row ${st}" data-action="go" data-target="${i}" aria-label="問${i + 1}、${STATUS_TEXT[st]}">
      <span class="mark">${markIcon(st)}</span>
      <span>問${i + 1} ・ ${from}${md(q.kind)}</span><span class="chev" aria-hidden="true">›</span></button>`;
  }).join('');
  document.getElementById('quiz-body').innerHTML =
    `<p class="label">結果</p>
     <p class="score">${score} / ${state.questions.length}</p>
     ${open ? `<p class="note">未回答 ${open}</p>` : ''}
     <div class="summary-list">${rows}</div>
     <button type="button" class="link" data-action="back">‹ ${escapeHTML(state.backLabel)}</button>`;
}

// 下に固定したボタン：状況に応じて役割が変わる
function renderMainButton() {
  const b = document.getElementById('main-button');
  const retry = document.getElementById('retry-button');
  const onQuestion = state.current !== 'summary';
  const done = onQuestion && state.items[state.current].done;
  retry.hidden = !done;                       // 答え合わせ後だけ「やり直し」を出す
  retry.innerHTML = ICON.retry;
  b.disabled = false;
  const waiting = onQuestion && !done && state.items[state.current].revealed;   // 日→中で、自己採点を待っている
  if (waiting) {
    b.textContent = '○か×を選択'; b.dataset.action = ''; b.disabled = true;
  } else if (!onQuestion) {
    b.textContent = '全問やり直し'; b.dataset.action = 'restart';
  } else if (!done) {
    b.textContent = state.questions[state.current].type === 'write' ? '答えを見る' : '答え合わせ'; b.dataset.action = 'check';   // 何も答えていなくても押せる（未回答＝不正解）
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

// 答え合わせ：判定 → 記録 → 画面
// 中国語の答えを比べるために、記号と空白を取り除く
function normalizeZh(t) { return String(t).replace(/[\s。，、？！．,.?!：:；;“”"'‘’…·]/g, ''); }

function check() {
  const q = state.questions[state.current];
  const it = state.items[state.current];
  if (q.type === 'reorder') {
    // 見た目の文字で比べる（同じ字のカードが2枚あるとき、どちらを先に置いても正解にする）
    it.ok = it.placed.length === q.answer.length && it.placed.map(i => plain(q.tokens[i])).join('') === q.answer.map(i => plain(q.tokens[i])).join('');
    it.your = it.placed.length ? it.placed.map(i => plain(q.tokens[i])).join('') + (it.placed.length === q.tokens.length ? '。' : '…') : '';
  } else if (q.type === 'fix') {
    it.ok = it.selected === q.answerIndex;
    it.your = it.selected === null ? '' : (it.selected === -1 ? '誤りなし' : plain(q.tokens[it.selected]));
  } else if (q.type === 'write') {
    const input = document.getElementById('write-input');
    if (input) it.text = input.value;
    it.your = it.text.trim();
    // 模範解答かほかの正解と（記号・空白を除いて）完全に一致すれば、自動で正解。それ以外は自己採点
    const answers = [plain(q.correct)].concat(q.alts || []).map(normalizeZh);
    if (it.your && answers.includes(normalizeZh(it.your))) {
      it.ok = true;
    } else if (it.your) {
      it.revealed = true;
      render();
      return;
    } else {
      it.ok = false;
    }
  } else {
    it.ok = it.selected === q.answerIndex;
    it.your = it.selected === null ? '' : plain(optionText(q.options[it.selected]));
  }
  finishAnswer(q, it);
}

// 自己採点の結果を受け取る（日→中）
function selfGrade(ok) {
  const q = state.questions[state.current];
  const it = state.items[state.current];
  it.ok = ok;
  finishAnswer(q, it);
}

// 判定が決まったあと：記録 → 画面
function finishAnswer(q, it) {
  it.revealed = false;
  it.done = true;
  Store.recordAnswer(q._key, it.ok);
  // 振り返りを全部解いたら、その項目は自動で読了にする（押し忘れ対策）
  if (state.mode === 'item' && allDone()) Store.setRead(q._item.id, true);
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
   6. 画面の切り替えとクリックの受付
   ============================================================ */
const VIEWS = ['view-home', 'view-item', 'view-quiz'];

function show(viewId) {
  VIEWS.forEach(id => { document.getElementById(id).hidden = (id !== viewId); });
  window.scrollTo(0, 0);
}

// 項目ページ左上の戻るボタン：ふだんは「‹ 目次」、問題から講義を見に来たときは「‹ 振り返り／復習」
function setItemBack(fromQuiz) {
  const old = document.querySelector('#view-item .back');
  const html = fromQuiz
    ? `<button type="button" class="back" data-action="return-quiz">‹ ${escapeHTML(state.title)}</button>`
    : `<a class="back" href="#toc">‹ 目次</a>`;
  old.outerHTML = html;
}

// 問題から講義へ移ったとき、戻り先の情報（アドレスを書き換えたか）を覚えておく
let lectureTrip = null;
let skipNextRoute = false;

// アドレスの # を見て、どの画面を出すか決める
function route() {
  if (skipNextRoute) { skipNextRoute = false; return; }
  lectureTrip = null;
  setItemBack(false);
  const hash = decodeURIComponent(location.hash.slice(1));
  if (/^\d+-\d+$/.test(hash)) {
    show('view-item');
    return renderItemPage(hash);
  }
  const tab = ['drill', 'review'].includes(hash) ? hash : 'toc';
  show('view-home');
  return renderHome(tab);
}

window.addEventListener('hashchange', route);

// ページ全体で1か所だけ「押された」を待ち受け、data-action を見て振り分ける
document.addEventListener('click', async function (event) {
  const sandhi = event.target.closest('ruby.sandhi');
  if (sandhi) { toggleSandhi(sandhi); return; }

  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  switch (el.dataset.action) {
    case 'speak': speak(el.dataset.text, Number(el.dataset.rate)); break;
    case 'toggle-pinyin': togglePinyin(el); break;
    case 'toggle-chapter': {
      const no = Number(el.dataset.no);
      if (openChapters.has(no)) openChapters.delete(no); else openChapters.add(no);
      renderHome('toc');
      break;
    }
    case 'toggle-read': {
      const id = el.dataset.item;
      Store.setRead(id, !Store.isRead(id));
      el.outerHTML = readButtonHTML(id);
      break;
    }
    case 'start-quiz': startItemQuiz(el.dataset.item); break;
    case 'start-review': startReview(); break;
    case 'start-drill': startDrill(el.dataset.drill); break;
    case 'toggle-drill-item': {
      const sel = selectionOf(await loadDrill(el.dataset.drill));
      if (sel.has(el.dataset.item)) sel.delete(el.dataset.item); else sel.add(el.dataset.item);
      renderHome('drill');
      break;
    }
    case 'drill-count': drillCount[el.dataset.drill] = Number(el.dataset.n); renderHome('drill'); break;
    case 'self-grade': selfGrade(el.dataset.ok === '1'); break;
    case 'export': exportRecords(); break;
    case 'import': importRecords(); break;
    case 'back': location.hash === state.back ? route() : (location.hash = state.back); break;
    case 'scroll': {                       // ページ内の移動（アドレスの # は画面の切り替え用に残しておく）
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
    case 'return-quiz': {
      // 問題の画面に戻る（答えた状態はそのまま）。アドレスも講義へ移る前に戻す
      const trip = lectureTrip;
      lectureTrip = null;
      if (trip && trip.pushed) { skipNextRoute = true; history.back(); }
      setItemBack(false);
      show('view-quiz');
      render();
      break;
    }
    case 'goto-lecture': {
      // その問題の項目ページを開き、該当するブロックまで移動する
      const itemHash = `#${el.dataset.item}`;
      const pushed = location.hash !== itemHash;
      if (pushed) history.pushState(null, '', itemHash);
      lectureTrip = { pushed: pushed, scroll: 0 };
      show('view-item');
      setItemBack(true);
      await renderItemPage(el.dataset.item);
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

// 最初に1回：音声の一覧を読み込ませておき、アドレスに合う画面を出す
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', findChineseVoice);
}
route();

// 日→中の入力欄：打った文字を覚えておく（ほかの問題へ移って戻っても消えないように）
document.addEventListener('input', function (event) {
  if (event.target.id === 'write-input' && typeof state.current === 'number') {
    state.items[state.current].text = event.target.value;
  }
});
