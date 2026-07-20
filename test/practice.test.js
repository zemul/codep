const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LEARNING_MODES,
  normalizeLearningMode,
  toggleLearningMode,
  prepareSessionWords,
  scheduleCardRepeat,
  cardResult,
  cardRatingForKey,
} = require("../src/practice");

test("旧设置或未知设置默认使用拼写强化", () => {
  assert.equal(normalizeLearningMode(undefined), LEARNING_MODES.SPELLING);
  assert.equal(normalizeLearningMode("unknown"), LEARNING_MODES.SPELLING);
  assert.equal(normalizeLearningMode("card"), LEARNING_MODES.CARD);
});

test("学习方式可以在两种模式间切换", () => {
  assert.equal(toggleLearningMode("spelling"), "card");
  assert.equal(toggleLearningMode("card"), "spelling");
});

test("不认识约三个词后重复，且最多重复两次", () => {
  const queue = prepareSessionWords([
    { word: "a" }, { word: "b" }, { word: "c" }, { word: "d" }, { word: "e" },
  ]);
  const word = queue[0];
  assert.equal(scheduleCardRepeat(queue, 0, word, "unknown"), true);
  assert.equal(queue[4].word, "a");
  assert.equal(scheduleCardRepeat(queue, 4, queue[4], "unknown"), true);
  let lastRepeatIndex = -1;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].word === "a") { lastRepeatIndex = i; break; }
  }
  assert.equal(scheduleCardRepeat(queue, lastRepeatIndex, queue[lastRepeatIndex], "unknown"), false);
});

test("认识的卡片不在本轮重复", () => {
  const queue = prepareSessionWords([{ word: "a" }]);
  assert.equal(scheduleCardRepeat(queue, 0, queue[0], "known"), false);
  assert.equal(queue.length, 1);
});

test("卡片评分映射为长期复习结果", () => {
  assert.equal(cardResult("known"), "card_known");
  assert.equal(cardResult("fuzzy"), "card_fuzzy");
  assert.equal(cardResult("unknown"), "card_unknown");
});

test("卡片数字键按认识、模糊、不认识排列", () => {
  assert.equal(cardRatingForKey("1"), "known");
  assert.equal(cardRatingForKey("2"), "fuzzy");
  assert.equal(cardRatingForKey("3"), "unknown");
  assert.equal(cardRatingForKey("4"), null);
});

test("卡片主键区使用 J、K、L 评分且兼容大写", () => {
  assert.equal(cardRatingForKey("j"), "known");
  assert.equal(cardRatingForKey("K"), "fuzzy");
  assert.equal(cardRatingForKey("l"), "unknown");
});
