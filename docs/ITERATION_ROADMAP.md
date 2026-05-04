# PilotFlow 长期迭代路线图

> 版本: v2.0 (2026-05-04)
> 依据: `materials/03_deep_research_reports/10_pilotflow_competitive_strategy_2026-05-04.md`
> 目标: 把 PilotFlow 从“能调飞书 API 的项目机器人”推进成“飞书群聊项目启动治理层”。

## 一、核心判断

飞书 OpenClaw、飞书项目、飞书 CLI、Aily 都在快速补齐底层工具执行能力。PilotFlow 的长期价值不应押在“我们也能创建文档/表格/任务”，而应押在更上游的项目治理：

| 层级 | 归属 | PilotFlow 要做什么 |
| --- | --- | --- |
| 飞书能力层 | 飞书 OpenAPI / CLI / OpenClaw / 飞书项目 | 尽量复用，不重复造底层工具 |
| Agent 语义层 | Hermes Agent | 理解上下文、总结目标/承诺/风险/行动项、选择下一步 |
| 项目治理层 | PilotFlow | 计划、确认、幂等、风险裁决、证据链、项目化建议 |

一句话：**PilotFlow 是飞书项目之前的群聊意图层和项目启动治理层。**

## 二、必须坚持的产品边界

- 不做通用飞书工具箱；底层工具越通用，越应该交给 OpenClaw、飞书 CLI 或飞书 OpenAPI adapter。
- 不用关键词/正则冒充 Agent 理解；语义理解由 Hermes 完成，PilotFlow 接收结构化字段并执行。
- 不把“项目管理系统”重做一遍；飞书项目 OpenAPI 可用时，优先作为权威项目后端。
- 不以新增 API 数量作为进度；优先确认、幂等、证据链、eval、真实链路。
- 不在 README/复赛材料里写未验证能力；真实飞书链路、本地测试、运行边界必须分开说明。

## 三、近期优先级

### Round A: 证据层与评测基线

目标：证明 PilotFlow 不是 happy path demo，而是可复验系统。

| 任务 | 交付物 | 验证标准 |
| --- | --- | --- |
| Flight Recorder 基础模块 | `plugins/pilotflow/trace.py` | 可生成脱敏 JSON trace 和 Markdown 摘要 |
| Trace schema 文档 | `plugins/pilotflow/TRACE_SCHEMA.md` | 定义 run_id、source、intent、plan、confirmation、tool_calls、redaction |
| Eval case 文档 | `docs/EVAL_CASES.md` | 至少 10 条覆盖创建、确认、过期、重复、失败、脱敏 |
| Eval 自动化 | `tests/test_eval_cases.py` | 不连飞书也能验证 planner/confirmation/trace 的核心行为 |

### Round B: 统一确认与幂等

目标：所有副作用动作都可控、可取消、可重放、不会重复执行。

| 任务 | 交付物 | 验证标准 |
| --- | --- | --- |
| confirm token 协议 | `confirm_token` / TTL / action snapshot | 过期确认拒绝执行 |
| idempotency key | 基于 chat/message/action/plan 生成 key | 重复消息或重复点击不重复创建工件 |
| 风险动作统一门控 | 删除、外发、权限收缩、新联系人外联 | 必须先确认 |
| trace 贯通确认链路 | 计划、确认、执行均写 trace | 可回看谁确认了什么 |

### Round C: 飞书项目适配方向

目标：避免与飞书项目竞争，把它作为未来权威后端。

| 任务 | 交付物 | 验证标准 |
| --- | --- | --- |
| 飞书项目 OpenAPI 调研 | `docs/FEISHU_PROJECT_ADAPTER_RESEARCH.md` | 明确能否创建/更新项目、工作项、状态 |
| 后端接口抽象 | `ProjectBackend` 草案 | Base/tasks 后端和 Feishu Project 后端可切换 |
| 当前 fallback 声明 | README / ARCHITECTURE | Base/tasks 是 fallback，不是最终项目系统 |

## 四、中期方向

| 方向 | 说明 |
| --- | --- |
| 群聊信号巡检 | Hermes 总结群聊目标/承诺/风险/行动项，PilotFlow 冒泡项目化建议 |
| 项目模板资产 | 课程项目、黑客松、答辩、社团活动、实验室协作模板 |
| 风险裁决卡 | 高风险操作给理由、选项、确认入口和 trace 记录 |
| 业务证据页 | Markdown/HTML Flight Recorder，评委和项目 owner 都能读懂 |
| 私聊/群聊权限设计 | 私聊更主动，群聊更保守，首次外联和权限收缩先问 |

## 五、明确不做

- 不恢复 `master` 分支；默认分支只用 `main`，新工作用明确功能分支名。
- 不做大而全 Web 控制台；飞书 IM 和卡片是主入口。
- 不做移动端小程序；先把飞书原生卡片体验跑稳。
- 不继续堆底层飞书 API；新增 API 前先判断是否服务项目治理层。
- 不把长期研究报告当成已验证事实；研究材料只能转成待验证任务。

## 六、每轮验证清单

```text
1. git status --short --branch
2. C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py tests\test_setup.py tests\test_plugin_registration.py tests\test_trace.py tests\test_verify_wsl_feishu_runtime.py -q
3. C:\Users\Ding\miniforge3\python.exe setup.py --hermes-dir D:\Code\LarkProject\hermes-agent
4. WSL Hermes runtime 验证真实飞书链路，记录到 docs/LIVE_TEST_EVIDENCE.md
5. git add 具体文件，不用 git add .
6. git commit -m "<type>: <summary>"
7. git push origin main
```

## 七、当前 next step

1. 把 `trace.py` 接入 `generate_plan` / `create_project_space` 的返回结果，先不落盘，只返回脱敏 trace 摘要。
2. 补 `TRACE_SCHEMA.md` 和 `EVAL_CASES.md`。
3. 给确认门控补 `confirm_token` 和 idempotency key。
4. 调研飞书项目 OpenAPI，决定是否新增 `ProjectBackend` 抽象。
