const test = require("node:test");
const assert = require("node:assert/strict");
const { displayWidth, truncateDisplay, centerPad } = require("./terminal");

test("终端宽度按中文双列、英文单列计算", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("中文"), 4);
  assert.equal(displayWidth("abc中文"), 7);
});

test("中文释义按显示宽度截断", () => {
  const result = truncateDisplay("这是一个很长的中文释义", 11);
  assert.equal(displayWidth(result), 11);
  assert.ok(result.endsWith("..."));
});

test("居中使用终端显示宽度", () => {
  assert.equal(centerPad("中文", 20), 8);
  assert.equal(centerPad("abcd", 20), 8);
});
