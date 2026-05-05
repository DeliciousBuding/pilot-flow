# Context Subscription Spike Report

> 时间：2026-05-05 13:30 +0800
> 背景：PilotFlow 当前必须 @bot 才触发，PilotFlow 无法主动识别群聊中的项目讨论，只能被动响应。
> 目标：确认 hermes-agent feishu gateway 能否订阅非 @ 消息，让 PilotFlow 从"被动等待 @"变"主动巡检"。

## 结论：✅ 可行，且不需改 hermes core

### 关键发现

hermes-agent feishu gateway（`gateway/platforms/feishu.py`）已原生支持 **per-group `require_mention` 配置**：

```python
# feishu.py:1420-1427
per_chat_require_mention: Optional[bool] = None
if "require_mention" in rule_cfg:
    per_chat_require_mention = _to_boolean(rule_cfg.get("require_mention"))
group_rules[str(chat_id)] = FeishuGroupRule(
    policy=str(rule_cfg.get("policy", "open")).strip().lower(),
    allowlist=set(str(u).strip() for u in rule_cfg.get("allowlist", [])),
    blacklist=set(str(u).strip() for u in rule_cfg.get("blacklist", [])),
    require_mention=per_chat_require_mention,
)
```

### 配置方式

在 `~/.hermes/config.yaml` 里（不需改代码，只需配置）：

```yaml
feishu:
  group_rules:
    oc_xxx_pilotflow_target_group:  # PilotFlow 订阅的群 chat_id
      policy: open
      require_mention: false          # 群内所有消息都进 Agent
    oc_xxx_other_group:
      policy: allowlist
      require_mention: true           # 其他群保持 @ 才触发
```

### 实现路径（无需改 Hermes core）

1. **INSTALL.md 加"群聊订阅模式"段落**（文档优先，10min）
2. **给 PilotFlow 加 `pilotflow_subscribe_chat` 工具**（功能优先，30min）：
   - `subscribe(chat_id, mode="observe")` — PilotFlow 写入 `pilotflow_subscriptions.json`，setup.py 安装时自动写对应 config.yaml `group_rules` 条目
   - Agent 收到所有群消息后调 `pilotflow_scan_chat_signals`，主动冒泡"要不要整理成项目？"
3. **Hermes memory/cron 辅助**：记录每群最近 10 条消息摘要，Agent 在下一条 @ 消息时能回顾上下文

### 风险

| 风险 | 概率 | 缓解 |
|---|---|---|
| LLM 成本爆炸（每条消息都推理） | 高 | 订阅群时自动给 Agent 加 system prompt "只识别目标/承诺/风险/行动项时才响应，闲聊静默" |
| 群内 @ 误触发 | 中 | 订阅后群内不再需要 @；但 Agent 内部判断"无相关信号时不发任何响应"，避免刷屏 |
| 用户不知道要配 group_rules | 高 | INSTALL.md + USER_GUIDE.md 覆盖 |
| 订阅群的 privacy | 中 | 群消息进入 PilotFlow memory，需告知群成员 |

### 下一步

1. **先写 USER_GUIDE.md（30min）**—— 解决当前最大可用性瓶颈（用户不知道能问什么）
2. INSTALL.md 加 "群聊订阅模式"配置段（10min）
3. 考虑 `pilotflow_subscribe_chat` 工具（功能层，30min）
