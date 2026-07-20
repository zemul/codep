const LEARNING_MODES = {
  CARD: "card",
  SPELLING: "spelling",
};

function normalizeLearningMode(mode) {
  return mode === LEARNING_MODES.CARD ? LEARNING_MODES.CARD : LEARNING_MODES.SPELLING;
}

function learningModeLabel(mode) {
  return normalizeLearningMode(mode) === LEARNING_MODES.CARD ? "快速认词" : "拼写强化";
}

function toggleLearningMode(mode) {
  return normalizeLearningMode(mode) === LEARNING_MODES.CARD
    ? LEARNING_MODES.SPELLING
    : LEARNING_MODES.CARD;
}

function createStats() {
  return {
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: 0,
    wordsCompleted: 0,
    cardKnown: 0,
    cardFuzzy: 0,
    cardUnknown: 0,
  };
}

function prepareSessionWords(words) {
  return words.map((word) => ({
    ...word,
    _session: { longTermRecorded: false, repeatCount: 0 },
  }));
}

/**
 * 将模糊/不认识的卡片重新插入本轮队列。
 * 不认识约 3 词后出现，模糊约 8 词后出现；每词最多重复两次。
 */
function scheduleCardRepeat(queue, currentIndex, currentWord, rating, maxRepeats = 2) {
  if (rating === "known" || !currentWord || !currentWord._session) return false;
  const meta = currentWord._session;
  if (meta.repeatCount >= maxRepeats) return false;

  meta.repeatCount++;
  const offset = rating === "unknown" ? 3 : 8;
  const insertAt = Math.min(queue.length, currentIndex + 1 + offset);
  queue.splice(insertAt, 0, { ...currentWord, _session: meta });
  return true;
}

function cardResult(rating) {
  if (rating === "known") return "card_known";
  if (rating === "fuzzy") return "card_fuzzy";
  return "card_unknown";
}

function cardRatingForKey(key) {
  const normalized = key.toLowerCase();
  if (normalized === "j" || normalized === "1") return "known";
  if (normalized === "k" || normalized === "2") return "fuzzy";
  if (normalized === "l" || normalized === "3") return "unknown";
  return null;
}

module.exports = {
  LEARNING_MODES,
  normalizeLearningMode,
  learningModeLabel,
  toggleLearningMode,
  createStats,
  prepareSessionWords,
  scheduleCardRepeat,
  cardResult,
  cardRatingForKey,
};
