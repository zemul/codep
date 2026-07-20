/**
 * 间隔复习系统 — 基于 SM-2 算法
 * 
 * 词的生命周期：
 *   新词(new) → 学习中(learning) → 复习中(review)
 *   答错时 → 回到 learning，短间隔重复
 * 
 * 结果类型兼容旧的 correct/peeked/wrong，并支持 card_* / spelling_*。
 */

const fs = require("fs");
const { REVIEW_FILE } = require("./config");

// SM-2 参数
const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const EASE_BONUS_CORRECT = 0.1;
const EASE_PENALTY_WRONG = 0.2;
const EASE_PENALTY_PEEKED = 0.1;

function normalizeResult(result) {
  const mapping = {
    correct: "correct",
    peeked: "peeked",
    wrong: "wrong",
    spelling_correct: "correct",
    spelling_peeked: "peeked",
    spelling_wrong: "wrong",
    card_known: "card_known",
    card_fuzzy: "peeked",
    card_unknown: "wrong",
  };
  return mapping[result] || "wrong";
}

// ─── 数据读写 ────────────────────────────────────────────

function loadReviewData() {
  try {
    if (fs.existsSync(REVIEW_FILE)) {
      return JSON.parse(fs.readFileSync(REVIEW_FILE, "utf-8"));
    }
  } catch (e) {}
  return {};
}

function saveReviewData(data) {
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(data, null, 2));
}

// ─── 日期工具 ────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10); // "2026-07-20"
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isDue(dateStr) {
  return dateStr <= today();
}

// ─── SM-2 核心算法 ───────────────────────────────────────

/**
 * 计算下一次复习的间隔和参数
 * @param {object} card - 当前卡片状态
 * @param {string} result - "correct" | "peeked" | "wrong"
 * @returns {object} 更新后的卡片状态
 */
function calcNext(card, result) {
  let { interval, ease, repetitions } = card;
  const normalized = normalizeResult(result);

  if (normalized === "correct" || normalized === "card_known") {
    repetitions++;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 3;
    } else {
      const recognitionWeight = normalized === "card_known" ? 0.8 : 1;
      interval = Math.max(1, Math.round(interval * ease * recognitionWeight));
    }
    // 认词正确比直接拼写正确更保守，不奖励 ease。
    if (normalized === "correct") {
      ease = Math.min(MAX_EASE, ease + EASE_BONUS_CORRECT);
    }
  } else if (normalized === "peeked") {
    // 偷看后拼对：不增加 repetitions，interval 不变或轻微增长
    // 但 ease 下降，下次增长会更慢
    if (repetitions > 0 && interval > 1) {
      // 已经在复习中的词：interval 不变，下次还是同样间隔再来
      // 不增加 repetitions
    } else {
      // 新词或 learning 阶段：给 1 天间隔
      interval = 1;
      repetitions = Math.max(repetitions, 1);
    }
    ease = Math.max(MIN_EASE, ease - EASE_PENALTY_PEEKED);
  } else {
    // wrong：重置
    repetitions = 0;
    interval = 1;
    ease = Math.max(MIN_EASE, ease - EASE_PENALTY_WRONG);
  }

  const nextReview = addDays(today(), interval);

  return { interval, ease, repetitions, nextReview };
}

// ─── 对外接口 ────────────────────────────────────────────

/**
 * 获取今天到期需要复习的词列表
 * @param {string} [dictId] - 可选，限定某词库
 * @returns {Array<{word, meaning, phonetic, dictId}>}
 */
function getDueWords(dictId) {
  const data = loadReviewData();
  const due = [];

  for (const [key, card] of Object.entries(data)) {
    if (dictId && card.dictId !== dictId) continue;
    if (isDue(card.nextReview)) {
      due.push({
        word: card.word,
        meaning: card.meaning || "",
        phonetic: card.phonetic || "",
        dictId: card.dictId,
        _key: key,
        // 排序用：错误多的排前面，interval 短的排前面
        _priority: card.totalMistakes * 10 + (1 / (card.interval || 1)),
      });
    }
  }

  // 按优先级排序：错误多的 + 间隔短的优先
  due.sort((a, b) => b._priority - a._priority);

  return due.map(({ _key, _priority, ...rest }) => rest);
}

