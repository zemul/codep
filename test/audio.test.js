const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { getAudioPath } = require("../src/audio");
const { AUDIO_CACHE_DIR } = require("../src/config");

test("词条含路径分隔符时不会拼出缓存目录之外的路径", () => {
  // 自定义词库允许任意词条名，"contort / distort" 这类会被当成子目录，写入时抛 ENOENT。
  for (const word of ["contort / distort", "x/../../etc/passwd", "a..b", "don't"]) {
    assert.equal(path.dirname(getAudioPath(word)), AUDIO_CACHE_DIR, `${word} 逃出了缓存目录`);
  }
});

test("普通单词的缓存文件名保持不变", () => {
  assert.equal(path.basename(getAudioPath("hello")), "hello.mp3");
});
