/*
  store.js ＝ 学習記録（何を読み、どの問題に正解・不正解したか）と、復習の時期の計算

  ・記録はブラウザの中の保存場所（localStorage）に、1つの JSON として保存する
  ・Safari では、7日間このサイトを開かないと保存場所が消されることがある
    → ホーム画面に追加して使うと、この決まりの対象外になる
    → 念のため、記録をファイルに書き出して残せるようにしてある
  ・復習の時期は「ライトナー方式」で決める
      正解するたびに、次の復習までの間隔を 1日 → 3日 → 7日 → 14日 → 30日 と延ばす
      間違えたら（未回答も含む）、箱1に戻して翌日に復習する
*/
const Store = (function () {
  const KEY = 'chinese-grammar-note:v1';     // 保存場所での名前
  const INTERVALS = [1, 3, 7, 14, 30];       // 箱1〜箱5 の復習間隔（日）

  // 記録の形
  //   read:  { "8-1": "2026-11-10" }                   読了にした日
  //   cards: { "8-1/q1": { box: 2, due: "2026-11-13", history: [{ d: "2026-11-10", ok: true }] } }
  //   exportedAt: 最後に書き出した日
  function empty() { return { version: 1, read: {}, cards: {}, exportedAt: null }; }

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      return Object.assign(empty(), JSON.parse(raw));
    } catch (e) {
      return empty();                          // 保存場所が使えない・壊れているときは、空の記録で動く
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できなくても画面は動かす */ }
  }

  // 日付は「年-月-日」の文字列で扱う（時刻は使わない）。端末の地域の日付で数える
  function today() { return dateString(new Date()); }
  function dateString(d) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }
  function addDays(dayString, n) {
    const [y, m, d] = dayString.split('-').map(Number);
    return dateString(new Date(y, m - 1, d + n));
  }

  /* ---------- 読了 ---------- */
  function isRead(itemId) { return Boolean(data.read[itemId]); }
  function setRead(itemId, on) {
    if (on) data.read[itemId] = data.read[itemId] || today();
    else delete data.read[itemId];
    save();
  }

  /* ---------- 答えの記録と、次の復習日 ---------- */
  function recordAnswer(key, ok) {
    const card = data.cards[key] || { box: 0, due: null, history: [] };
    const t = today();
    card.history.push({ d: t, ok: ok });
    if (card.history.length > 50) card.history = card.history.slice(-50);   // 古すぎる履歴は捨てる
    if (ok) {
      card.box = Math.min(card.box + 1, INTERVALS.length);
      card.due = addDays(t, INTERVALS[card.box - 1]);
    } else {
      card.box = 1;
      card.due = addDays(t, 1);
    }
    data.cards[key] = card;
    save();
    return card;
  }

  function card(key) { return data.cards[key] || null; }

  // 復習に出すのは、項目の振り返りの問題だけ（記録の名前が「8-1/q1」の形のもの）。
  // 問題集の問題（「aspect/a101」など）は、v0.9 から復習に入れない。前に付いた記録も出さない
  function isReviewKey(k) { return /^\d+-\d+\//.test(k); }

  // 復習の時期が来た問題（期限が今日以前）
  function dueKeys() {
    const t = today();
    return Object.keys(data.cards).filter(k => isReviewKey(k) && data.cards[k].due && data.cards[k].due <= t).sort();
  }

  // まだ時期が来ていない中で、いちばん近い復習日と、その日の問題数
  function nextDue() {
    const t = today();
    const future = Object.keys(data.cards).filter(isReviewKey).map(k => data.cards[k].due).filter(d => d && d > t).sort();
    if (!future.length) return null;
    return { date: future[0], count: future.filter(d => d === future[0]).length };
  }

  /* ---------- 書き出しと読み込み ---------- */
  function exportText() {
    data.exportedAt = today();
    save();
    return JSON.stringify(data, null, 2);
  }

  function importText(text) {
    const obj = JSON.parse(text);                       // 読めなければここで誤りになる
    if (!obj || obj.version !== 1 || typeof obj.cards !== 'object' || typeof obj.read !== 'object') {
      throw new Error('この記録ファイルの形が違います');
    }
    data = Object.assign(empty(), obj);
    save();
  }

  function exportedAt() { return data.exportedAt; }
  function hasAny() { return Object.keys(data.cards).length > 0 || Object.keys(data.read).length > 0; }

  return { today, isRead, setRead, recordAnswer, card, dueKeys, nextDue, exportText, importText, exportedAt, hasAny, INTERVALS };
})();
