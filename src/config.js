const os = require("os");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = process.env.CODEP_DATA_DIR || path.join(os.homedir(), ".codep");
const DICTS_DIR = path.join(ROOT_DIR, "dicts");
const STATE_FILE = path.join(ROOT_DIR, ".ai-state");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const REVIEW_FILE = path.join(DATA_DIR, "review.json");
const AUDIO_CACHE_DIR = path.join(DATA_DIR, "audio-cache");
const SOUNDS_DIR = path.join(ROOT_DIR, "sounds");

const POLL_INTERVAL_MS = 500;
const ERROR_FLASH_MS = 600;
const SESSION_NAME = "codep";
const CHAPTER_LENGTH = 20;
const YOUDAO_API = "https://dict.youdao.com/dictvoice";
const PRONUNCIATION_TYPE = 2;

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

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  DICTS_DIR,
  STATE_FILE,
  PROGRESS_FILE,
  SETTINGS_FILE,
  REVIEW_FILE,
  AUDIO_CACHE_DIR,
  SOUNDS_DIR,
  POLL_INTERVAL_MS,
  ERROR_FLASH_MS,
  SESSION_NAME,
  CHAPTER_LENGTH,
  YOUDAO_API,
  PRONUNCIATION_TYPE,
  DICT_REGISTRY,
};
