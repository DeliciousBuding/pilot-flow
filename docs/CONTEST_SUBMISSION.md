# 复赛材料包

## 项目定位

PilotFlow 是飞书群里的 AI 项目运行官。群聊一句需求 → 确认卡片 → 一键创建飞书文档、多维表格、任务、日历、群卡片、权限和提醒。Hermes Agent 负责理解意图和选择下一步，PilotFlow 负责确认门控和飞书执行。

与飞书项目互补：PilotFlow 解决项目形成前的群聊意图识别和启动问题；飞书项目承载创建后的深度管理。飞书项目 OpenAPI 可用后优先对接为权威项目后端。

## 一、个人信息

| 姓名 | 负责工作 | 基本信息 | 实习信息 |
| --- | --- | --- | --- |
| **TODO** | 产品设计、Hermes 插件实现、飞书 API 集成、测试体系、文档和演示 | **TODO** | **TODO** |

## 二、项目结果展示

**痛点**：群聊讨论散，目标/成员/交付物/风险不会自动沉淀为协作产物。  
**方案**：Hermes Agent 底座 + 飞书 OpenAPI 直连，群聊入口 → 项目启动流程。  
**可信**：写入前发卡片确认，确认后才执行，状态可追踪、可取消、可重试。

### 演示路线

| 场景 | 输入 | 展示重点 |
| --- | --- | --- |
| 成功路径 | `@PilotFlow 帮我准备答辩项目空间，成员小王、小李，交付物是项目简报和任务清单，5月7日截止` | 计划卡 → 文字"确认执行" → 文档/Base/任务/日历/入口卡 |
| 取消路径 | 同上，点击取消按钮或回复"取消" | 原卡片变灰，清理确认门控，不创建产物 |
| 卡片确认 | 点击计划卡 ✅ 确认按钮 | 原卡片 → 处理中 → 已创建，通过 `/card` 桥接不依赖直调测试路径 |
| 状态看板 | `@PilotFlow 项目进展如何？` | 看板卡 + 截止倒计时色标 |
| 多轮更新 | `@PilotFlow 把答辩项目的截止时间改成5月10日` | 状态同步 + 群通知 |
| Agent 主动巡检 | `pilotflow_scan_chat_signals` 接收 Hermes 总结的信号，冒泡建议卡 | 证明不是关键词匹配，是 Agent 语义理解后调用工具 |

### 演示入口

- GitHub: https://github.com/DeliciousBuding/PilotFlow
- Demo script: https://github.com/DeliciousBuding/PilotFlow/blob/main/docs/demo/README.md
- Architecture: https://github.com/DeliciousBuding/PilotFlow/blob/main/docs/ARCHITECTURE.md

## 三、Hermes 与 PilotFlow 边界

| 层级 | Hermes 提供 | PilotFlow 提供 |
| --- | --- | --- |
| Agent 底座 | LLM 调度、工具注册、飞书网关、消息通道、memory、cron | 项目语义、确认门控、pending plan、风险检测、多轮状态 |
| 飞书连接 | 网关接收消息、发送文本消息、卡片 action 路由 | 文档/Base/任务/日历创建、权限、成员解析、项目入口卡、卡片反馈 |
| 用户体感 | 通用 agent runtime | 群聊需求 → 项目产物的一体化工作流 |

**不改 Hermes 源码**。PilotFlow 通过 `ctx.register_tool()` 注册 9 个工具和 1 个 `/card` 桥接命令；文本消息复用 `registry.dispatch("send_message")`；memory/cron 走 `registry.dispatch`。

## 四、当前证据

| 证据 | 状态 |
| --- | --- |
| 本地测试 | `pytest tests -q` — 328 passed（含单元、集成、配置校验、多进程并发） |
| WSL 安装复现 | `python setup.py --hermes-dir <path> --hermes-home ~/.hermes` — 配置校验 + 6 文件复制 + display 降噪 |
| WSL runtime verifier | `scripts/verify_wsl_feishu_runtime.py` 支持 `--probe-llm` / `--send-card` / `--verify-health-check` / `--verify-card-command-bridge` / `--verify-history-suggestions` 五模式，输出脱敏布尔字段 |
| 完整 @Bot 端到端 | 2026-05-04 真实群 @PilotFlow → mimo-v2.5-pro Agent 推理 → 计划卡 → 确认 → 飞书产物 → 入口卡，脱敏记录见 [LIVE_TEST_EVIDENCE](LIVE_TEST_EVIDENCE.md) |
| Agent 主驾驶硬证据 | 2026-05-05 view_mode / template / risk_level / page 4 处必须 Agent 显式传字段，`allow_inferred_*=true` 仅回归用，6 个对应单测 |
| 卡片失败可重试 | 13 个 fix commit 覆盖 7 类 retryable 卡片失败，按钮失败后保留 action ref |
| 重启后恢复 | 8+ 场景覆盖看板/详情/催办/批量待办/截止更新从脱敏 state + 私有 refs 恢复 |
| 录屏 | 提交前补齐（4 段，私有材料包） |
| 真实产物链接 | 提交前汇总至私有飞书云文档（不进 GitHub） |

## 五、风险与应对

| 风险 | 应对 |
| --- | --- |
| LLM 401 认证失败 | `scripts/verify_wsl_feishu_runtime.py --probe-llm` 一行脱敏探针；INSTALL.md 已写 401 排查步 |
| 现场飞书权限不足 | 提前在测试群跑完整 e2e，保留录屏和真实产物链接 |
| 卡片按钮在网关不续跑 | `/card` 桥接优先；文本 `确认执行` 兜底；失败保留 action ref 可重试 |
| 群聊暴露内部工具名 | setup.py 配置 `display.platforms.feishu.tool_progress=off` |
| 隐私泄漏 | 公共 state 脱敏（不含 URL/token/open_id）；`<at>` markup 注入清理；memory 默认不存成员姓名 |
| 新机安装失败 | setup.py 校验 `.env` / `config.yaml` / 插件 / skill 安装结果 |

## 六、提交前补齐

| 材料 | 状态 | 存放位置 |
| --- | --- | --- |
| 4 段录屏（成功/取消/看板/多轮） | 待补齐 | 飞书云空间私有链接 |
| 真实产物链接汇总 | 待补齐 | 飞书云文档"PilotFlow 复赛证据私有材料包" |
| 答辩 Q&A | [Q_AND_A.md](Q_AND_A.md) 已就位 | GitHub 公开仓库（不含真实链接） |
| 演示脚本 | [demo/README.md](demo/README.md) 已就位 | GitHub 公开仓库 |

> 公开仓库不写：真实 chat_id / open_id / message_id / Feishu URL / token / app secret / 个人姓名。
