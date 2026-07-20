#!/usr/bin/env node

/**
 * Spell Guard - Qwerty 风格单词拼写练习（tmux 版）
 * 配合 Claude Code 使用，AI 干活时自动激活，AI 完成时自动暂停
 */

const path = require("path");
const fs = require("fs");
const https = require("https");
const { execFile, execSync, spawn } = require("child_process");
const { getDueWords, getDueCount, recordResult, getOverallStats } = require("./review");

// ─── 配置 ───────────────────────────────────────────────
const DATA_DIR = path.join(require("os").homedir(), ".codep");
const DICTS_DIR = path.join(__dirname, "dicts");
const STATE_FILE = path.join(__dirname, ".ai-state");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const AUDIO_CACHE_DIR = path.join(DATA_DIR, "audio-cache");
const SOUNDS_DIR = path.join(__dirname, "sounds");
const POLL_INTERVAL_MS = 500;
const ERROR_FLASH_MS = 600;
const SESSION_NAME = "codep";
const CHAPTER_LENGTH = 20;

// 有道发音 API
const YOUDAO_API = "https://dict.youdao.com/dictvoice";
const PRONUNCIATION_TYPE = 2; // 1=英式 2=美式

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUDIO_CACHE_DIR)) fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
if (!fs.existsSync(SOUNDS_DIR)) fs.mkdirSync(SOUNDS_DIR, { recursive: true });

// ─── 旧数据迁移（从项目目录迁移到 ~/.codep/）──────────────
const MIGRATE_MAP = [
  [".progress.json", "progress.json"],
  [".settings.json", "settings.json"],
  [".review.json", "review.json"],
];
for (const [oldName, newName] of MIGRATE_MAP) {
  const oldPath = path.join(__dirname, oldName);
  const newPath = path.join(DATA_DIR, newName);
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.renameSync(oldPath, newPath);
  }
}
// 迁移 audio-cache
const oldAudioDir = path.join(__dirname, "audio-cache");
if (fs.existsSync(oldAudioDir) && oldAudioDir !== AUDIO_CACHE_DIR) {
  const files = fs.readdirSync(oldAudioDir);
  for (const f of files) {
    const src = path.join(oldAudioDir, f);
    const dst = path.join(AUDIO_CACHE_DIR, f);
    if (!fs.existsSync(dst)) fs.renameSync(src, dst);
  }
  // 删除旧目录（如果空了）
  try { fs.rmdirSync(oldAudioDir); } catch (e) {}
}

// ─── 词库注册表 ─────────────────────────────────────────
const DICT_REGISTRY = [
  { id: "it-words", name: "程序员常见词", file: "it-words.json", description: "1700 个编程常用英语单词" },
  { id: "cet4", name: "CET-4 四级", file: "cet4.json", description: "大学英语四级 2607 词" },
  { id: "cet6", name: "CET-6 六级", file: "CET6_T.json", description: "大学英语六级 2345 词" },
  { id: "kaoyan", name: "考研", file: "KaoYan_3_T.json", description: "研究生入学考试 3728 词" },
  { id: "gaokao", name: "高考 3500", file: "GaoKao_3500.json", description: "高考常见 3893 词" },
  { id: "toefl", name: "TOEFL 托福", file: "TOEFL_3_T.json", description: "托福考试 4264 词" },
  { id: "ielts", name: "IELTS 雅思", file: "IELTS_3_T.json", description: "雅思考试 3575 词" },
  { id: "gre3000", name: "GRE 3000", file: "GRE3000_3_T.json", description: "GRE 核心 3041 词" },
  { id: "oxford3000", name: "牛津核心 3000", file: "Oxford3000.json", description: "Oxford 3000 基础词 1342 词" },
  { id: "top2000", name: "高频 2000 词", file: "top2000words.json", description: "最高频英语 1867 词" },
  { id: "coca20000", name: "COCA 20000", file: "coca20000.json", description: "美国当代英语语料库 20199 词" },
  { id: "ai-ml", name: "AI·机器学习", file: "ai_machine_learning.json", description: "AI/ML 术语 726 词" },
  { id: "linux", name: "Linux 命令", file: "linux-command.json", description: "Linux 常用命令 575 条" },
];

// ─── 状态 ───────────────────────────────────────────────
let words = [];
let chapterWords = [];
let currentWord = null;
let currentDictId = null;
let currentChapter = 0;
let totalChapters = 0;
let cursorPos = 0;
let wordIndex = 0;
let stats = { correct: 0, wrong: 0, streak: 0, bestStreak: 0, wordsCompleted: 0 };
let paused = false;
let pendingPause = false;
let errorFlash = false;
let autoSpeak = true;
let keySoundsEnabled = true;
let hardMode = false; // 听写模式：隐藏单词
let hideMeaning = false; // 隐藏释义
let focusMode = false; // 专注模式：练完整章再切回
let peekWord = false; // Tab 按住时临时显示单词
let peeked = false; // 本词是否偷看过（影响复习算法）
let wordHadError = false; // 本词是否拼错过
let startTime = null;
let wpm = 0;
let pollTimer = null;
let nextWordCache = null;
let lastAIState = "idle"; // 追踪上一次 AI 状态，只在变化时触发动作
let menuMode = "dict"; // "dict" | "chapter" | "practice" | "summary"
let menuSelection = 0;
let reviewMode = false; // 是否在复习模式（区别于章节模式）
let lastReviewWords = []; // 上一轮复习的词（用于"再来一轮"）

