# Adapters

Codep 通过 adapter（适配器）支持不同的 AI agent。每个 adapter 负责感知对应 agent 的忙/闲状态，写入 `.ai-state` 文件。

## 接口约定

一个 adapter 需要提供两件事：

1. **busy 信号** — 当 AI 开始工作时，写 `busy` 到 `$CODEP_HOME/.ai-state`
2. **idle 信号** — 当 AI 完成工作时，写 `idle` 到 `$CODEP_HOME/.ai-state`

可选：busy 时直接执行 `tmux select-pane -t codep:0.1` 切焦点到练习 pane。

## 已支持

### Claude Code

通过 [Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) 实现，零延迟。

- `on-busy.sh` — 绑定 `UserPromptSubmit` 事件
- `on-idle.sh` — 绑定 `Stop` 事件

安装时自动配置到 `~/.claude/settings.json`。

### Kiro CLI

通过 [Hooks](https://docs.aws.amazon.com/kiro/latest/userguide/hooks.html) 实现，零延迟。

- `on-busy.sh` — 绑定 `userPromptSubmit` 事件
- `on-idle.sh` — 绑定 `stop` 事件

安装时自动配置到 `~/.kiro/agents/default.json`。

使用：

```bash
codep                          # 自动检测（优先 kiro-cli）
CODEP_AGENT=kiro codep       # 手动指定 Kiro
CODEP_AGENT=claude-code codep  # 手动指定 Claude Code
CODEP_AGENT=codex codep      # 手动指定 Codex
CODEP_AGENT=gal codep        # 手动指定 GAL
```

### GAL

通过 [Hooks](https://docs.gal.dev/hooks) 实现，零延迟。

- `on-busy.sh` — 绑定 `pre_turn` 事件（用户输入进入 agent 之前）
- `on-idle.sh` — 绑定 `post_turn` 事件（agent 回复完成之后）

安装时自动配置到 `~/.gal/hooks.yaml`。

### OpenAI Codex CLI

通过 [Hooks](https://developers.openai.com/codex/hooks/) 实现，零延迟。

- `on-busy.sh` — 绑定 `UserPromptSubmit` 事件
- `on-idle.sh` — 绑定 `Stop` 事件（输出 JSON `{"continue": true}`）

安装时自动配置到 `~/.codex/hooks.json`。

## 添加新 adapter

### 通用（任何 agent）

对于没有 hooks 的 agent，可以用轮询方式（类似原来的 monitor.sh）：

```bash
# adapters/generic-poll.sh
# 每 2 秒检测 agent pane 的输出，判断忙闲
```

## 贡献新 adapter

1. 在 `adapters/` 目录创建一个子目录，如 `adapters/codex/`
2. 提供 `install.sh` — 配置该 agent 的状态检测
3. 提供 `README.md` — 说明配置方法
4. 确保写入的文件路径使用 `$CODEP_HOME`（默认 `~/codep`）

提交 PR 即可。
