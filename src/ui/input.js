/**
 * 终端交互与练习流程。
 * 根 index.js 只负责加载本模块。
 */
const {
  DICT_REGISTRY,
  POLL_INTERVAL_MS,
  ERROR_FLASH_MS,
  CHAPTER_LENGTH,
} = require("../config");
const {
  initializeStorage,
  loadProgress,
  saveProgress,
  loadSettings,
  saveSettings: writeSettings,
  loadDict,
  getChapterWords,
} = require("../storage");
const {
  getDueWords,
  getDueCount,
  getMistakeWords,
  recordResult,
} = require("../review");
const {
  LEARNING_MODES,
  normalizeLearningMode,
  toggleLearningMode,
  createStats,
  prepareSessionWords,
  scheduleCardRepeat,
  cardResult,
  cardRatingForKey,
} = require("../practice");
const { clearScreen, moveTo, hideCursor, showCursor, centerPad, write, c } = require("../terminal");
const { speak: playSpeech, prefetch, playSound: playEffect, ensureSoundFiles, hasAudioPlayer } = require("../audio");
const { focusAIPane, focusPracticePane, readAIState } = require("../ai-state");
const { createRenderer } = require("./render");

// ─── 状态 ───────────────────────────────────────────────
let words = [];
let chapterWords = [];
let currentWord = null;
let currentDictId = null;
let currentChapter = 0;
let totalChapters = 0;
let cursorPos = 0;
let wordIndex = 0;
let stats = createStats();
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
let lastAIState = "idle"; // 追踪上一次 AI 状态，只在变化时触发动作
let menuMode = "dict"; // "dict" | "chapter" | "practice" | "summary"
let menuSelection = 0;
let reviewMode = false; // 是否在复习模式（区别于章节模式）
let lastReviewWords = []; // 上一轮复习的词（用于"再来一轮"）
let learningMode = LEARNING_MODES.SPELLING;
let sessionLearningMode = LEARNING_MODES.SPELLING;
let cardRevealed = false;
let cardPromptError = false;

// ─── 确认是 TTY ─────────────────────────────────────────
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("spell-guard: 需要在交互式终端中运行");
  process.exit(1);
}

function readViewState() {
  return {
    learningMode,
    menuSelection,
    currentDictId,
    totalChapters,
    paused,
    reviewMode,
    currentChapter,
    wordIndex,
    chapterWords,
    autoSpeak,
    sessionLearningMode,
    hardMode,
    stats,
    wpm,
    cardRevealed,
    hideMeaning,
    peekWord,
    currentWord,
    errorFlash,
    cardPromptError,
    focusMode,
    cursorPos,
    lastReviewWords,
  };
}

const {
  renderDictMenu,
  renderChapterMenu,
  renderPractice,
  renderSummary,
  renderReviewConfirm,
} = createRenderer(readViewState);

function saveSettings() {
  writeSettings({
    hardMode,
    hideMeaning,
    focusMode,
    autoSpeak,
    keySoundsEnabled,
    lastDictId: currentDictId || loadSettings().lastDictId,
    learningMode,
  });
}

function applySettings() {
  const settings = loadSettings();
  if (settings.hardMode !== undefined) hardMode = settings.hardMode;
  if (settings.hideMeaning !== undefined) hideMeaning = settings.hideMeaning;
  if (settings.focusMode !== undefined) focusMode = settings.focusMode;
  if (settings.autoSpeak !== undefined) autoSpeak = settings.autoSpeak;
  if (settings.keySoundsEnabled !== undefined) keySoundsEnabled = settings.keySoundsEnabled;
  learningMode = normalizeLearningMode(settings.learningMode);
}

function speak(word) {
  playSpeech(word, autoSpeak);
}

function playSound(type) {
  playEffect(type, keySoundsEnabled);
}

function prefetchNext() {
  prefetch(chapterWords[wordIndex + 1]?.word);
}