// ─── 确认是 TTY ─────────────────────────────────────────
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("spell-guard: 需要在交互式终端中运行");
  process.exit(1);
}

// ─── 进度保存/加载 ───────────────────────────────────────
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    }
  } catch (e) {}
  return {};
}

function saveProgress() {
  const progress = loadProgress();
  if (!progress[currentDictId]) progress[currentDictId] = {};
  progress[currentDictId].lastChapter = currentChapter;
  progress[currentDictId].completedChapters = progress[currentDictId].completedChapters || [];
  if (!progress[currentDictId].completedChapters.includes(currentChapter)) {
    progress[currentDictId].completedChapters.push(currentChapter);
  }
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── 设置保存/加载 ───────────────────────────────────────
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch (e) {}
  return {};
}

function saveSettings() {
  const settings = {
    hardMode,
    hideMeaning,
    focusMode,
    autoSpeak,
    keySoundsEnabled,
    lastDictId: currentDictId,
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function applySettings() {
  const s = loadSettings();
  if (s.hardMode !== undefined) hardMode = s.hardMode;
  if (s.hideMeaning !== undefined) hideMeaning = s.hideMeaning;
  if (s.focusMode !== undefined) focusMode = s.focusMode;
  if (s.autoSpeak !== undefined) autoSpeak = s.autoSpeak;
  if (s.keySoundsEnabled !== undefined) keySoundsEnabled = s.keySoundsEnabled;
}

// ─── 词库加载 ────────────────────────────────────────────
function loadDict(dictInfo) {
  const filePath = path.join(DICTS_DIR, dictInfo.file);
  const altPath = path.join(__dirname, dictInfo.file);
  const p = fs.existsSync(filePath) ? filePath : altPath;
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));

  // 兼容不同格式
  return raw.map((item) => {
    if (item.word && item.meaning) return item; // 旧格式
    return {
      word: item.name,
      meaning: Array.isArray(item.trans) ? item.trans[0] : (item.trans || ""),
      phonetic: item.usphone ? `/${item.usphone}/` : (item.ukphone ? `/${item.ukphone}/` : ""),
    };
  });
}

function getChapterWords(chapter) {
  const start = chapter * CHAPTER_LENGTH;
  const end = Math.min(start + CHAPTER_LENGTH, words.length);
  return words.slice(start, end);
}

// ─── 终端控制 ────────────────────────────────────────────
function write(s) { process.stdout.write(s); }
function clearScreen() { write("\x1b[2J\x1b[H"); }
function moveTo(r, c) { write(`\x1b[${r};${c}H`); }
function hideCursor() { write("\x1b[?25l"); }
function showCursor() { write("\x1b[?25h"); }

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  underline: "\x1b[4m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  gray: "\x1b[90m",
};

// ─── 音频 ────────────────────────────────────────────────
function getAudioPath(word) {
  return path.join(AUDIO_CACHE_DIR, `${word}.mp3`);
}

function downloadAudio(word, callback) {
  const audioPath = getAudioPath(word);
  if (fs.existsSync(audioPath)) { if (callback) callback(audioPath); return; }
  const url = `${YOUDAO_API}?audio=${encodeURIComponent(word)}&type=${PRONUNCIATION_TYPE}`;
  const file = fs.createWriteStream(audioPath);
  https.get(url, (res) => {
    if (res.statusCode !== 200) { file.close(); try { fs.unlinkSync(audioPath); } catch(e){} if (callback) callback(null); return; }
    res.pipe(file);
    file.on("finish", () => { file.close(); if (callback) callback(audioPath); });
  }).on("error", () => { file.close(); try { fs.unlinkSync(audioPath); } catch(e){} if (callback) callback(null); });
}

function speak(word) {
  if (!autoSpeak) return;
  const audioPath = getAudioPath(word);
  if (fs.existsSync(audioPath)) { playAudio(audioPath); }
  else { downloadAudio(word, (p) => { if (p) playAudio(p); else fallbackSpeak(word); }); }
}

function playAudio(filePath) {
  if (process.platform === "darwin") { execFile("afplay", [filePath], () => {}); }
  else {
    execFile("mpv", ["--no-terminal", filePath], (err) => {
      if (err) execFile("paplay", [filePath], (err2) => {
        if (err2) execFile("aplay", [filePath], () => {});
      });
    });
  }
}

