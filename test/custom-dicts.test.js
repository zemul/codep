const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { discoverCustomDicts, isSupportedDict } = require("../src/custom-dicts");

test("自动发现用户目录中的自定义词库", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codep-custom-dicts-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(directory, "developer-english.json"),
    JSON.stringify([{ name: "algorithm", trans: ["n. 算法"] }])
  );

  assert.deepEqual(discoverCustomDicts([directory]), [{
    id: "developer-english",
    name: "developer-english",
    file: path.join(directory, "developer-english.json"),
    description: "1 词 (自定义)",
    custom: true,
  }]);
});

test("用户目录优先于旧安装目录中的同名词库", (t) => {
  const userDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codep-user-dicts-"));
  const legacyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codep-legacy-dicts-"));
  t.after(() => {
    fs.rmSync(userDirectory, { recursive: true, force: true });
    fs.rmSync(legacyDirectory, { recursive: true, force: true });
  });
  const words = JSON.stringify([{ name: "cache", trans: ["n. 缓存"] }]);
  fs.writeFileSync(path.join(userDirectory, "mine.json"), words);
  fs.writeFileSync(path.join(legacyDirectory, "mine.json"), words);

  const [dict] = discoverCustomDicts([userDirectory, legacyDirectory]);
  assert.equal(dict.file, path.join(userDirectory, "mine.json"));
});

test("忽略损坏、格式错误及与内置 ID 重名的文件", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codep-invalid-dicts-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "broken.json"), "{broken");
  fs.writeFileSync(path.join(directory, "empty.json"), "[]");
  fs.writeFileSync(path.join(directory, "cet4.json"), JSON.stringify([{ name: "x" }]));

  assert.deepEqual(discoverCustomDicts([directory], ["cet4"]), []);
  assert.equal(isSupportedDict([{ word: "hello", meaning: "你好" }]), true);
});

test("自动发现软链接形式的自定义词库", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codep-linked-dicts-"));
  const targetDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codep-linked-target-"));
  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(targetDirectory, { recursive: true, force: true });
  });
  const target = path.join(targetDirectory, "source.json");
  fs.writeFileSync(target, JSON.stringify([{ name: "linked", trans: ["软链接"] }]));
  fs.symlinkSync(target, path.join(directory, "linked.json"));

  assert.equal(discoverCustomDicts([directory])[0].id, "linked");
});
