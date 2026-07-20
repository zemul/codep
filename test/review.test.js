const test = require("node:test");
const assert = require("node:assert/strict");
const { calcNext, normalizeResult } = require("../src/review");

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