function fallbackSpeak(word) {
  if (process.platform === "darwin") { execFile("say", ["-v", "Samantha", "-r", "150", word], () => {}); }
  else { execFile("espeak", [word], () => {}); }
}

function prefetchNext() {
  if (wordIndex + 1 < chapterWords.length) {
    downloadAudio(chapterWords[wordIndex + 1].word, () => {});
  }
}

// ─── 按键音效 ────────────────────────────────────────────
const SOUND_FILES = {
  key: path.join(SOUNDS_DIR, "key.wav"),
  correct: path.join(SOUNDS_DIR, "correct.wav"),
  wrong: path.join(SOUNDS_DIR, "wrong.wav"),
};

function playSound(type) {
  if (!keySoundsEnabled) return;
  const file = SOUND_FILES[type];
  if (!file || !fs.existsSync(file)) return;
  try {
    let child;
    if (process.platform === "darwin") {
      child = spawn("afplay", ["-v", "0.3", file], { stdio: "ignore", detached: true });
    } else {
      child = spawn("aplay", ["-q", file], { stdio: "ignore", detached: true });
    }
    child.on("error", () => {}); // 播放器不存在时静默跳过
    child.unref();
  } catch (e) {}
}

function ensureSoundFiles() {
  if (!fs.existsSync(SOUND_FILES.key)) {
    try { execSync(`ffmpeg -y -f lavfi -i "sine=frequency=880:duration=0.01" -ac 1 "${SOUND_FILES.key}" 2>/dev/null`, { stdio: "ignore" }); }
    catch (e) { keySoundsEnabled = false; }
  }
  if (!fs.existsSync(SOUND_FILES.correct)) {
    try { execSync(`ffmpeg -y -f lavfi -i "sine=frequency=1400:duration=0.08" -ac 1 "${SOUND_FILES.correct}" 2>/dev/null`, { stdio: "ignore" }); } catch (e) {}
  }
  if (!fs.existsSync(SOUND_FILES.wrong)) {
    try { execSync(`ffmpeg -y -f lavfi -i "sine=frequency=300:duration=0.08" -ac 1 "${SOUND_FILES.wrong}" 2>/dev/null`, { stdio: "ignore" }); } catch (e) {}
  }
}

// ─── tmux 焦点切换 ────────────────────────────────────────
function focusAIPane() {
  try { execSync(`tmux select-pane -t "${SESSION_NAME}:0.0"`, { stdio: "ignore" }); } catch (e) {}
}

function focusPracticePane() {
  try { execSync(`tmux select-pane -t "${SESSION_NAME}:0.1"`, { stdio: "ignore" }); } catch (e) {}
}

// ─── 工具 ────────────────────────────────────────────────
function centerPad(visibleLen, totalWidth) {
  return Math.max(0, Math.floor((totalWidth - visibleLen) / 2));
}

// ─── 渲染：词库选择菜单 ──────────────────────────────────
function renderDictMenu() {
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  moveTo(2, 1);
  const title = "📚 选择词库";
  write(" ".repeat(centerPad(title.length, cols)) + `${c.bold}${c.cyan}${title}${c.reset}`);

  // 统计概览
  const overallStats = getOverallStats();
  if (overallStats.totalLearned > 0) {
    moveTo(4, 1);
    const statsLine = `学习: ${overallStats.totalLearned} 词  掌握: ${overallStats.mastered} 词  明日待复习: ${overallStats.dueTomorrow} 词`;
    write(" ".repeat(centerPad(statsLine.length, cols)) + `${c.dim}${statsLine}${c.reset}`);
  }

  // "今日复习"入口（始终在最顶部）
  const dueCount = getDueCount();
  const reviewRow = overallStats.totalLearned > 0 ? 6 : 5;
  moveTo(reviewRow, 1);
  const reviewPrefix = menuSelection === 0 ? `${c.green}▶ ` : "  ";
  const reviewLabel = dueCount > 0
    ? `${reviewPrefix}${c.bold}${c.magenta}今日复习${c.reset} ${c.yellow}(${dueCount} 词到期)${c.reset}`
    : `${reviewPrefix}${c.dim}今日复习 (已完成 ✓)${c.reset}`;
  write(reviewLabel);

  // 词库列表（从 index 1 开始，上次使用的排最前）
  const progress = loadProgress();
  const lastDictId = loadSettings().lastDictId;
  const sortedDicts = DICT_REGISTRY.slice().sort((a, b) => {
    if (a.id === lastDictId) return -1;
    if (b.id === lastDictId) return 1;
    return 0;
  });
  for (let i = 0; i < sortedDicts.length; i++) {
    const d = sortedDicts[i];
    const row = reviewRow + 2 + i * 2;
    moveTo(row, 1);
    const prefix = (i + 1) === menuSelection ? `${c.green}▶ ` : "  ";
    const prog = progress[d.id] ? `${c.yellow}(进度: Ch.${(progress[d.id].lastChapter || 0) + 1})${c.reset}` : "";
    const label = d.id === lastDictId ? `${c.cyan}${d.name}${c.reset}` : `${d.name}`;
    const line = `${prefix}${c.bold}${label}${c.reset} ${c.gray}${d.description}${c.reset} ${prog}`;
    write(line);
  }

  moveTo(rows - 2, 1);
  const hint = "↑↓ 选择 | Enter 确认 | Ctrl+C 退出";
  write(" ".repeat(centerPad(hint.length, cols)) + `${c.dim}${hint}${c.reset}`);
}

