function write(s) { process.stdout.write(s); }
function clearScreen() { write("\x1b[2J\x1b[H"); }
function moveTo(r, c) { write(`\x1b[${r};${c}H`); }
function hideCursor() { write("\x1b[?25l"); }
function showCursor() { write("\x1b[?25h"); }

function displayWidth(value) {
  const text = String(value).replace(/\x1b\[[0-9;]*m/g, "");
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (/\p{Mark}/u.test(char)) continue;
    const isWide =
      code >= 0x1100 && (
        code <= 0x115f || code === 0x2329 || code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe19) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1faff) ||
        (code >= 0x20000 && code <= 0x3fffd)
      );
    width += isWide ? 2 : 1;
  }
  return width;
}

function truncateDisplay(value, maxWidth, suffix = "...") {
  const text = String(value);
  if (displayWidth(text) <= maxWidth) return text;
  const targetWidth = Math.max(0, maxWidth - displayWidth(suffix));
  let result = "";
  for (const char of text) {
    if (displayWidth(result + char) > targetWidth) break;
    result += char;
  }
  return result + suffix;
}

function centerPad(value, totalWidth) {
  const visibleLen = typeof value === "number" ? value : displayWidth(value);
  return Math.max(0, Math.floor((totalWidth - visibleLen) / 2));
}

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

module.exports = {
  write,
  clearScreen,
  moveTo,
  hideCursor,
  showCursor,
  displayWidth,
  truncateDisplay,
  centerPad,
  c,
};
