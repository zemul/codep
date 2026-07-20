const fs = require("fs");
const { execFileSync } = require("child_process");
const { SESSION_NAME, STATE_FILE } = require("./config");

function focusPane(index) {
  try { execFileSync("tmux", ["select-pane", "-t", `${SESSION_NAME}:0.${index}`], { stdio: "ignore" }); } catch {}
}

function focusAIPane() {
  focusPane(0);
}

function focusPracticePane() {
  focusPane(1);
}

function readAIState() {
  try {
    return fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, "utf8").trim() : "idle";
  } catch {
    return "idle";
  }
}

module.exports = { focusAIPane, focusPracticePane, readAIState };