// ─── 渲染：章节选择菜单 ──────────────────────────────────
function renderChapterMenu() {
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  const dictName = DICT_REGISTRY.find(d => d.id === currentDictId).name;
  moveTo(2, 1);
  const title = `📖 ${dictName} - 选择章节 (共 ${totalChapters} 章，每章 ${CHAPTER_LENGTH} 词)`;
  write(" ".repeat(centerPad(title.length, cols)) + `${c.bold}${c.cyan}${title}${c.reset}`);

  const progress = loadProgress();
  const completed = (progress[currentDictId] && progress[currentDictId].completedChapters) || [];

  // 显示章节网格（每行 5 个）
  const perRow = 5;
  const startRow = 5;
  const visibleRows = rows - 8;
  const maxVisible = visibleRows * perRow;
  const pageStart = Math.floor(menuSelection / maxVisible) * maxVisible;

  for (let i = pageStart; i < Math.min(pageStart + maxVisible, totalChapters); i++) {
    const gridRow = Math.floor((i - pageStart) / perRow);
    const gridCol = (i - pageStart) % perRow;
    const row = startRow + gridRow;
    const col = 3 + gridCol * Math.floor((cols - 4) / perRow);

    moveTo(row, col);
    const isSelected = i === menuSelection;
    const isDone = completed.includes(i);
    const label = `Ch.${i + 1}`;

    if (isSelected) {
      write(`${c.bgGreen}${c.bold} ${label} ${c.reset}`);
    } else if (isDone) {
      write(`${c.green}✓${label}${c.reset}`);
    } else {
      write(`${c.gray} ${label} ${c.reset}`);
    }
  }

  moveTo(rows - 2, 1);
  const hint = "↑↓←→ 选择 | Enter 确认 | Esc 返回 | Ctrl+C 退出";
  write(" ".repeat(centerPad(hint.length, cols)) + `${c.dim}${hint}${c.reset}`);
}

// ─── 渲染：练习界面 ──────────────────────────────────────
function renderPractice() {
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  if (paused) { renderPaused(cols, rows); return; }

  const mid = Math.floor(rows / 2);

  // 顶部状态栏（简洁一行）
  moveTo(1, 1);
  const chInfo = reviewMode === "replay" ? `[重放]` : reviewMode ? `[复习]` : `Ch.${currentChapter + 1}`;
  const progress = `${wordIndex + 1}/${chapterWords.length}`;
  const soundIcon = autoSpeak ? "🔊" : "🔇";
  const modeIcon = hardMode ? `${c.yellow}听写${c.reset}` : "";
  const statusLine = `${chInfo} ${progress}  ✓${stats.wordsCompleted}  🔥${stats.streak}${wpm > 0 ? `  ${wpm}wpm` : ""}  ${soundIcon}`;
  write(`${c.dim}  ${statusLine}${c.reset} ${modeIcon}`);

  // 进度条
  moveTo(3, 1);
  const barWidth = Math.min(cols - 6, 30);
  const filled = Math.round((wordIndex / chapterWords.length) * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  write(" ".repeat(centerPad(barWidth, cols)) + `${c.green}${bar}${c.reset}`);

  // 释义（灰色小字，高于中间）
  moveTo(mid - 3, 1);
  if (!hideMeaning || peekWord) {
    const meaning = currentWord.meaning || "";
    const truncMeaning = meaning.length > cols - 4 ? meaning.slice(0, cols - 7) + "..." : meaning;
    write(" ".repeat(centerPad(truncMeaning.length, cols)) + `${c.dim}${truncMeaning}${c.reset}`);
  }

  // 音标（灰色）
  if (currentWord.phonetic && (!hideMeaning || peekWord)) {
    moveTo(mid - 2, 1);
    write(" ".repeat(centerPad(currentWord.phonetic.length, cols)) + `${c.dim}${currentWord.phonetic}${c.reset}`);
  }

  // ═══ 单词（视觉焦点，加粗亮色，上下空行包围）═══
  moveTo(mid, 1);
  renderWord(cols);

  // 错误提示
  if (errorFlash) {
    moveTo(mid + 2, 1);
    const errMsg = "✗ 重新输入";
    write(" ".repeat(centerPad(errMsg.length + 2, cols)) + `${c.red}${c.bold}${errMsg}${c.reset}`);
  }

  // 底部提示（极简）
  moveTo(rows - 1, 1);
  const items = [
    "Tab 偷看",
    `^H ${hardMode ? "显示词" : "隐藏词"}`,
    `^D ${hideMeaning ? "显示释义" : "隐藏释义"}`,
    `^F ${focusMode ? "关专注" : "开专注"}`,
    `^S ${autoSpeak ? "静音" : "开声"}`,
    "Esc 退出",
  ];
  const help = items.join("  ");
  write(" ".repeat(centerPad(help.length, cols)) + `${c.dim}${help}${c.reset}`);
}

function renderWord(cols) {
  const word = currentWord.word;
  let display = "";
  let visibleLen = 0;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (i < cursorPos) {
      // 已打对的字母：无论哪种模式都显示
      display += `${c.green}${c.bold}${ch}${c.reset}`;
    } else if (hardMode && !peekWord) {
      // 听写模式：未输入的用下划线（除非 Tab 偷看中）
      if (i === cursorPos) {
        display += `${c.white}${c.bold}_${c.reset}`;
      } else {
        display += `${c.gray}_${c.reset}`;
      }
    } else {
      // 普通模式 或 偷看中：显示字母
      if (i === cursorPos) {
        display += `${c.white}${c.bold}${c.underline}${ch}${c.reset}`;
      } else {
        display += `${c.gray}${ch}${c.reset}`;
      }
    }
    visibleLen++;
  }
  const padding = " ".repeat(centerPad(visibleLen, cols));
  write(padding + display);
}

