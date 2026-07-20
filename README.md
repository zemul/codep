# Codep ⌨️

AI 等待时间背单词 —— 在 AI agent（Claude Code / Kiro CLI / Codex / GAL）执行任务时，自动在 tmux 分屏里启动英语拼写练习。

![demo](https://github.com/zemul/codep/releases/download/v1.0.0/export-1784207294336.1.gif)

## 特性

- **自动感知 AI 状态** — AI 开始工作时自动激活练习，完成时切回焦点（Hooks 零延迟）
- **逐字母反馈** — 打对变绿，打错整词重来（Qwerty Learner 风格）
- **两种学习方式** — 快速认词翻卡片，或使用拼写强化严格检验
- **真人发音** — 有道词典 API，自动缓存到本地
- **机械键盘音效** — 按键/正确/错误各有音效
- **词库系统** — 程序员常见词(1700)、CET-4(2607)、自定义词库
- **章节制** — 每章 20 词，进度自动保存
- **智能间隔复习** — 基于 SM-2 根据掌握情况安排下一次复习
- **今日复习** — 自动汇总到期单词，优先处理即将遗忘的内容
- **多难度模式** — 隐藏单词（听写）、隐藏释义，自由组合
- **Tab 偷看** — 听写模式下按 Tab 闪现 1 秒看答案
- **错题本** — 自动收集不认识、模糊、拼错和偷看过的薄弱词
- **不打断** — 正在输入时不会强制切换焦点

## 安装

```bash
curl -fsSL https://github.com/zemul/codep/releases/latest/download/install.sh | bash
```

自动完成：定位最新 Release → 克隆对应 tag → 配置 AI Agent Hooks → 添加 `codep` 命令。

安装后新开终端或 `source ~/.zshrc`，然后：

```bash
codep  # 启动
```

### 手动安装

```bash
git clone https://github.com/zemul/codep.git ~/codep
~/codep/codep.sh
```

## 使用

```bash
codep              # 启动（自动检测 kiro-cli / claude / codex / gal）
codep --model sonnet  # 带 AI agent 参数
```

指定 agent：

```bash
codep -a kiro          # 强制用 Kiro CLI
codep -a claude-code   # 强制用 Claude Code
codep -a codex         # 强制用 Codex
codep -a gal           # 强制用 GAL
```

## 快捷键

| 键 | 功能 |
|---|---|
| `Tab` | 偷看（闪现单词+释义 1 秒，同时朗读） |
| `Ctrl+H` | 切换隐藏/显示单词（听写模式） |
| `Ctrl+D` | 切换隐藏/显示释义 |
| `Ctrl+F` | 切换专注模式（完成整轮前不自动切回 AI） |
| `Ctrl+S` | 切换静音 |
| `Ctrl+T` | 在菜单或总结页切换快速认词/拼写强化 |
| `Esc` | 退出/返回上级菜单 |
| `↑↓` + `Enter` | 菜单导航 |

学习方式在一轮开始后保持不变；如需切换，请退出到菜单或在总结页切换。程序会记住上次选择，新老用户在没有保存选择时均默认使用拼写强化。

### 快速认词

先看单词并在心中回忆释义，按 `Enter` 或空格翻面，然后评分：

| 主按键 | 兼容按键 | 反馈 |
|---|---|---|
| `J` | `1` | 认识 |
| `K` | `2` | 模糊 |
| `L` | `3` | 不认识 |

快速认词中按 `Tab` 可以重新朗读当前单词；拼写强化中 `Tab` 仍用于偷看答案。

必须翻面后才能评分。模糊和不认识的词会在本轮稍后再次出现，每个词最多额外出现两次；只有首次评分会更新长期复习计划。

### 间隔复习

每个完成学习的单词都会加入统一的间隔复习计划。启动 codep 时如果存在到期单词，会优先进入“今日复习”；也可以从首页手动进入。

复习间隔会根据表现动态调整：

| 学习结果 | 调度变化 |
|---|---|
| 拼写直接正确 | 正常延长间隔，熟练度增长最快 |
| 卡片选择认识 | 延长间隔，但比直接拼写正确更保守 |
| 卡片选择模糊 / Tab 偷看 | 保持较短间隔，降低后续增长速度 |
| 卡片选择不认识 / 拼写错误 | 重置为短间隔，并加入错题本 |

首页会显示今日到期数量、累计学习、已掌握和明日待复习数量。完成今日复习后可以“再来一轮”，重放不会重复修改长期复习计划。

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

然后在 `src/config.js` 的 `DICT_REGISTRY` 数组里注册。

## 工作原理

```
┌─────────────────────────────────────────────────────┐
│  AI Agent (Claude Code / Kiro CLI / Codex / GAL)    │
│                                                     │
│  UserPromptSubmit hook → on-busy.sh                 │
│       写 "busy" 到 .ai-state                       │
│                                                     │
│  Stop hook → on-idle.sh                             │
│       写 "idle" 到 .ai-state                       │
└─────────────────────────────────────────────────────┘
                    │
                    ▼ 文件
┌─────────────────────────────────────────────┐
│  index.js → src/ui/input.js (练习 UI)       │
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
| AI agent | Claude Code / Codex / Kiro / GAL 等 | 按各自文档安装 |

> Windows 用户请在 WSL 中使用。

安装脚本会自动检查这些依赖。

## 致谢

- [Qwerty Learner](https://github.com/RealKai42/qwerty-learner) — 核心交互设计参考（逐字母反馈、整词重来、Tab 偷看等）
- [有道词典](https://www.youdao.com/) — 真人发音 API
- [LinuxDO](https://linux.do/) — 感谢社区的支持与反馈

## License

MIT
