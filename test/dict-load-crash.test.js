const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { tryLoadDict } = require("../src/storage");

test("词库文件缺失时返回 null 而不是抛异常", () => {
  assert.equal(tryLoadDict({ id: "gone", file: "definitely-not-here.json" }), null);
});

test("词库文件损坏时返回 null 而不是抛异常", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codep-broken-dict-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "broken.json");
  fs.writeFileSync(file, "{not json");

  assert.equal(tryLoadDict({ id: "broken", file }), null);
});

test("词库正常时返回和 loadDict 一样的结果", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codep-ok-dict-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "ok.json");
  fs.writeFileSync(file, JSON.stringify([{ name: "algorithm", trans: ["n. 算法"] }]));

  assert.deepEqual(tryLoadDict({ id: "ok", file }), [{ word: "algorithm", meaning: "n. 算法", phonetic: "" }]);
});