/**
 * 获取今日到期词数量
 * @param {string} [dictId] - 可选，限定某词库
 * @returns {number}
 */
function getDueCount(dictId) {
  const data = loadReviewData();
  let count = 0;
  for (const card of Object.values(data)) {
    if (dictId && card.dictId !== dictId) continue;
    if (isDue(card.nextReview)) count++;
  }
  return count;
}

function initialWeakness(card) {
  if (typeof card.weaknessScore === "number") return card.weaknessScore;
  return (card.totalMistakes || 0) > 0 ? Math.min(3, card.totalMistakes) : 0;
}

function getMistakeWords(dictId) {
  const data = loadReviewData();
  return Object.values(data)
    .filter((card) => (!dictId || card.dictId === dictId) && initialWeakness(card) > 0)
    .sort((a, b) => initialWeakness(b) - initialWeakness(a) || (b.totalMistakes || 0) - (a.totalMistakes || 0))
    .map((card) => ({
      word: card.word,
      meaning: card.meaning || "",
      phonetic: card.phonetic || "",
      dictId: card.dictId,
    }));
}

function getMistakeCount(dictId) {
  return getMistakeWords(dictId).length;
}

/**
 * 记录练习结果
 * @param {{word, meaning, phonetic}} wordObj - 单词对象
 * @param {string} dictId - 词库ID
 * @param {string} result - "correct" | "peeked" | "wrong"
 */
function recordResult(wordObj, dictId, result) {
  const data = loadReviewData();
  const key = `${dictId}:${wordObj.word}`;

  let card = data[key] || {
    word: wordObj.word,
    meaning: wordObj.meaning || "",
    phonetic: wordObj.phonetic || "",
    dictId: dictId,
    interval: 0,
    ease: INITIAL_EASE,
    repetitions: 0,
    nextReview: today(),
    totalMistakes: 0,
    totalReviews: 0,
    lastReview: null,
  };

  // 更新统计
  card.totalReviews++;
  card.lastReview = today();
  let weakness = initialWeakness(card);
  const normalized = normalizeResult(result);
  if (normalized === "wrong") card.totalMistakes++;

  if (result === "card_unknown" || result === "spelling_wrong" || result === "wrong") weakness += 2;
  else if (result === "card_fuzzy" || result === "spelling_peeked" || result === "peeked") weakness += 1;
  else if (result === "spelling_correct" || result === "correct") weakness -= 2;
  else if (result === "card_known") weakness -= 1;
  card.weaknessScore = Math.max(0, Math.min(10, weakness));
  card.lastMode = typeof result === "string" && result.startsWith("card_") ? "card" : "spelling";

  // SM-2 计算
  const next = calcNext(card, result);
  card.interval = next.interval;
  card.ease = next.ease;
  card.repetitions = next.repetitions;
  card.nextReview = next.nextReview;

  // 更新 meaning/phonetic（词库可能更新过）
  card.meaning = wordObj.meaning || card.meaning;
  card.phonetic = wordObj.phonetic || card.phonetic;

  data[key] = card;
  saveReviewData(data);
}

/**
 * 获取单词的复习统计
 * @param {string} word
 * @param {string} dictId
 * @returns {object|null}
 */
function getWordStats(word, dictId) {
  const data = loadReviewData();
  const key = `${dictId}:${word}`;
  return data[key] || null;
}

/**
 * 获取总体统计信息
 * @returns {{totalLearned, mastered, dueToday, dueTomorrow}}
 */
function getOverallStats() {
  const data = loadReviewData();
  const t = today();
  let totalLearned = 0;
  let mastered = 0;
  let dueToday = 0;
  let dueTomorrow = 0;

  const tomorrow = addDays(t, 1);

  for (const card of Object.values(data)) {
    totalLearned++;
    if (card.interval >= 7) mastered++; // 间隔>=7天视为已掌握
    if (card.nextReview <= t) dueToday++;
    else if (card.nextReview <= tomorrow) dueTomorrow++;
  }

  return { totalLearned, mastered, dueToday, dueTomorrow };
}

module.exports = {
  loadReviewData,
  saveReviewData,
  getDueWords,
  getDueCount,
  getMistakeWords,
  getMistakeCount,
  recordResult,
  getWordStats,
  getOverallStats,
  today,
  calcNext,
  normalizeResult,
};
