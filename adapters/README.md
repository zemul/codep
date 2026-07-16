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

- `hooks/on-busy.sh` — 绑定 `UserPromptSubmit` 事件
- `hooks/on-idle.sh` — 绑定 `Stop` 事件

安装时自动配置到 `~/.claude/settings.json`。

## 添加新 adapter

### OpenAI Codex

Codex CLI 支持 `--notify` 参数或可以包装启动脚本：

```bash
# adapters/codex.sh
# 包装 codex 命令，拦截输入输出来判断状态
```

### Kiro CLI

如果 Kiro 支持类似的 hooks 机制，创建对应的 hook 脚本即可。

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
