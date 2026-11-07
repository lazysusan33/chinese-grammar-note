/*
  app.js ＝ 動き（押したら「何が起きるか」）

  このファイルの構成
    1. 問題データ      … 5問の中身（※フェーズ3で別ファイルに分離する予定）
    2. 小さな道具      … ルビを組み立てる、読み上げる、などの関数
    3. 画面の切り替え  … 項目ページ・問題・解説のどれを見せるか
    4. 問題の表示と判定
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
  return words.map(function (w) {
    if (typeof w === 'string') return w;
    return w.h || '';
  }).join('');
}

// 読み上げ：ブラウザに入っている音声合成を使う
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) {
      showToast('このブラウザは読み上げに対応していません');
      return;
    }
    window.speechSynthesis.cancel();                 // 読み上げ中なら止めてから
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.9;                                    // 少しゆっくり
    const voices = window.speechSynthesis.getVoices();
    const zh = voices.find(v => /^zh[-_]CN/i.test(v.lang)) || voices.find(v => /^zh/i.test(v.lang));
    if (zh) u.voice = zh;
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
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1A1A1A;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;line-height:1.6;z-index:10;max-width:90vw';
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
  const box = button.closest('.example, .quiz-body');
  const hiddenNow = box.classList.toggle('pinyin-hidden');
  button.setAttribute('aria-pressed', String(!hiddenNow));
  button.textContent = hiddenNow ? 'ピンインを表示' : 'ピンインを隠す';
  if (hiddenNow) box.querySelectorAll('.sandhi-note').forEach(n => { n.hidden = true; });
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
const views = ['view-item', 'view-quiz', 'view-feedback'];

function show(viewId) {
  views.forEach(id => { document.getElementById(id).hidden = (id !== viewId); });
  window.scrollTo(0, 0);
}

/* ============================================================
   4. 問題の表示と判定
   ============================================================ */

// いま何問目か、何問正解したか、などの「状態」
const state = { index: 0, score: 0, selected: null };

function startQuiz() {
  state.index = 0;
  state.score = 0;
  renderQuestion();
  show('view-quiz');
}

function renderQuestion() {
  const q = QUESTIONS[state.index];
  state.selected = null;
  document.getElementById('quiz-progress').textContent = `問${state.index + 1} / ${QUESTIONS.length}`;
  document.getElementById('quiz-bar').style.width = `${(state.index / QUESTIONS.length) * 100}%`;

  let html = `<p class="quiz-kind">8-1 完了の${r('了', 'le')} ・ ${q.kind}</p>`;
  html += `<p class="prompt-ja">${q.promptJa}</p>`;
  html += `<p lang="en" class="prompt-en">${q.promptEn}</p>`;

  if (q.type === 'reorder') {
    // 正解と同じ並びにならないように混ぜる
    let order;
    do { order = shuffle(q.tokens.map((_, i) => i)); } while (order.join() === q.answer.join());
    html += `<div class="answer-area" id="answer-area"></div>`;
    html += `<div class="token-pool" id="token-pool">` +
      order.map(i => `<button type="button" class="token" lang="zh-CN" data-action="token" data-id="${i}"><ruby>${q.tokens[i].h}<rt>${q.tokens[i].p}</rt></ruby></button>`).join('') +
      `</div>`;
    html += `<p class="note">カードを押すと上に並びます。並べたカードを押すと戻ります。</p>`;
  } else {
    if (q.sentence) html += `<p lang="zh-CN" class="zh-line big">${sentenceHTML(q.sentence)}</p>`;
    const cols = q.cols ? ` cols-${q.cols}` : '';
    html += `<div class="options${cols}">` + q.options.map(function (o, i) {
      let inner = '';
      if (o.zh) inner += `<span lang="zh-CN" class="zh-line">${sentenceHTML(o.zh)}</span><br>`;
      if (o.html) inner += o.html;
      if (o.ja) inner += `<span class="ja">${o.ja}</span>`;
      if (o.en) inner += `<span lang="en" class="en">${o.en}</span>`;
      return `<button type="button" class="option" data-action="option" data-index="${i}" aria-pressed="false">${inner}</button>`;
    }).join('') + `</div>`;
  }
  html += `<button type="button" class="small-button" data-action="toggle-pinyin" aria-pressed="false" style="align-self:flex-start">ピンインを表示</button>`;

  const body = document.getElementById('quiz-body');
  body.innerHTML = html;
  body.classList.add('pinyin-hidden');      // 問題のピンインは最初は隠す
  setupSandhi(body);
  updateCheckButton();
}