function handleReviewConfirm(key, code) {
  if (code === 13) {
    // Enter: 再来一轮
    reviewMode = "replay";
    sessionLearningMode = learningMode;
    chapterWords = prepareSessionWords(lastReviewWords);
    wordIndex = 0;
    stats = createStats();
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
    write(" ".repeat(centerPad(msg, cols)) + `${c.green}${c.bold}${msg}${c.reset}`);
    setTimeout(() => { menuMode = "dict"; menuSelection = 0; renderDictMenu(); }, 1500);
    return;
  }
  reviewMode = true;
  sessionLearningMode = learningMode;
  // 复习模式使用第一个词的 dictId 作为 currentDictId（混合词库时取第一个）
  currentDictId = dueWords[0].dictId || currentDictId;
  chapterWords = prepareSessionWords(dueWords);
  lastReviewWords = dueWords.slice(); // 保存本轮词，用于"再来一轮"
  wordIndex = 0;
  stats = createStats();
  menuMode = "practice";
  nextWord();
}

function startChapter(chapter) {
  reviewMode = false;
  sessionLearningMode = learningMode;
  currentChapter = chapter;
  chapterWords = prepareSessionWords(getChapterWords(words, chapter));
  wordIndex = 0;
  stats = createStats();
  menuMode = "practice";
  nextWord();
}

