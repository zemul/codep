const { DICT_REGISTRY, CHAPTER_LENGTH } = require("../config");
const { loadProgress, loadSettings } = require("../storage");
const { getDueCount, getMistakeCount, getOverallStats } = require("../review");
const { LEARNING_MODES, learningModeLabel, toggleLearningMode } = require("../practice");
const { write, clearScreen, moveTo, hideCursor, truncateDisplay, centerPad, c } = require("../terminal");

let readState;
let learningMode;
let menuSelection;
let currentDictId;
let totalChapters;
let paused;
let reviewMode;
let currentChapter;
let wordIndex;
let chapterWords;
let autoSpeak;
let sessionLearningMode;
let hardMode;
let stats;
let wpm;
let cardRevealed;
let hideMeaning;
let peekWord;
let currentWord;
let errorFlash;
let cardPromptError;
let focusMode;
let cursorPos;
let lastReviewWords;

function syncState() {
  ({
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
  } = readState());
}

// ─── 渲染：词库选择菜单 ──────────────────────────────────
function renderDictMenu() {
  syncState();
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  moveTo(2, 1);
  const title = "📚 选择词库";
  write(" ".repeat(centerPad(title, cols)) + `${c.bold}${c.cyan}${title}${c.reset}`);

  moveTo(3, 1);
  const modeLine = `学习方式：${learningModeLabel(learningMode)}  (^T 切换)`;
  write(" ".repeat(centerPad(modeLine, cols)) + `${c.cyan}${modeLine}${c.reset}`);

  // 统计概览
  const overallStats = getOverallStats();
  if (overallStats.totalLearned > 0) {
    moveTo(4, 1);
    const statsLine = `学习: ${overallStats.totalLearned} 词  掌握: ${overallStats.mastered} 词  明日待复习: ${overallStats.dueTomorrow} 词`;
    write(" ".repeat(centerPad(statsLine, cols)) + `${c.dim}${statsLine}${c.reset}`);
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

  const mistakeCount = getMistakeCount();
  moveTo(reviewRow + 2, 1);
  const mistakePrefix = menuSelection === 1 ? `${c.green}▶ ` : "  ";
  const mistakeLabel = mistakeCount > 0
    ? `${mistakePrefix}${c.bold}${c.yellow}错题本${c.reset} ${c.gray}(${mistakeCount} 个薄弱词)${c.reset}`
    : `${mistakePrefix}${c.dim}错题本 (暂无错词)${c.reset}`;
  write(mistakeLabel);

  // 词库列表（从 index 2 开始，上次使用的排最前）
  const progress = loadProgress();
  const lastDictId = loadSettings().lastDictId;
  const sortedDicts = DICT_REGISTRY.slice().sort((a, b) => {
    if (a.id === lastDictId) return -1;
    if (b.id === lastDictId) return 1;
    return 0;
  });
  for (let i = 0; i < sortedDicts.length; i++) {
    const d = sortedDicts[i];
    const row = reviewRow + 4 + i * 2;
    moveTo(row, 1);
    const prefix = (i + 2) === menuSelection ? `${c.green}▶ ` : "  ";
    const prog = progress[d.id] ? `${c.yellow}(进度: Ch.${(progress[d.id].lastChapter || 0) + 1})${c.reset}` : "";
    const label = d.id === lastDictId ? `${c.cyan}${d.name}${c.reset}` : `${d.name}`;
    const line = `${prefix}${c.bold}${label}${c.reset} ${c.gray}${d.description}${c.reset} ${prog}`;
    write(line);
  }

  moveTo(rows - 2, 1);
  const hint = "↑↓ 选择 | Enter 确认 | Ctrl+T 切换方式 | Ctrl+C 退出";
  write(" ".repeat(centerPad(hint, cols)) + `${c.dim}${hint}${c.reset}`);
}

// ─── 渲染：章节选择菜单 ──────────────────────────────────
function renderChapterMenu() {
  syncState();
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  const dictName = DICT_REGISTRY.find(d => d.id === currentDictId).name;
  moveTo(2, 1);
  const title = `📖 ${dictName} - 选择章节 (共 ${totalChapters} 章，每章 ${CHAPTER_LENGTH} 词)`;
  write(" ".repeat(centerPad(title, cols)) + `${c.bold}${c.cyan}${title}${c.reset}`);

  moveTo(3, 1);
  const modeLine = `学习方式：${learningModeLabel(learningMode)}  (^T 切换)`;
  write(" ".repeat(centerPad(modeLine, cols)) + `${c.cyan}${modeLine}${c.reset}`);

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
  const hint = "↑↓←→ 选择 | Enter 确认 | Ctrl+T 切换方式 | Esc 返回";
  write(" ".repeat(centerPad(hint, cols)) + `${c.dim}${hint}${c.reset}`);
}

// ─── 渲染：练习界面 ──────────────────────────────────────
function renderPractice() {
  syncState();
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  if (paused) { renderPaused(cols, rows); return; }

  const mid = Math.floor(rows / 2);

  // 顶部状态栏（简洁一行）
  moveTo(1, 1);
  const chInfo = reviewMode === "replay" ? `[重放]` : reviewMode === "mistakes" ? `[错题本]` : reviewMode ? `[复习]` : `Ch.${currentChapter + 1}`;
  const progress = `${wordIndex + 1}/${chapterWords.length}`;
  const soundIcon = autoSpeak ? "🔊" : "🔇";
  const modeIcon = sessionLearningMode === LEARNING_MODES.CARD
    ? `${c.cyan}快速认词${c.reset}`
    : (hardMode ? `${c.yellow}听写${c.reset}` : `${c.cyan}拼写强化${c.reset}`);
  const statusLine = `${chInfo} ${progress}  ✓${stats.wordsCompleted}  🔥${stats.streak}${wpm > 0 ? `  ${wpm}wpm` : ""}  ${soundIcon}`;
  write(`${c.dim}  ${statusLine}${c.reset} ${modeIcon}`);

  // 进度条
  moveTo(3, 1);
  const barWidth = Math.min(cols - 6, 30);
  const filled = Math.round((wordIndex / chapterWords.length) * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  write(" ".repeat(centerPad(barWidth, cols)) + `${c.green}${bar}${c.reset}`);

  // 释义：卡片翻面后显示；拼写模式沿用原设置。
  moveTo(mid - 3, 1);
  if ((sessionLearningMode === LEARNING_MODES.CARD && cardRevealed) ||
      (sessionLearningMode === LEARNING_MODES.SPELLING && (!hideMeaning || peekWord))) {
    const meaning = currentWord.meaning || "";
    const truncMeaning = truncateDisplay(meaning, cols - 4);
    write(" ".repeat(centerPad(truncMeaning, cols)) + `${c.dim}${truncMeaning}${c.reset}`);
  }

  // 音标（灰色）
  if (currentWord.phonetic && (sessionLearningMode === LEARNING_MODES.CARD || !hideMeaning || peekWord)) {
    moveTo(mid - 2, 1);
    write(" ".repeat(centerPad(currentWord.phonetic, cols)) + `${c.dim}${currentWord.phonetic}${c.reset}`);
  }

  // ═══ 单词（视觉焦点，加粗亮色，上下空行包围）═══
  moveTo(mid, 1);
  if (sessionLearningMode === LEARNING_MODES.CARD) {
    const word = currentWord.word;
    write(" ".repeat(centerPad(word, cols)) + `${c.white}${c.bold}${word}${c.reset}`);
  } else {
    renderWord(cols);
  }

  // 错误提示
  if (errorFlash || cardPromptError) {
    moveTo(mid + 2, 1);
    const errMsg = cardPromptError ? "请先查看释义" : "✗ 重新输入";
    write(" ".repeat(centerPad(errMsg, cols)) + `${c.red}${c.bold}${errMsg}${c.reset}`);
  }

  // 底部提示（极简）
  moveTo(rows - 1, 1);
  const items = sessionLearningMode === LEARNING_MODES.CARD
    ? (cardRevealed
      ? ["J 认识", "K 模糊", "L 不认识", "Tab 重读", `^F ${focusMode ? "关专注" : "开专注"}`, `^S ${autoSpeak ? "静音" : "开声"}`, "Esc 退出"]
      : ["Enter/Space 查看释义", "Tab 重读", `^F ${focusMode ? "关专注" : "开专注"}`, `^S ${autoSpeak ? "静音" : "开声"}`, "Esc 退出"])
    : [
      "Tab 偷看",
      `^H ${hardMode ? "显示词" : "隐藏词"}`,
      `^D ${hideMeaning ? "显示释义" : "隐藏释义"}`,
      `^F ${focusMode ? "关专注" : "开专注"}`,
      `^S ${autoSpeak ? "静音" : "开声"}`,
      "Esc 退出",
    ];
  const help = items.join("  ");
  write(" ".repeat(centerPad(help, cols)) + `${c.dim}${help}${c.reset}`);
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
  write(" ".repeat(centerPad(msg1, cols)) + `${c.dim}${msg1}${c.reset}`);
  moveTo(mid + 1, 1);
  const msg2 = `Ch.${currentChapter + 1}  ✓${stats.wordsCompleted}  🔥${stats.bestStreak}`;
  write(" ".repeat(centerPad(msg2, cols)) + `${c.dim}${msg2}${c.reset}`);
}

// ─── 渲染：章节总结 ──────────────────────────────────────
function renderSummary() {
  syncState();
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  const mid = Math.floor(rows / 2);

  moveTo(mid - 4, 1);
  const title = reviewMode === "mistakes"
    ? "🎉 错题练习完成！"
    : (reviewMode ? "🎉 今日复习完成！" : `🎉 Chapter ${currentChapter + 1} 完成！`);
  write(" ".repeat(centerPad(title, cols)) + `${c.bold}${c.green}${title}${c.reset}`);

  moveTo(mid - 2, 1);
  const s1 = `完成: ${stats.wordsCompleted} 词`;
  write(" ".repeat(centerPad(s1, cols)) + s1);

  moveTo(mid - 1, 1);
  const s2 = sessionLearningMode === LEARNING_MODES.CARD
    ? `认识: ${stats.cardKnown}  模糊: ${stats.cardFuzzy}  不认识: ${stats.cardUnknown}`
    : `错误: ${stats.wrong} 次`;
  write(" ".repeat(centerPad(s2, cols)) + s2);

  moveTo(mid, 1);
  const acc = stats.wordsCompleted > 0 ? Math.round((stats.correct / (stats.correct + stats.wrong)) * 100) : 0;
  const s3 = sessionLearningMode === LEARNING_MODES.CARD ? `认词率: ${acc}%` : `正确率: ${acc}%`;
  write(" ".repeat(centerPad(s3, cols)) + `${acc >= 80 ? c.green : c.yellow}${s3}${c.reset}`);

  moveTo(mid + 1, 1);
  const s4 = `最佳连击: ${stats.bestStreak} 🔥`;
  write(" ".repeat(centerPad(s4, cols)) + s4);

  // 累计统计
  const overall = getOverallStats();
  if (overall.totalLearned > 0) {
    moveTo(mid + 3, 1);
    const divider = "─".repeat(20);
    write(" ".repeat(centerPad(20, cols)) + `${c.dim}${divider}${c.reset}`);
    moveTo(mid + 4, 1);
    const s5 = `累计学习: ${overall.totalLearned}  已掌握: ${overall.mastered}  明日待复习: ${overall.dueTomorrow}`;
    write(" ".repeat(centerPad(s5, cols)) + `${c.dim}${s5}${c.reset}`);
  }

  moveTo(rows - 2, 1);
  if (reviewMode === "mistakes") {
    const hint = `Enter 返回菜单 | Ctrl+T 切换为${learningModeLabel(toggleLearningMode(learningMode))}`;
    write(" ".repeat(centerPad(hint, cols)) + `${c.dim}${hint}${c.reset}`);
  } else if (reviewMode) {
    const remaining = getDueCount();
    const hint = remaining > 0 ? `还有 ${remaining} 词到期 | Enter 继续 | Esc 返回` : "Enter 再来一轮 | Esc 返回 | Ctrl+T 切换方式";
    write(" ".repeat(centerPad(hint, cols)) + `${c.dim}${hint}${c.reset}`);
  } else {
    const hint = "Enter 下一章 | Ctrl+T 切换方式 | Esc 返回";
    write(" ".repeat(centerPad(hint, cols)) + `${c.dim}${hint}${c.reset}`);
  }
}

// ─── 复习确认界面 ─────────────────────────────────────────
function renderReviewConfirm() {
  syncState();
  const cols = process.stdout.columns || 50;
  const rows = process.stdout.rows || 20;
  clearScreen(); hideCursor();

  const mid = Math.floor(rows / 2);

  moveTo(mid - 2, 1);
  const msg1 = "今日到期词已全部复习完毕";
  write(" ".repeat(centerPad(msg1, cols)) + `${c.green}${msg1}${c.reset}`);

  moveTo(mid, 1);
  const msg2 = `再来一轮？(${lastReviewWords.length} 词，不影响复习进度)`;
  write(" ".repeat(centerPad(msg2, cols)) + `${c.bold}${msg2}${c.reset}`);

  moveTo(mid + 2, 1);
  const hint = "Enter 再来一轮 | Esc 返回菜单";
  write(" ".repeat(centerPad(hint, cols)) + `${c.dim}${hint}${c.reset}`);
}


function createRenderer(stateReader) {
  readState = stateReader;
  return {
    renderDictMenu,
    renderChapterMenu,
    renderPractice,
    renderSummary,
    renderReviewConfirm,
  };
}

module.exports = { createRenderer };
