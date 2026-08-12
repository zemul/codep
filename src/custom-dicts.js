const fs = require("fs");
const path = require("path");

function isSupportedDict(raw) {
  return Array.isArray(raw) && raw.length > 0 && raw.every((item) =>
    item && typeof item === "object" &&
    ((typeof item.name === "string" && item.name.length > 0) ||
      (typeof item.word === "string" && item.word.length > 0))
  );
}

/**
 * 自动发现目录中的自定义 JSON 词库。目录按顺序决定优先级。
 * 无效文件和与官方词库重名的文件会被忽略，避免阻止 Codep 启动。
 */
function discoverCustomDicts(directories, reservedIds = []) {
  const usedIds = new Set(reservedIds);
  const discovered = [];

  for (const directory of directories) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if ((!entry.isFile() && !entry.isSymbolicLink()) || path.extname(entry.name).toLowerCase() !== ".json") continue;

      const id = path.basename(entry.name, path.extname(entry.name));
      if (!id || usedIds.has(id)) continue;

      const file = path.join(directory, entry.name);
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!isSupportedDict(raw)) continue;
        discovered.push({
          id,
          name: id,
          file,
          description: `${raw.length} 词 (自定义)`,
          custom: true,
        });
        usedIds.add(id);
      } catch {
        // 一个损坏的自定义文件不应让整个词库菜单无法启动。
      }
    }
  }

  return discovered;
}

module.exports = { isSupportedDict, discoverCustomDicts };