function startMistakeMode() {
  const mistakeWords = getMistakeWords();
  if (mistakeWords.length === 0) {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    clearScreen(); hideCursor();
    const msg = "错题本还是空的，继续保持！";
    moveTo(Math.floor(rows / 2), 1);
    write(" ".repeat(centerPad(msg, cols)) + `${c.green}${c.bold}${msg}${c.reset}`);
    setTimeout(() => { menuMode = "dict"; menuSelection = 1; renderDictMenu(); }, 1200);
    return;
  }
  reviewMode = "mistakes";
  sessionLearningMode = learningMode;
  currentDictId = mistakeWords[0].dictId || currentDictId;
  chapterWords = prepareSessionWords(mistakeWords);
  wordIndex = 0;
  stats = createStats();
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
      saveProgress(currentDictId, currentChapter);
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
  cardRevealed = false;
  cardPromptError = false;
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
    const result = wordHadError ? "spelling_wrong" : (peeked ? "spelling_peeked" : "spelling_correct");
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

function rateCard(rating) {
  if (!cardRevealed) {
    cardPromptError = true;
    renderPractice();
    setTimeout(() => {
      cardPromptError = false;
      if (menuMode === "practice" && sessionLearningMode === LEARNING_MODES.CARD) renderPractice();
    }, 700);
    return;
  }

  const firstRating = !currentWord._session.longTermRecorded;
  if (firstRating) {
    stats.wordsCompleted++;
    if (rating === "known") {
      stats.cardKnown++;
      stats.correct++;
    } else if (rating === "fuzzy") {
      stats.cardFuzzy++;
      stats.wrong++;
    } else {
      stats.cardUnknown++;
      stats.wrong++;
    }
    if (reviewMode !== "replay") {
      recordResult(currentWord, currentDictId, cardResult(rating));
    }
    currentWord._session.longTermRecorded = true;
  }

  if (rating === "known") {
    stats.streak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    playSound("correct");
  } else {
    stats.streak = 0;
    playSound(rating === "unknown" ? "wrong" : "key");
  }

  scheduleCardRepeat(chapterWords, wordIndex, currentWord, rating);
  wordIndex++;
  nextWord();
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
  const state = readAIState();
  if (state === "busy" && lastAIState !== "busy") {
    lastAIState = "busy";
    focusPracticePane();
    if (paused) {
      paused = false;
      renderPractice();
      speak(currentWord.word);
    }
  } else if (state === "idle" && lastAIState !== "idle") {
    lastAIState = "idle";
    if (focusMode) return;
    if (cursorPos === 0) focusAIPane();
    else pendingPause = true;
  }
}

// ─── 输入处理 ────────────────────────────────────────────
function handleInput(key) {
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
}

function handleDictMenu(key, code) {
  const totalItems = DICT_REGISTRY.length + 2; // 今日复习 + 错题本
  if (key === "\x1b[A") { menuSelection = Math.max(0, menuSelection - 1); renderDictMenu(); }
  else if (key === "\x1b[B") { menuSelection = Math.min(totalItems - 1, menuSelection + 1); renderDictMenu(); }
  else if (code === 20) { switchLearningMode(renderDictMenu); }
  else if (code === 13) { // Enter
    if (menuSelection === 0) {
      // 今日复习
      startReviewMode();
    } else if (menuSelection === 1) {
      startMistakeMode();
    } else {
      const lastDictId = loadSettings().lastDictId;
      const sortedDicts = DICT_REGISTRY.slice().sort((a, b) => {
        if (a.id === lastDictId) return -1;
        if (b.id === lastDictId) return 1;
        return 0;
      });
      const dict = sortedDicts[menuSelection - 2];
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
  else if (code === 20) { switchLearningMode(renderChapterMenu); }
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
  // 学习方式在一轮开始后锁定，不响应 Ctrl+T。
  if (code === 20) return;

  // Esc 退出本轮
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

  if (sessionLearningMode === LEARNING_MODES.CARD) {
    if (code === 9) {
      speak(currentWord.word);
      return;
    }
    if (code === 13 || key === " ") {
      cardRevealed = true;
      cardPromptError = false;
      renderPractice();
      return;
    }
    const rating = cardRatingForKey(key);
    if (rating) { rateCard(rating); return; }
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
  // 忽略控制字符
  if (code < 32 || code === 127) return;
  handleChar(key);
}

function handleSummaryInput(key, code) {
  if (code === 20) {
    switchLearningMode(renderSummary);
  } else if (code === 13) { // Enter
    if (reviewMode === "mistakes") {
      reviewMode = false;
      menuMode = "dict"; menuSelection = 1; renderDictMenu();
    } else if (reviewMode) {
      // 复习模式：检查是否还有到期词
      const remaining = getDueCount();
      if (remaining > 0) {
        startReviewMode(); // 继续复习剩余词
      } else {
        replayLastReview();
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
      replayLastReview();
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

function replayLastReview() {
  if (lastReviewWords.length === 0) {
    reviewMode = false;
    menuMode = "dict"; menuSelection = 0; renderDictMenu();
    return;
  }
  chapterWords = prepareSessionWords(lastReviewWords);
  wordIndex = 0;
  stats = createStats();
  reviewMode = "replay";
  sessionLearningMode = learningMode;
  menuMode = "practice";
  nextWord();
}

function switchLearningMode(render) {
  learningMode = toggleLearningMode(learningMode);
  saveSettings();
  render();
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
    if (sessionLearningMode === LEARNING_MODES.CARD) {
      console.log(`   认识: ${stats.cardKnown}  模糊: ${stats.cardFuzzy}  不认识: ${stats.cardUnknown}`);
    } else {
      console.log(`   错误: ${stats.wrong} 次`);
    }
    console.log(`   最佳连击: ${stats.bestStreak} 🔥\n`);
  }
  process.stdin.setRawMode(false);
  process.exit(0);
}

// ─── 启动 ────────────────────────────────────────────────
initializeStorage();
applySettings();
if (!ensureSoundFiles()) keySoundsEnabled = false;

if (!hasAudioPlayer()) {
  process.stdout.write("\x1b[33m⚠ 未检测到音频播放器，声音已禁用。安装: sudo apt install mpv\x1b[0m\n");
  autoSpeak = false;
  keySoundsEnabled = false;
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.on("data", handleInput);

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

if (!autoResume()) renderDictMenu();
