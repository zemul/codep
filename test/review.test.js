const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calcNext,
  normalizeResult,
  mergeCardWithDict,
  selectDueCards,
  selectMistakeCards,
} = require("../src/review");

function card(overrides = {}) {
  return { interval: 3, ease: 2.5, repetitions: 2, ...overrides };
}

test("兼容旧评分并识别新评分", () => {
  assert.equal(normalizeResult("correct"), "correct");
  assert.equal(normalizeResult("spelling_correct"), "correct");
  assert.equal(normalizeResult("card_fuzzy"), "peeked");
  assert.equal(normalizeResult("card_unknown"), "wrong");
});

test("卡片认识比直接拼写正确的间隔增长更保守", () => {
  const spelling = calcNext(card(), "spelling_correct");
  const recognition = calcNext(card(), "card_known");
  assert.ok(recognition.interval < spelling.interval);
  assert.equal(recognition.ease, 2.5);
  assert.equal(spelling.ease, 2.6);
});

test("模糊保持较短间隔，不认识重置", () => {
  const fuzzy = calcNext(card(), "card_fuzzy");
  const unknown = calcNext(card(), "card_unknown");
  assert.equal(fuzzy.interval, 3);
  assert.equal(fuzzy.repetitions, 2);
  assert.equal(unknown.interval, 1);
  assert.equal(unknown.repetitions, 0);
});

// ─── 释义合并规则 ────────────────────────────────────────

function reviewCard(overrides = {}) {
  return {
    word: "prowl",
    meaning: "旧释义",
    phonetic: "/praʊl/",
    dictId: "own",
    nextReview: "2026-01-01",
    interval: 3,
    totalMistakes: 0,
    ...overrides,
  };
}

test("词库里还有这个词时以词库释义为准", () => {
  const merged = mergeCardWithDict(reviewCard(), { word: "prowl", meaning: "新释义", phonetic: "/p/" });
  assert.equal(merged.meaning, "新释义");
  assert.equal(merged.phonetic, "/p/");
});

test("词库条目释义为空时展示为空", () => {
  // 词库是唯一真相：用户把释义清空了就显示空，不能拿旧快照顶替。
  const merged = mergeCardWithDict(reviewCard(), { word: "prowl", meaning: "", phonetic: "" });
  assert.equal(merged.meaning, "");
});

test("词库里索引不到的词退回卡片快照", () => {
  const merged = mergeCardWithDict(reviewCard(), undefined);
  assert.equal(merged.meaning, "旧释义");
  assert.equal(merged.phonetic, "/praʊl/");
});

test("词库条目没有音标字段时展示为空音标", () => {
  // 钉住「条目级」而非「字段级」覆盖：不把同一个词的两个版本混着显示。
  // 注：现有词库文件都是 {name,trans} 走规范化分支、三个键齐全，产生不了这种形状，
  // 这里防的是将来新增的词库格式。
  const merged = mergeCardWithDict(reviewCard(), { word: "prowl", meaning: "新释义" });
  assert.equal(merged.phonetic, "");
});

test("合并结果始终使用卡片的 word 和 dictId", () => {
  const merged = mergeCardWithDict(reviewCard(), { word: "别的词", meaning: "新释义" });
  assert.equal(merged.word, "prowl");
  assert.equal(merged.dictId, "own");
});

test("合并结果只含四个展示字段", () => {
  // _key / _priority 这类内部字段会被 practice.js 原样 spread 进会话对象，泄漏了看不出来。
  const merged = mergeCardWithDict(reviewCard({ totalReviews: 9 }), undefined);
  assert.deepEqual(Object.keys(merged), ["word", "meaning", "phonetic", "dictId"]);
});

// ─── 到期与错题筛选 ──────────────────────────────────────

test("到期筛选按错误次数和间隔排序", () => {
  const data = {
    "own:a": reviewCard({ word: "a", totalMistakes: 0, interval: 10 }),
    "own:b": reviewCard({ word: "b", totalMistakes: 3, interval: 10 }),
    // 缺 totalMistakes：codep 自己产生不了，防的是手工编辑过的 review.json
    "own:c": reviewCard({ word: "c", totalMistakes: undefined, interval: 1 }),
  };
  const order = selectDueCards(data, undefined, "2026-08-09").map((c) => c.word);
  assert.deepEqual(order, ["b", "c", "a"]);
});

test("未来到期的词不进入今日复习", () => {
  const data = {
    "own:today": reviewCard({ word: "today", nextReview: "2026-08-09" }),
    "own:future": reviewCard({ word: "future", nextReview: "2026-08-10" }),
  };
  const words = selectDueCards(data, undefined, "2026-08-09").map((c) => c.word);
  assert.deepEqual(words, ["today"]); // 边界：当天到期算到期
});

test("错题本排除薄弱度为零的词并按薄弱度排序", () => {
  const data = {
    "own:clean": reviewCard({ word: "clean", weaknessScore: 0 }),
    "own:weak": reviewCard({ word: "weak", weaknessScore: 5 }),
    "own:mid": reviewCard({ word: "mid", weaknessScore: 2 }),
    // 老卡片没有 weaknessScore，由 totalMistakes 推出薄弱度
    "own:legacy": reviewCard({ word: "legacy", weaknessScore: undefined, totalMistakes: 1 }),
  };
  const order = selectMistakeCards(data).map((c) => c.word);
  assert.deepEqual(order, ["weak", "mid", "legacy"]);
});

test("按词库 id 过滤到期词和错题词", () => {
  const data = {
    "own:a": reviewCard({ word: "a", dictId: "own", weaknessScore: 3 }),
    "cet4:b": reviewCard({ word: "b", dictId: "cet4", weaknessScore: 3 }),
  };
  assert.deepEqual(selectDueCards(data, "own", "2026-08-09").map((c) => c.word), ["a"]);
  assert.deepEqual(selectMistakeCards(data, "cet4").map((c) => c.word), ["b"]);
});
