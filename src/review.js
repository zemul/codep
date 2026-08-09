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
const { REVIEW_FILE, DICT_REGISTRY } = require("./config");
const { loadDict, resolveDictPath } = require("./storage");

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

// ─── 词库释义实时回查 ──────────────────────────────────────
// review.json 里存的 meaning/phonetic 只是「最后一次练习时看到的释义」快照，
// 不是真相。用户随时可能编辑词库文件（尤其是自己维护的生词本），所以展示前
// 一律回查词库。快照只在词库里索引不到这个词时才兜底。

// codep 常常在 tmux 里一挂就是好几天，所以缓存必须能在进程运行中失效，
// 否则只是把「永不更新」的问题从 review.json 挪进内存而已。

/** dictId -> { path, stamp, words: Map<word, entry> | null } */
const dictCache = new Map();

/**
 * 词库文件指纹。
 *
 * 用 statSync 而不是 lstatSync —— 词库可能是软链（作者的生词本就软链到
 * 笔记库），lstat 拿到的是软链自身的 mtime，创建之后永远不变，会做出一个
 * 看起来在失效、实际永不失效的缓存。
 *
 * 指纹里带 dev+ino：编辑器常用「写临时文件再 rename」保存，inode 会变而
 * mtime 未必动；带 mtimeNs：应对同一秒内的两次原地写入。
 *
 * @returns {string} 有效指纹，或文件不存在时的 "missing"（真实指纹形如 n:n:n:n，不会撞）
 * @returns {null} stat 本身失败（ELOOP / EACCES / ENOTDIR 等）——拿不到有效指纹
 */
function dictFileStamp(filePath) {
  try {
    const st = fs.statSync(filePath, { bigint: true, throwIfNoEntry: false });
    return st ? `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}` : "missing";
  } catch {
    // throwIfNoEntry 只压制 ENOENT，软链循环等仍会抛。
    return null;
  }
}

/** 取词库的 word -> entry 映射；未注册、加载失败或 stat 失败时返回 null。 */
function getDictWordMap(dictId) {
  const dictInfo = DICT_REGISTRY.find((d) => d.id === dictId);
  if (!dictInfo) return null; // 未注册的词库：不碰磁盘

  const filePath = resolveDictPath(dictInfo);
  const stamp = dictFileStamp(filePath);
  // stat 失败拿不到有效指纹，用任何合成哨兵缓存都会粘住到进程重启为止，
  // 正是本次要消灭的那类 bug。所以不写缓存，下次重试。
  if (stamp === null) return null;

  // path 也要比：覆盖词库从仓库根目录挪进 dicts/ 的情况。
  const cached = dictCache.get(dictId);
  if (cached && cached.path === filePath && cached.stamp === stamp) return cached.words;

  let words = null;
  try {
    words = new Map(loadDict(dictInfo).map((w) => [w.word, w]));
  } catch {
    words = null; // 文件缺失/损坏：退回快照
  }
  // 解析失败也按指纹缓存：文件修好后指纹会变，能自愈。
  dictCache.set(dictId, { path: filePath, stamp, words });
  return words;
}

/**
 * 清空词库缓存。
 * 目前只有测试用；将来若要加「重载词库」快捷键，也是走这里。
 */
function resetDictCache() {
  dictCache.clear();
}

/**
 * 合并复习卡片与词库条目，决定展示用的释义。
 *
 * 规则：词库里**还能索引到**这个词 → 展示一律以词库条目为准（哪怕释义为空，
 *       词库是唯一真相，拿旧翻译顶替等于对用户自己的数据撒谎）；
 *       索引不到（词被删除/改名，或条目缺 word 字段）→ 整体退回卡片里的历史快照。
 *
 * 采用「条目级」而非「字段级」覆盖：绝不把同一个词的两个版本混着显示，
 * 否则字段粒度上又会出现一个不会失效的旧值。
 *
 * @param {{word, meaning, phonetic, dictId}} card
 * @param {{word, meaning, phonetic}|null|undefined} dictEntry
 */
function mergeCardWithDict(card, dictEntry) {
  const source = dictEntry || card;
  return {
    word: card.word, // 身份永远来自卡片，不取词库条目的 word
    meaning: source.meaning ?? "",
    phonetic: source.phonetic ?? "",
    dictId: card.dictId,
  };
}

