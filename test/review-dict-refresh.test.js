/**
 * 词库释义实时回查的集成测试。
 *
 * 覆盖的 bug：review.json 里存的 meaning 只是练习当时的快照，编辑词库文件后
 * 「今日复习」/「错题本」一直显示旧释义。
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// ⚠️ 顺序敏感：config.js 在 require 的那一刻就算好了 DATA_DIR，
//    所以这两行必须在 require 任何 src/ 模块之前执行。
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "codep-data-"));
process.env.CODEP_DATA_DIR = DATA_DIR;

const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const { DICT_REGISTRY, REVIEW_FILE } = require("../src/config");
const { loadDict } = require("../src/storage");

// 上面那条注释靠人遵守是不够的：一旦有人（或 import 排序工具）把某个
// src/ 的 require 提到设置环境变量之前，这些测试会照常全绿，同时把跑测试
// 的人真实的 review.json 连同全部复习进度覆盖掉。这里硬断言一下。
assert.ok(
  REVIEW_FILE.startsWith(DATA_DIR),
  "CODEP_DATA_DIR 必须在 require 任何 src/ 模块之前设置，否则测试会写坏真实的 review.json"
);
const {
  getDueWords,
  getDueCount,
  getMistakeWords,
  getMistakeCount,
  saveReviewData,
  loadReviewData,
  recordResult,
} = require("../src/review");

// ─── 临时词库 ────────────────────────────────────────────
// DICTS_DIR 由 __dirname 推导、无法重定向，所以用绝对路径的 file 注册临时词库
// （这依赖 resolveDictPath 用 path.resolve 而不是 path.join）。
const DICT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "codep-dict-"));
const DICT_FILE = path.join(DICT_DIR, "test-vocab.json");
const ALT_FILE = path.join(DICT_DIR, "alt-vocab.json");
const TEST_DICT = { id: "__test", name: "测试词库", file: DICT_FILE, description: "" };
const ALT_DICT = { id: "__alt", name: "另一个测试词库", file: ALT_FILE, description: "" };
DICT_REGISTRY.push(TEST_DICT, ALT_DICT);

after(() => {
  DICT_REGISTRY.splice(DICT_REGISTRY.indexOf(TEST_DICT), 1);
  DICT_REGISTRY.splice(DICT_REGISTRY.indexOf(ALT_DICT), 1);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.rmSync(DICT_DIR, { recursive: true, force: true });
});

// 显式推进 mtime，避免文件系统时间戳精度导致的偶发失败。
// 这也是测试之间不需要手动清词库缓存的原因：指纹变了就会自然失效。
let clock = Date.now();
function writeDict(entries, file = DICT_FILE) {
  fs.writeFileSync(file, JSON.stringify(entries));
  clock += 2000;
  fs.utimesSync(file, new Date(clock), new Date(clock));
}

function dueCard(overrides = {}) {
  return {
    word: "alpha",
    meaning: "历史快照",
    phonetic: "",
    dictId: "__test",
    interval: 1,
    ease: 2.5,
    repetitions: 1,
    nextReview: "2000-01-01", // 永远到期
    totalMistakes: 1,
    totalReviews: 1,
    weaknessScore: 3, // 同时进错题本
    lastReview: null,
    ...overrides,
  };
}

// ─── 主线：编辑词库后释义要刷新 ──────────────────────────

test("编辑词库文件后今日复习显示新释义", () => {
  writeDict([{ name: "alpha", trans: ["第一版释义"] }]);
  saveReviewData({ "__test:alpha": dueCard() });

  assert.equal(getDueWords()[0].meaning, "第一版释义");

  // 注意：这里故意不调 resetDictCache，模拟用户在 codep 运行期间编辑词库。
  writeDict([{ name: "alpha", trans: ["第二版释义"] }]);
  assert.equal(getDueWords()[0].meaning, "第二版释义");
});

test("编辑词库文件后错题本显示新释义", () => {
  writeDict([{ name: "alpha", trans: ["错题第一版"] }]);
  saveReviewData({ "__test:alpha": dueCard() });

  assert.equal(getMistakeWords()[0].meaning, "错题第一版");

  writeDict([{ name: "alpha", trans: ["错题第二版"] }]);
  assert.equal(getMistakeWords()[0].meaning, "错题第二版");
});

test("进程运行中编辑词库会让缓存失效", () => {
  writeDict([{ name: "alpha", trans: ["旧"] }]);
  saveReviewData({ "__test:alpha": dueCard() });
  getDueWords(); // 先把缓存填上

  writeDict([{ name: "alpha", trans: ["新"] }]);
  assert.equal(getDueWords()[0].meaning, "新");
});

test("词库文件时间戳未变时复用缓存", () => {
  writeDict([{ name: "alpha", trans: ["AAA"] }]);
  saveReviewData({ "__test:alpha": dueCard() });
  assert.equal(getDueWords()[0].meaning, "AAA");

  // 同字节长度改写内容，再把 mtime/atime 还原 —— 指纹完全不变。
  const stampBefore = fs.statSync(DICT_FILE);
  fs.writeFileSync(DICT_FILE, JSON.stringify([{ name: "alpha", trans: ["BBB"] }]));
  fs.utimesSync(DICT_FILE, stampBefore.atime, stampBefore.mtime);
  assert.equal(getDueWords()[0].meaning, "AAA", "指纹没变时应命中缓存，不重新解析");

  // 这是指纹策略已知的盲区，mtime 一动就恢复正常。
  clock += 2000;
  fs.utimesSync(DICT_FILE, new Date(clock), new Date(clock));
  assert.equal(getDueWords()[0].meaning, "BBB");
});

test("多个词库混在同一批到期词里各取各的释义", () => {
  writeDict([{ name: "alpha", trans: ["主词库释义"] }]);
  writeDict([{ name: "beta", trans: ["副词库释义"] }], ALT_FILE);
  saveReviewData({
    "__test:alpha": dueCard({ word: "alpha", dictId: "__test" }),
    "__alt:beta": dueCard({ word: "beta", dictId: "__alt" }),
  });

  const byWord = Object.fromEntries(getDueWords().map((w) => [w.word, w.meaning]));
  assert.deepEqual(byWord, { alpha: "主词库释义", beta: "副词库释义" });
});

// ─── 快照写回：读写规则不对称 ────────────────────────────

test("练习后快照写回的是词库新释义", () => {
  writeDict([{ name: "alpha", trans: ["词库新释义"] }]);
  saveReviewData({ "__test:alpha": dueCard({ meaning: "历史快照" }) });

  recordResult(getDueWords()[0], "__test", "correct");
  assert.equal(loadReviewData()["__test:alpha"].meaning, "词库新释义");
});

test("词库释义为空时不覆盖已有快照", () => {
  // 展示要说真话（显示空），但快照是词被删除后的唯一兜底，不能被空值冲掉。
  writeDict([{ name: "alpha", trans: [""] }]);
  saveReviewData({ "__test:alpha": dueCard({ meaning: "历史快照", phonetic: "/旧音标/" }) });

  const shown = getDueWords()[0];
  assert.equal(shown.meaning, "", "展示：词库为准");
  assert.equal(shown.phonetic, "", "展示：词库为准");

  recordResult(shown, "__test", "correct");
  const saved = loadReviewData()["__test:alpha"];
  assert.equal(saved.meaning, "历史快照", "落盘：保留兜底");
  assert.equal(saved.phonetic, "/旧音标/", "落盘：音标同样保留兜底");
});

// ─── 退化路径：都不能崩，都退回快照 ──────────────────────

test("词库里已删除的词退回卡片快照", () => {
  writeDict([]);
  saveReviewData({ "__test:alpha": dueCard({ meaning: "历史快照" }) });
  assert.equal(getDueWords()[0].meaning, "历史快照");
});

test("未注册的词库 id 直接退回快照", () => {
  saveReviewData({ "__nope:alpha": dueCard({ dictId: "__nope", meaning: "历史快照" }) });
  assert.equal(getDueWords()[0].meaning, "历史快照");
});

test("卡片缺少 dictId 时退回快照", () => {
  saveReviewData({ "undefined:alpha": dueCard({ dictId: undefined, meaning: "历史快照" }) });
  assert.equal(getDueWords()[0].meaning, "历史快照");
});

test("词库文件损坏时不崩溃并退回快照", () => {
  saveReviewData({ "__test:alpha": dueCard({ meaning: "历史快照" }) });
  fs.writeFileSync(DICT_FILE, "{ 这不是合法 JSON");
  clock += 2000;
  fs.utimesSync(DICT_FILE, new Date(clock), new Date(clock));

  assert.equal(getDueWords()[0].meaning, "历史快照");
});

test("注册了但文件不存在时不崩溃", () => {
  // 这是每个新 clone 的默认状态：coca20000.json 被 gitignore 且不在仓库里；
  // 软链词库的目标不可达时也是这个分支。
  saveReviewData({ "__test:alpha": dueCard({ meaning: "历史快照" }) });
  fs.rmSync(DICT_FILE, { force: true });

  assert.equal(getDueWords()[0].meaning, "历史快照");
});

test("词库是软链时改目标文件也要刷新释义", () => {
  // 钉住 statSync 而不是 lstatSync：软链自身的 mtime 创建后永不改变，
  // 用 lstat 会做出一个看起来在失效、实际永不失效的缓存。
  const target = path.join(DICT_DIR, "link-target.json");
  const link = path.join(DICT_DIR, "link.json");
  writeDict([{ name: "alpha", trans: ["软链旧"] }], target);
  fs.symlinkSync(target, link);

  const linkDict = { id: "__link", name: "软链词库", file: link, description: "" };
  DICT_REGISTRY.push(linkDict);
  try {
    saveReviewData({ "__link:alpha": dueCard({ dictId: "__link" }) });
    assert.equal(getDueWords()[0].meaning, "软链旧");

    // 只改软链指向的真实文件，软链自身完全没动
    writeDict([{ name: "alpha", trans: ["软链新"] }], target);
    assert.equal(getDueWords()[0].meaning, "软链新");
  } finally {
    DICT_REGISTRY.splice(DICT_REGISTRY.indexOf(linkDict), 1);
  }
});

test("stat 失败时退回快照而不是继续用旧缓存", () => {
  // 软链循环会让 statSync 抛 ELOOP（throwIfNoEntry 只压制 ENOENT）。
  // 这种情况拿不到有效指纹，既不能崩，也不能拿上一次的缓存继续顶着 ——
  // 拿不到指纹就无从判断缓存是否还有效，只能退回快照。
  const loopA = path.join(DICT_DIR, "loop-a.json");
  const loopB = path.join(DICT_DIR, "loop-b.json");
  const loopDict = { id: "__loop", name: "循环软链", file: loopA, description: "" };
  DICT_REGISTRY.push(loopDict);
  try {
    // 先正常加载一次，把缓存填上
    writeDict([{ name: "alpha", trans: ["词库版本"] }], loopA);
    saveReviewData({ "__loop:alpha": dueCard({ dictId: "__loop", meaning: "历史快照" }) });
    assert.equal(getDueWords()[0].meaning, "词库版本");

    // 再把这个路径换成软链循环，让 stat 抛错
    fs.unlinkSync(loopA);
    fs.symlinkSync(loopB, loopA);
    fs.symlinkSync(loopA, loopB);
    assert.equal(getDueWords()[0].meaning, "历史快照", "stat 抛错：退回快照，不沿用旧缓存");

    // 换回真文件；注意这里不调 resetDictCache
    fs.unlinkSync(loopA);
    fs.unlinkSync(loopB);
    writeDict([{ name: "alpha", trans: ["修好了"] }], loopA);
    assert.equal(getDueWords()[0].meaning, "修好了", "恢复后应自愈，无需重启");
  } finally {
    DICT_REGISTRY.splice(DICT_REGISTRY.indexOf(loopDict), 1);
  }
});

test("数量接口与列表接口结果一致", () => {
  // 两者过去是同一份代码，现在拆成了两个独立调用点，容易悄悄漂移。
  writeDict([{ name: "alpha", trans: ["x"] }]);
  saveReviewData({
    "__test:alpha": dueCard({ word: "alpha" }),
    "__test:beta": dueCard({ word: "beta", weaknessScore: 0, totalMistakes: 0 }),
    "__test:gamma": dueCard({ word: "gamma", nextReview: "2099-01-01" }),
  });

  assert.equal(getDueCount(), getDueWords().length);
  assert.equal(getMistakeCount(), getMistakeWords().length);
  assert.equal(getDueCount("__test"), getDueWords("__test").length);
});

test("章节练习读到的是词库最新内容", () => {
  // 钉住 loadDict 保持无缓存，review 的缓存不会污染章节路径。
  writeDict([{ name: "alpha", trans: ["章节旧"] }]);
  assert.equal(loadDict(TEST_DICT)[0].meaning, "章节旧");

  writeDict([{ name: "alpha", trans: ["章节新"] }]);
  assert.equal(loadDict(TEST_DICT)[0].meaning, "章节新");
});