function renderPaused(cols, rows) {
  const mid = Math.floor(rows / 2);
  moveTo(mid - 1, 1);
  const msg1 = "⏸  AI 空闲中";
  write(" ".repeat(centerPad(msg1.length, cols)) + `${c.dim}${msg1}${c.reset}`);
  moveTo(mid + 1, 1);
  const msg2 = `Ch.${currentChapter + 1}  ✓${stats.wordsCompleted}  🔥${stats.bestStreak}`;
  write(" ".repeat(centerPad(msg2.length, cols)) + `${c.dim}${msg2}${c.reset}`);
}

// ─── 渲染：章节总结 ──────────────────────────────────────
function renderSummary() {
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  const mid = Math.floor(rows / 2);

  moveTo(mid - 4, 1);
  const title = reviewMode ? `🎉 今日复习完成！` : `🎉 Chapter ${currentChapter + 1} 完成！`;
  write(" ".repeat(centerPad(title.length, cols)) + `${c.bold}${c.green}${title}${c.reset}`);

  moveTo(mid - 2, 1);
  const s1 = `完成: ${stats.wordsCompleted} 词`;
  write(" ".repeat(centerPad(s1.length, cols)) + s1);

  moveTo(mid - 1, 1);
  const s2 = `错误: ${stats.wrong} 次`;
  write(" ".repeat(centerPad(s2.length, cols)) + s2);

  moveTo(mid, 1);
  const acc = stats.wordsCompleted > 0 ? Math.round((stats.correct / (stats.correct + stats.wrong)) * 100) : 0;
  const s3 = `正确率: ${acc}%`;
  write(" ".repeat(centerPad(s3.length, cols)) + `${acc >= 80 ? c.green : c.yellow}${s3}${c.reset}`);

  moveTo(mid + 1, 1);
  const s4 = `最佳连击: ${stats.bestStreak} 🔥`;
  write(" ".repeat(centerPad(s4.length, cols)) + s4);

  // 累计统计
  const overall = getOverallStats();
  if (overall.totalLearned > 0) {
    moveTo(mid + 3, 1);
    const divider = "─".repeat(20);
    write(" ".repeat(centerPad(20, cols)) + `${c.dim}${divider}${c.reset}`);
    moveTo(mid + 4, 1);
    const s5 = `累计学习: ${overall.totalLearned}  已掌握: ${overall.mastered}  明日待复习: ${overall.dueTomorrow}`;
    write(" ".repeat(centerPad(s5.length, cols)) + `${c.dim}${s5}${c.reset}`);
  }

  moveTo(rows - 2, 1);
  if (reviewMode) {
    const remaining = getDueCount();
    const hint = remaining > 0 ? `还有 ${remaining} 词到期 | Enter 继续 | Esc 返回` : "r 再来一轮 | Enter 返回菜单";
    write(" ".repeat(centerPad(hint.length, cols)) + `${c.dim}${hint}${c.reset}`);
  } else {
    const hint = "Enter 下一章 | Esc 返回";
    write(" ".repeat(centerPad(hint.length, cols)) + `${c.dim}${hint}${c.reset}`);
  }
}