/** 一次调用内每个词库只解析一次，保证同一批词看到的是同一份词库版本。 */
function withFreshMeanings(cards) {
  const maps = new Map();
  for (const card of cards) {
    if (!maps.has(card.dictId)) maps.set(card.dictId, getDictWordMap(card.dictId));
  }
  return cards.map((card) => mergeCardWithDict(card, maps.get(card.dictId)?.get(card.word)));
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

// 排序权重：错误多的排前面，interval 短的排前面。
// totalMistakes 加 || 0 是一致性加固（与下面 initialWeakness / 错题排序的守卫一致）：
// codep 自己产生的卡片一定带这个字段，防的是手工编辑过的 review.json。
function duePriority(card) {
  return (card.totalMistakes || 0) * 10 + 1 / (card.interval || 1);
}

function isDueCard(card, dictId, todayStr) {
  return (!dictId || card.dictId === dictId) && card.nextReview <= todayStr;
}

function isMistakeCard(card, dictId) {
  return (!dictId || card.dictId === dictId) && initialWeakness(card) > 0;
}

/**
 * 纯函数：挑出到期的卡片并排序。不碰文件系统，便于测试。
 * @param {object} data - review.json 的内容
 * @param {string} [dictId] - 可选，限定某词库
 * @param {string} todayStr - "YYYY-MM-DD"
 */
function selectDueCards(data, dictId, todayStr) {
  return Object.values(data)
    .filter((card) => isDueCard(card, dictId, todayStr))
    .sort((a, b) => duePriority(b) - duePriority(a));
}

/** 纯函数：挑出薄弱词并排序。不碰文件系统，便于测试。 */
function selectMistakeCards(data, dictId) {
  return Object.values(data)
    .filter((card) => isMistakeCard(card, dictId))
    .sort(
      (a, b) =>
        initialWeakness(b) - initialWeakness(a) || (b.totalMistakes || 0) - (a.totalMistakes || 0)
    );
}

/**
 * 获取今天到期需要复习的词列表（释义实时取自词库）
 * @param {string} [dictId] - 可选，限定某词库
 * @returns {Array<{word, meaning, phonetic, dictId}>}
 */
function getDueWords(dictId) {
  return withFreshMeanings(selectDueCards(loadReviewData(), dictId, today()));
}

/**
 * 获取今日到期词数量。只做筛选，不回查词库
 * （菜单每次按方向键都会调用它，不该为了数个数去解析整个词库）。
 * @param {string} [dictId] - 可选，限定某词库
 * @returns {number}
 */
function getDueCount(dictId) {
  const todayStr = today();
  // 只数个数，不排序也不回查词库。
  return Object.values(loadReviewData()).filter((card) => isDueCard(card, dictId, todayStr)).length;
}

function initialWeakness(card) {
  if (typeof card.weaknessScore === "number") return card.weaknessScore;
  return (card.totalMistakes || 0) > 0 ? Math.min(3, card.totalMistakes) : 0;
}

/** 获取错题本词列表（释义实时取自词库） */
function getMistakeWords(dictId) {
  return withFreshMeanings(selectMistakeCards(loadReviewData(), dictId));
}

/** 获取错题数量。同 getDueCount，只数个数，不排序也不回查词库。 */
function getMistakeCount(dictId) {
  return Object.values(loadReviewData()).filter((card) => isMistakeCard(card, dictId)).length;
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

  // 兜底快照：万一以后这个词从词库里删了/改名了，复习界面还能显示它的含义
  // （卡片按 dictId:word 存且从不清理，没有快照就会拿着空释义永远来考你）。
  //
  // 这里必须用 || 而不是 ??，读和写是两条不同的规则：
  //   读（展示，见 mergeCardWithDict）= 说真话 → 词库为准，词库里是空的就显示空；
  //   写（这里）= 维护最后兜底 → 只在词库给出非空值时才升级快照。
  // 若这里改成 ??，词库某条目释义为空时会把历史快照冲成空字符串、永久丢失。
  card.meaning = wordObj.meaning || card.meaning;
  card.phonetic = wordObj.phonetic || card.phonetic;

  data[key] = card;
  saveReviewData(data);
}

/**
 * 获取单词的复习统计（返回原始卡片）
 *
 * ⚠️ 卡片里的 meaning/phonetic 是历史快照，可能早已过时，不要直接拿去展示。
 *    要展示释义请走 getDueWords / getMistakeWords，它们会回查词库。
 *
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

  // —— 测试接缝 ——
  // 纯函数，把「合并规则」和「筛选规则」从文件 I/O 里剥出来单独测。
  mergeCardWithDict,
  selectDueCards,
  selectMistakeCards,
  resetDictCache,
};
