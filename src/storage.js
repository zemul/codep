const fs = require("fs");
const path = require("path");
const {
  ROOT_DIR,
  DATA_DIR,
  DICTS_DIR,
  PROGRESS_FILE,
  SETTINGS_FILE,
  AUDIO_CACHE_DIR,
  SOUNDS_DIR,
  CHAPTER_LENGTH,
} = require("./config");

function initializeStorage() {
  for (const dir of [DATA_DIR, AUDIO_CACHE_DIR, SOUNDS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  for (const [oldName, newName] of [
    [".progress.json", "progress.json"],
    [".settings.json", "settings.json"],
    [".review.json", "review.json"],
  ]) {
    const oldPath = path.join(ROOT_DIR, oldName);
    const newPath = path.join(DATA_DIR, newName);
    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
  }

  const oldAudioDir = path.join(ROOT_DIR, "audio-cache");
  if (fs.existsSync(oldAudioDir) && oldAudioDir !== AUDIO_CACHE_DIR) {
    for (const file of fs.readdirSync(oldAudioDir)) {
      const source = path.join(oldAudioDir, file);
      const destination = path.join(AUDIO_CACHE_DIR, file);
      if (!fs.existsSync(destination)) fs.renameSync(source, destination);
    }
    try { fs.rmdirSync(oldAudioDir); } catch {}
  }
}

function readJson(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  return fallback;
}

function loadProgress() {
  return readJson(PROGRESS_FILE);
}

function saveProgress(dictId, chapter) {
  const progress = loadProgress();
  if (!progress[dictId]) progress[dictId] = {};
  progress[dictId].lastChapter = chapter;
  progress[dictId].completedChapters = progress[dictId].completedChapters || [];
  if (!progress[dictId].completedChapters.includes(chapter)) {
    progress[dictId].completedChapters.push(chapter);
  }
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadSettings() {
  return readJson(SETTINGS_FILE);
}

function saveSettings(updates) {
  const settings = { ...loadSettings(), ...updates };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return settings;
}

function loadDict(dictInfo) {
  const primaryPath = path.join(DICTS_DIR, dictInfo.file);
  const legacyPath = path.join(ROOT_DIR, dictInfo.file);
  const raw = JSON.parse(fs.readFileSync(fs.existsSync(primaryPath) ? primaryPath : legacyPath, "utf8"));
  return raw.map((item) => {
    if (item.word && item.meaning) return item;
    return {
      word: item.name,
      meaning: Array.isArray(item.trans) ? item.trans[0] : (item.trans || ""),
      phonetic: item.usphone ? `/${item.usphone}/` : (item.ukphone ? `/${item.ukphone}/` : ""),
    };
  });
}

function getChapterWords(words, chapter) {
  const start = chapter * CHAPTER_LENGTH;
  return words.slice(start, Math.min(start + CHAPTER_LENGTH, words.length));
}

module.exports = {
  initializeStorage,
  loadProgress,
  saveProgress,
  loadSettings,
  saveSettings,
  loadDict,
  getChapterWords,
};