// ─── 复习确认界面 ─────────────────────────────────────────
function renderReviewConfirm() {
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  const mid = Math.floor(rows / 2);

  moveTo(mid - 2, 1);
  const msg1 = "今日到期词已全部复习完毕";
  write(" ".repeat(centerPad(msg1.length, cols)) + `${c.green}${msg1}${c.reset}`);

  moveTo(mid, 1);
  const msg2 = `再来一轮？(${lastReviewWords.length} 词，不影响复习进度)`;
  write(" ".repeat(centerPad(msg2.length, cols)) + `${c.bold}${msg2}${c.reset}`);

  moveTo(mid + 2, 1);
  const hint = "Enter 再来一轮 | Esc 返回菜单";
  write(" ".repeat(centerPad(hint.length, cols)) + `${c.dim}${hint}${c.reset}`);
}

function handleReviewConfirm(key, code) {
  if (code === 13) {
    // Enter: 再来一轮
    reviewMode = "replay";
    chapterWords = lastReviewWords.slice();
    wordIndex = 0;
    stats = { correct: 0, wrong: 0, streak: 0, bestStreak: 0, wordsCompleted: 0 };
    menuMode = "practice";
    nextWord();
  } else if (key === "\x1b" && key.length === 1) {
    // Esc: 返回菜单
    menuMode = "dict"; menuSelection = 0; renderDictMenu();
  }
}

// ─── 练习逻辑 ────────────────────────────────────────────
function startReviewMode() {
  const dueWords = getDueWords();
  if (dueWords.length === 0) {
    // 没有到期词，但有上轮记录时询问是否再来一轮
    if (lastReviewWords.length > 0) {
      menuMode = "review-confirm";
      renderReviewConfirm();
      return;
    }
    // 完全没练过，提示后回菜单
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    clearScreen(); hideCursor();
    moveTo(Math.floor(rows / 2), 1);
    const msg = "今日复习已完成，没有到期的词！";
    write(" ".repeat(centerPad(msg.length, cols)) + `${c.green}${c.bold}${msg}${c.reset}`);
    setTimeout(() => { menuMode = "dict"; menuSelection = 0; renderDictMenu(); }, 1500);
    return;
  }
  reviewMode = true;
  // 复习模式使用第一个词的 dictId 作为 currentDictId（混合词库时取第一个）
  currentDictId = dueWords[0].dictId || currentDictId;
  chapterWords = dueWords;
  lastReviewWords = dueWords.slice(); // 保存本轮词，用于"再来一轮"
  wordIndex = 0;
  stats = { correct: 0, wrong: 0, streak: 0, bestStreak: 0, wordsCompleted: 0 };
  menuMode = "practice";
  nextWord();
}

function startChapter(chapter) {
  reviewMode = false;
  currentChapter = chapter;
  chapterWords = getChapterWords(chapter);
  wordIndex = 0;
  stats = { correct: 0, wrong: 0, streak: 0, bestStreak: 0, wordsCompleted: 0 };
  menuMode = "practice";
  nextWord();
}

function nextWord() {
  if (wordIndex >= chapterWords.length) {
    // 完成
    if (reviewMode) {
      menuMode = "summary";
      renderSummary();
    } else {
      saveProgress();
      menuMode = "summary";
      renderSummary();
    }
    return;
  }
  currentWord = chapterWords[wordIndex];
  // 复习模式时 currentDictId 跟随当前词的 dictId
  if (reviewMode && currentWord.dictId) {
    currentDictId = currentWord.dictId;
  }
  cursorPos = 0;
  errorFlash = false;
  peeked = false;
  wordHadError = false;
  startTime = Date.now();
  renderPractice();
  speak(currentWord.word);
  prefetchNext();
}

function handleChar(ch) {
  if (errorFlash) return;
  const expected = currentWord.word[cursorPos];
  if (ch.toLowerCase() === expected.toLowerCase()) {
    cursorPos++;
    playSound("key");
    if (cursorPos >= currentWord.word.length) { wordCompleted(); }
    else { renderPractice(); }
  } else {
    wordError();
  }
}

function wordCompleted() {
  stats.wordsCompleted++;
  stats.correct++;
  stats.streak++;
  if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  const elapsed = (Date.now() - startTime) / 1000 / 60;
  if (elapsed > 0) wpm = Math.round(1 / elapsed);
  cursorPos = currentWord.word.length;
  playSound("correct");
  renderPractice();

  // 记录复习结果（replay 模式不更新，纯练习）
  if (reviewMode !== "replay") {
    const result = wordHadError ? "wrong" : (peeked ? "peeked" : "correct");
    recordResult(currentWord, currentDictId, result);
  }
  peeked = false;
  wordHadError = false;

  setTimeout(() => {
    if (pendingPause) {
      pendingPause = false;
      focusAIPane(); // 切一次焦点，之后不再重复
    }
    wordIndex++;
    nextWord();
  }, 500);
}

function wordError() {
  stats.wrong++;
  stats.streak = 0;
  errorFlash = true;
  playSound("wrong");
  renderPractice();

  // 标记本词出错过（最终在 wordCompleted 里统一记录）
  peeked = false; // 出错比偷看更严重，直接标记 wrong
  wordHadError = true;

  setTimeout(() => {
    errorFlash = false;
    cursorPos = 0;
    startTime = Date.now();
    renderPractice();
  }, ERROR_FLASH_MS);
}

