#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { isSupportedDict } = require("./custom-dicts");
const { BUILTIN_DICT_REGISTRY } = require("./config");

const [source, destinationDirectory] = process.argv.slice(2);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!source || !destinationDirectory || !fs.existsSync(source)) {
  fail("用法: codep --import <词库.json>");
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(source, "utf8"));
} catch {
  fail("JSON 格式不对");
}

if (!isSupportedDict(raw)) {
  fail('词库需要是非空数组，每项包含 "name" 或 "word"');
}

const basename = path.basename(source);
if (path.extname(basename).toLowerCase() !== ".json") {
  fail("词库文件必须使用 .json 扩展名");
}

const id = path.basename(basename, path.extname(basename));
if (BUILTIN_DICT_REGISTRY.some((dict) => dict.id === id)) {
  fail(`词库 ID 与内置词库重名: ${id}`);
}

fs.mkdirSync(destinationDirectory, { recursive: true });
const destination = path.join(destinationDirectory, basename);
if (path.resolve(source) !== path.resolve(destination)) fs.copyFileSync(source, destination);

console.log(`✅ 已导入: ${basename} (${raw.length} 个单词)`);
console.log(`   保存位置: ${destination}`);
console.log("   重启 codep 后可选择该词库");
