const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { ROOT_DIR, DICTS_DIR, DICT_REGISTRY, CHAPTER_LENGTH } = require("../src/config");
const { loadDict, getChapterWords } = require("../src/storage");

test("源码迁移后仍从仓库根目录加载词库", () => {
  assert.equal(ROOT_DIR, path.resolve(__dirname, ".."));
  assert.equal(DICTS_DIR, path.join(ROOT_DIR, "dicts"));

  const words = loadDict(DICT_REGISTRY[0]);
  assert.ok(words.length > CHAPTER_LENGTH);
  assert.equal(getChapterWords(words, 0).length, CHAPTER_LENGTH);
  assert.equal(typeof words[0].word, "string");
});