// ─── AI 状态检测 ──────────────────────────────────────────
function checkAIState() {
  if (menuMode !== "practice") return;
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = fs.readFileSync(STATE_FILE, "utf-8").trim();
      if (state === "busy") {
        if (lastAIState !== "busy") {
          // 状态变化：idle → busy，激活练习，切焦点到练习 pane
          lastAIState = "busy";
          focusPracticePane();
          if (paused) {
            paused = false;
            renderPractice();
            speak(currentWord.word);
          }
        }
      } else if (state === "idle") {
        if (lastAIState !== "idle") {
          // 状态变化：busy → idle，切焦点回 claude（只切一次）
          lastAIState = "idle";
          if (focusMode) return; // 专注模式：不切回，等章节结束
          if (cursorPos === 0) {
            focusAIPane();
          } else {
            pendingPause = true; // 等打完当前词再切
          }
        }
      }
    }
  } catch (e) {}
}

// ─── 输入处理 ────────────────────────────────────────────
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

process.stdin.on("data", (key) => {
  const code = key.charCodeAt(0);

  // Ctrl+C 退出
  if (code === 3) { exit(); return; }

  if (menuMode === "dict") {
    handleDictMenu(key, code);
  } else if (menuMode === "chapter") {
    handleChapterMenu(key, code);
  } else if (menuMode === "practice") {
    handlePracticeInput(key, code);
  } else if (menuMode === "summary") {
    handleSummaryInput(key, code);
  } else if (menuMode === "review-confirm") {
    handleReviewConfirm(key, code);
  }
});

function handleDictMenu(key, code) {
  const totalItems = DICT_REGISTRY.length + 1; // +1 for 今日复习
  if (key === "\x1b[A") { menuSelection = Math.max(0, menuSelection - 1); renderDictMenu(); }
  else if (key === "\x1b[B") { menuSelection = Math.min(totalItems - 1, menuSelection + 1); renderDictMenu(); }
  else if (code === 13) { // Enter
    if (menuSelection === 0) {
      // 今日复习
      startReviewMode();
    } else {
      const lastDictId = loadSettings().lastDictId;
      const sortedDicts = DICT_REGISTRY.slice().sort((a, b) => {
        if (a.id === lastDictId) return -1;
        if (b.id === lastDictId) return 1;
        return 0;
      });
      const dict = sortedDicts[menuSelection - 1];
      currentDictId = dict.id;
      saveSettings();
      words = loadDict(dict);
      totalChapters = Math.ceil(words.length / CHAPTER_LENGTH);
      // 恢复上次进度
      const progress = loadProgress();
      menuSelection = (progress[currentDictId] && progress[currentDictId].lastChapter) || 0;
      menuMode = "chapter";
      renderChapterMenu();
    }
  }
}

function handleChapterMenu(key, code) {
  const perRow = 5;
  if (key === "\x1b[A") { menuSelection = Math.max(0, menuSelection - perRow); renderChapterMenu(); }
  else if (key === "\x1b[B") { menuSelection = Math.min(totalChapters - 1, menuSelection + perRow); renderChapterMenu(); }
  else if (key === "\x1b[D") { menuSelection = Math.max(0, menuSelection - 1); renderChapterMenu(); }
  else if (key === "\x1b[C") { menuSelection = Math.min(totalChapters - 1, menuSelection + 1); renderChapterMenu(); }
  else if (code === 13) { startChapter(menuSelection); }
  else if (key === "\x1b" && key.length === 1) { menuMode = "dict"; menuSelection = 0; renderDictMenu(); }
}

function handlePracticeInput(key, code) {
  // Ctrl+S 静音
  if (code === 19) { autoSpeak = !autoSpeak; saveSettings(); renderPractice(); return; }
  // Ctrl+F 专注模式（练完整章再切回）
  if (code === 6) {
    focusMode = !focusMode;
    saveSettings();
    renderPractice();
    // 闪现提示说明功能
    const msg = focusMode ? "📌 专注模式：练完整章再切回" : "📌 已关闭专注，AI完成自动切回";
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    process.stdout.write(`\x1b[${rows - 2};1H\x1b[2K`);
    process.stdout.write(" ".repeat(Math.max(0, Math.floor((cols - msg.length) / 2))) + `\x1b[33m${msg}\x1b[0m`);
    setTimeout(() => renderPractice(), 1500);
    return;
  }
  // Ctrl+H 听写模式（隐藏单词）
  if (code === 8) { hardMode = !hardMode; saveSettings(); renderPractice(); return; }
  // Ctrl+D 隐藏/显示释义
  if (code === 4) { hideMeaning = !hideMeaning; saveSettings(); renderPractice(); return; }
  // Tab 偷看（临时显示单词+释义 1 秒）
  if (code === 9) {
    peekWord = true;
    peeked = true; // 标记本词偷看过，影响复习间隔
    renderPractice();
    speak(currentWord.word);
    setTimeout(() => { peekWord = false; if (menuMode === "practice") renderPractice(); }, 1000);
    return;
  }
  // Esc 退出章节
  if (key === "\x1b" && key.length === 1) {
    if (reviewMode) {
      reviewMode = false;
      menuMode = "dict"; menuSelection = 0; renderDictMenu();
    } else {
      menuMode = "chapter"; menuSelection = currentChapter; renderChapterMenu();
    }
    return;
  }
  // 暂停中按任意键激活
  if (paused) { paused = false; renderPractice(); speak(currentWord.word); return; }
  // 忽略控制字符
  if (code < 32 || code === 127) return;
  handleChar(key);
}