// 答え合わせボタンを押せるかどうか
function updateCheckButton() {
  const q = QUESTIONS[state.index];
  let ready;
  if (q.type === 'reorder') {
    ready = document.getElementById('token-pool').children.length === 0;   // 全部並べたら
  } else {
    ready = state.selected !== null;                                        // 1つ選んだら
  }
  document.getElementById('check-button').disabled = !ready;
}

// 並べ替えのカードを押したとき：置き場 ⇔ 並べる場所 を行き来する
function moveToken(button) {
  const area = document.getElementById('answer-area');
  const pool = document.getElementById('token-pool');
  if (button.parentElement === pool) area.appendChild(button);
  else pool.appendChild(button);
  updateCheckButton();
}

// 選択肢を押したとき
function pickOption(button) {
  document.querySelectorAll('#quiz-body .option').forEach(b => b.setAttribute('aria-pressed', 'false'));
  button.setAttribute('aria-pressed', 'true');
  state.selected = Number(button.dataset.index);
  updateCheckButton();
}

// 答え合わせ
function check() {
  const q = QUESTIONS[state.index];
  let ok, yourAnswer;
  if (q.type === 'reorder') {
    const ids = [...document.querySelectorAll('#answer-area .token')].map(b => Number(b.dataset.id));
    ok = ids.join() === q.answer.join();
    yourAnswer = ids.map(i => q.tokens[i].h).join('') + '。';
  } else {
    ok = state.selected === q.answerIndex;
    yourAnswer = q.options[state.selected].text;
  }
  if (ok) state.score++;
  renderFeedback(q, ok, yourAnswer);
  show('view-feedback');
}

function renderFeedback(q, ok, yourAnswer) {
  document.getElementById('feedback-progress').textContent = `問${state.index + 1} / ${QUESTIONS.length}`;
  let html = `<p class="result ${ok ? 'good' : 'bad'}">${ok ? '正解' : '不正解'}</p>`;
  if (!ok) {
    // 並べ替えの答えは中国語、選択式の答えは選択肢の文字（日本語のこともある）
    const lang = q.type === 'reorder' ? ' lang="zh-CN"' : '';
    html += `<div><p class="label">あなたの答え</p><p class="your-answer"${lang}>${yourAnswer}</p></div>`;
  }
  html += `<div><p class="label">正解</p>
    <p lang="zh-CN" class="zh-line big" style="padding-bottom:12px">${sentenceHTML(q.correct)}</p>
    <p class="ja">${q.ja}</p>
    <p lang="en" class="en">${q.en}</p>
    <div class="actions" style="margin-top:6px"><button type="button" data-action="speak" data-text="${plainText(q.correct)}">▶ 読み上げ</button></div>
  </div>`;
  html += `<div class="why"><p class="why-title">なぜ？</p><p>${q.why}</p>
    <button type="button" class="link" style="text-align:left;width:auto;padding:0" data-action="goto-lecture" data-target="${q.lecture}">講義の該当箇所を読む →</button></div>`;

  const body = document.getElementById('feedback-body');
  body.innerHTML = html;                     // 解説のピンインは常に表示
  setupSandhi(body);

  const next = document.getElementById('next-button');
  const last = state.index === QUESTIONS.length - 1;
  next.textContent = last ? '結果を見る' : '次の問題へ';
  next.dataset.action = 'next';
}

function next() {
  state.index++;
  if (state.index < QUESTIONS.length) {
    renderQuestion();
    show('view-quiz');
  } else {
    renderSummary();
  }
}

function renderSummary() {
  document.getElementById('feedback-progress').textContent = '結果';
  document.getElementById('feedback-body').innerHTML =
    `<p class="label">振り返り5問の結果</p>
     <p class="score">${QUESTIONS.length}問中 ${state.score}問 正解</p>
     <p class="note">間違えた問題は、解説から講義の該当箇所に戻って確認できます。</p>
     <button type="button" class="link" style="text-align:left;width:auto;padding:0" data-action="back-to-item">講義に戻る</button>`;
  const button = document.getElementById('next-button');
  button.textContent = 'もう一度解く';
  button.dataset.action = 'restart';
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
  if (!el) return;
  switch (el.dataset.action) {
    case 'speak': speak(el.dataset.text); break;
    case 'toggle-pinyin': togglePinyin(el); break;
    case 'start-quiz': startQuiz(); break;
    case 'back-to-item': show('view-item'); break;
    case 'token': moveToken(el); break;
    case 'option': pickOption(el); break;
    case 'check': check(); break;
    case 'next': next(); break;
    case 'restart': startQuiz(); break;
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

// 最初に1回：項目ページの声調変化を準備し、音声の一覧を読み込ませておく
setupSandhi(document.getElementById('view-item'));
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); };
}
