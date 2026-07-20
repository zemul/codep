const fs = require("fs");
const https = require("https");
const path = require("path");
const { execFile, execFileSync, execSync, spawn } = require("child_process");
const {
  AUDIO_CACHE_DIR,
  SOUNDS_DIR,
  YOUDAO_API,
  PRONUNCIATION_TYPE,
} = require("./config");

const SOUND_FILES = {
  key: path.join(SOUNDS_DIR, "key.wav"),
  correct: path.join(SOUNDS_DIR, "correct.wav"),
  wrong: path.join(SOUNDS_DIR, "wrong.wav"),
};

function getAudioPath(word) {
  return path.join(AUDIO_CACHE_DIR, `${word}.mp3`);
}

function downloadAudio(word, callback) {
  const audioPath = getAudioPath(word);
  if (fs.existsSync(audioPath)) { callback?.(audioPath); return; }
  const url = `${YOUDAO_API}?audio=${encodeURIComponent(word)}&type=${PRONUNCIATION_TYPE}`;
  const file = fs.createWriteStream(audioPath);
  https.get(url, (response) => {
    if (response.statusCode !== 200) {
      file.close();
      try { fs.unlinkSync(audioPath); } catch {}
      callback?.(null);
      return;
    }
    response.pipe(file);
    file.on("finish", () => { file.close(); callback?.(audioPath); });
  }).on("error", () => {
    file.close();
    try { fs.unlinkSync(audioPath); } catch {}
    callback?.(null);
  });
}

function playAudio(filePath) {
  if (process.platform === "darwin") execFile("afplay", [filePath], () => {});
  else {
    execFile("mpv", ["--no-terminal", filePath], (error) => {
      if (error) execFile("paplay", [filePath], (secondError) => {
        if (secondError) execFile("aplay", [filePath], () => {});
      });
    });
  }
}

function fallbackSpeak(word) {
  if (process.platform === "darwin") execFile("say", ["-v", "Samantha", "-r", "150", word], () => {});
  else execFile("espeak", [word], () => {});
}

function speak(word, enabled = true) {
  if (!enabled) return;
  const audioPath = getAudioPath(word);
  if (fs.existsSync(audioPath)) playAudio(audioPath);
  else downloadAudio(word, (file) => { if (file) playAudio(file); else fallbackSpeak(word); });
}

function prefetch(word) {
  if (word) downloadAudio(word, () => {});
}

function playSound(type, enabled = true) {
  if (!enabled) return;
  const file = SOUND_FILES[type];
  if (!file || !fs.existsSync(file)) return;
  try {
    const child = process.platform === "darwin"
      ? spawn("afplay", ["-v", "0.3", file], { stdio: "ignore", detached: true })
      : spawn("aplay", ["-q", file], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {}
}

function ensureSoundFiles() {
  let enabled = true;
  if (!fs.existsSync(SOUND_FILES.key)) {
    try { execSync(`ffmpeg -y -f lavfi -i "sine=frequency=880:duration=0.01" -ac 1 "${SOUND_FILES.key}" 2>/dev/null`, { stdio: "ignore" }); }
    catch { enabled = false; }
  }
  if (!fs.existsSync(SOUND_FILES.correct)) {
    try { execSync(`ffmpeg -y -f lavfi -i "sine=frequency=1400:duration=0.08" -ac 1 "${SOUND_FILES.correct}" 2>/dev/null`, { stdio: "ignore" }); } catch {}
  }
  if (!fs.existsSync(SOUND_FILES.wrong)) {
    try { execSync(`ffmpeg -y -f lavfi -i "sine=frequency=300:duration=0.08" -ac 1 "${SOUND_FILES.wrong}" 2>/dev/null`, { stdio: "ignore" }); } catch {}
  }
  return enabled;
}

function hasAudioPlayer() {
  if (process.platform === "darwin") return true;
  return ["mpv", "paplay", "aplay"].some((player) => {
    try { execFileSync("which", [player], { stdio: "ignore" }); return true; } catch { return false; }
  });
}

module.exports = { downloadAudio, speak, prefetch, playSound, ensureSoundFiles, hasAudioPlayer };