function handleSummaryInput(key, code) {
  if (code === 13) { // Enter
    if (reviewMode) {
      // 复习模式：检查是否还有到期词
      const remaining = getDueCount();
      if (remaining > 0) {
        startReviewMode(); // 继续复习剩余词
      } else {
        reviewMode = false;
        menuMode = "dict"; menuSelection = 0; renderDictMenu();
      }
    } else {
      // 章节模式：下一章
      if (currentChapter + 1 < totalChapters) {
        menuSelection = currentChapter + 1;
        startChapter(currentChapter + 1);
      } else {
        menuMode = "chapter"; menuSelection = 0; renderChapterMenu();
      }
    }
  } else if (key === "r" || key === "R") {
    // 再来一轮：用上次的词列表纯练习，不更新复习数据
    if (reviewMode && lastReviewWords.length > 0) {
      chapterWords = lastReviewWords.slice();
      wordIndex = 0;
      stats = { correct: 0, wrong: 0, streak: 0, bestStreak: 0, wordsCompleted: 0 };
      reviewMode = "replay"; // 标记为重放模式
      menuMode = "practice";
      nextWord();
    }
  } else if (key === "\x1b" && key.length === 1) {
    if (reviewMode) {
      reviewMode = false;
      menuMode = "dict"; menuSelection = 0; renderDictMenu();
    } else {
      menuMode = "chapter"; menuSelection = currentChapter; renderChapterMenu();
    }
  }
}

// ─── 窗口变化 ────────────────────────────────────────────
process.stdout.on("resize", () => {
  if (menuMode === "dict") renderDictMenu();
  else if (menuMode === "chapter") renderChapterMenu();
  else if (menuMode === "practice") renderPractice();
  else if (menuMode === "summary") renderSummary();
  else if (menuMode === "review-confirm") renderReviewConfirm();
});

// ─── 退出 ────────────────────────────────────────────────
function exit() {
  if (pollTimer) clearInterval(pollTimer);
  clearScreen(); showCursor(); moveTo(1, 1);
  if (stats.wordsCompleted > 0) {
    console.log(`\n📊 Spell Guard 练习结束`);
    console.log(`   完成: ${stats.wordsCompleted} 词`);
    console.log(`   错误: ${stats.wrong} 次`);
    console.log(`   最佳连击: ${stats.bestStreak} 🔥\n`);
  }
  process.stdin.setRawMode(false);
  process.exit(0);
}

// ─── 启动 ────────────────────────────────────────────────
applySettings();
ensureSoundFiles();

// 检测音频播放器（仅 Linux）
if (process.platform !== "darwin") {
  const { execFileSync } = require("child_process");
  const players = ["mpv", "paplay", "aplay"];
  const hasPlayer = players.some(p => { try { execFileSync("which", [p], { stdio: "ignore" }); return true; } catch { return false; } });
  if (!hasPlayer) {
    process.stdout.write("\x1b[33m⚠ 未检测到音频播放器，声音已禁用。安装: sudo apt install mpv\x1b[0m\n");
    autoSpeak = false;
    keySoundsEnabled = false;
  }
}

pollTimer = setInterval(checkAIState, POLL_INTERVAL_MS);

// 自动继续上次的词库和章节
const settings = loadSettings();
const progress = loadProgress();

function autoResume() {
  // 复习优先：有到期词时自动进入复习模式
  const dueCount = getDueCount();
  if (dueCount > 0) {
    startReviewMode();
    return true;
  }

  // 否则继续上次的词库和章节
  const lastDictId = settings.lastDictId;
  const lastDict = lastDictId && DICT_REGISTRY.find(d => d.id === lastDictId);
  if (lastDict) {
    currentDictId = lastDict.id;
    words = loadDict(lastDict);
    totalChapters = Math.ceil(words.length / CHAPTER_LENGTH);
    const chapter = (progress[lastDict.id] && progress[lastDict.id].lastChapter) || 0;
    startChapter(chapter);
    return true;
  }
  return false;
}

if (fs.existsSync(STATE_FILE) && fs.readFileSync(STATE_FILE, "utf-8").trim() === "busy") {
  if (!autoResume()) renderDictMenu();
} else {
  if (!autoResume()) renderDictMenu();
}
