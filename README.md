# Codep ⌨️

AI 等待时间背单词 —— 在 AI agent（Claude Code / Kiro CLI）执行任务时，自动在 tmux 分屏里启动英语拼写练习。

灵感来自 [Qwerty Learner](https://github.com/RealKai42/qwerty-learner)，为终端用户设计。

## 效果

```
┌─────────────── claude ───────────────┬──────── codep ─────────────┐
│                                      │                             │
│  > 帮我重构 auth 模块                │    Ch.3 5/20  ✓4  🔥3      │
│                                      │                             │
│  好的，我来分析一下...               │    ████████░░░░░░░░░░       │
│  [正在编辑 src/auth.ts]              │                             │
│                                      │    n. 算法；运算法则        │
│                                      │    /ˈælɡərɪðəm/            │
│                                      │                             │
│                                      │       algo▌rithm            │
│                                      │                             │
│                                      │                             │
│                                      │  Tab 偷看  ^H 隐藏词  q 退出│
└──────────────────────────────────────┴─────────────────────────────┘
```

## 特性

- **自动感知 AI 状态** — AI 开始工作时自动激活练习，完成时切回焦点（Hooks 零延迟）
- **逐字母反馈** — 打对变绿，打错整词重来（Qwerty Learner 风格）
- **真人发音** — 有道词典 API，自动缓存到本地
- **机械键盘音效** — 按键/正确/错误各有音效
- **词库系统** — 程序员常见词(1700)、CET-4(2607)、自定义词库
- **章节制** — 每章 20 词，进度自动保存
- **多难度模式** — 隐藏单词（听写）、隐藏释义，自由组合
- **Tab 偷看** — 听写模式下按 Tab 闪现 1 秒看答案
- **不打断** — 正在输入时不会强制切换焦点

## 安装

一行命令：

```bash
curl -fsSL https://raw.githubusercontent.com/zemul/codep/main/install.sh | bash
```

自动完成：克隆代码 → 配置 AI Agent Hooks → 添加 `codep` 别名。

安装后新开终端或 `source ~/.zshrc`，然后：

```bash
codep  # 启动
```

### 手动安装

```bash
git clone https://github.com/zemul/codep.git ~/codep
~/codep/codep.sh  # 首次运行自动配置 hooks
```

## 使用

```bash
codep              # 启动（自动检测 kiro-cli / claude / codex）
codep --model sonnet  # 带 AI agent 参数
```

指定 agent：

```bash
CODEP_ADAPTER=kiro codep         # 强制用 Kiro CLI
CODEP_ADAPTER=claude-code codep  # 强制用 Claude Code
CODEP_ADAPTER=codex codep        # 强制用 Codex
```

## 快捷键

| 键 | 功能 |
|---|---|
| `Tab` | 偷看（闪现单词+释义 1 秒，同时朗读） |
| `Ctrl+H` | 切换隐藏/显示单词（听写模式） |
| `Ctrl+D` | 切换隐藏/显示释义 |
| `Ctrl+S` | 切换静音 |
| `q` | 退出章节（在单词开头时） |
| `↑↓` + `Enter` | 菜单导航 |

## 难度组合

| 显示单词 | 显示释义 | 难度 |
|---|---|---|
| ✓ | ✓ | 入门 — 看着抄 |
| ✓ | ✗ | 中等 — 盲打练手速 |
| ✗ | ✓ | 进阶 — 看义拼写 |
| ✗ | ✗ | 地狱 — 纯听写 |

## 词库

| 词库 | 词数 | 章节 | 适合 |
|---|---|---|---|
| 程序员常见词 | 1700 | 85 | 日常编程 |
| CET-4 四级 | 2607 | 131 | 英语考试 |
| 自定义 (words.json) | 80 | 4 | 自己添加 |

### 添加自定义词库

在 `dicts/` 下放 JSON 文件，格式：

```json
[
  { "name": "algorithm", "trans": ["n. 算法"], "usphone": "ˈælɡərɪðəm" }
]
```

然后在 `index.js` 的 `DICT_REGISTRY` 数组里注册。

## 工作原理

```
┌─────────────────────────────────────────────┐
│  AI Agent (Claude Code / Kiro CLI)          │
│                                             │
│  UserPromptSubmit hook → on-busy.sh         │
│       写 "busy" 到 .ai-state               │
│                                             │
│  Stop hook → on-idle.sh                     │
│       写 "idle" 到 .ai-state               │
└─────────────────────────────────────────────┘
                    │
                    ▼ 文件
┌─────────────────────────────────────────────┐
│  index.js (练习 UI)                         │
│                                             │
│  每 500ms 检查 .ai-state                    │
│  busy → 激活练习 + 焦点切到练习 pane         │
│  idle → 焦点切回 AI pane（仅一次）           │
└─────────────────────────────────────────────┘
```

## 依赖

| 依赖 | 用途 | 安装 |
|---|---|---|
| Node.js 16+ | 运行练习 UI | [nodejs.org](https://nodejs.org) |
| tmux | 分屏管理 | macOS: `brew install tmux` / Linux: `sudo apt install tmux` |
| AI agent | Claude Code / Codex / Kiro 等 | 按各自文档安装 |

安装脚本会自动检查这些依赖。

## License

MIT
