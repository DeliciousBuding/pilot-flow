<div align="center">

# ✈️ PilotFlow

**飞书群里的 AI 项目运行官**<br/>
**A Feishu-native AI project operations officer inside your group chat**

把群聊里的目标、承诺、风险和材料，推进成确认过的计划、可执行任务、可追踪状态和交付总结。<br/>
Turn group-chat discussion into confirmed plans, executable tasks, traceable state, and delivery summaries.

[![Status](https://img.shields.io/badge/status-MVP%20prototype-orange)](#-mvp-progress)
[![Feishu](https://img.shields.io/badge/Feishu-native-00A4FF)](#-feishu-native-surfaces)
[![Agent](https://img.shields.io/badge/Agent-as%20Pilot-6f42c1)](#-product-experience)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](docs/DEVELOPMENT.md)
[![lark-cli](https://img.shields.io/badge/lark--cli-1.0.21-blue)](docs/DEVELOPMENT.md)
[![GitHub stars](https://img.shields.io/github/stars/DeliciousBuding/pilot-flow?style=social)](https://github.com/DeliciousBuding/pilot-flow/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/DeliciousBuding/pilot-flow)](https://github.com/DeliciousBuding/pilot-flow/commits/main)

[中文](#-中文) · [English](#-english) · [Product](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Docs](docs/README.md)

</div>

---

## 📖 Table of Contents

- [📌 中文](#-中文)
- [🌍 English](#-english)
- [🎯 Why PilotFlow](#-why-pilotflow)
- [🧭 Product Experience](#-product-experience)
- [🔁 Product Loop](#-product-loop)
- [🧠 Architecture](#-architecture)
- [🧩 Feishu-Native Surfaces](#-feishu-native-surfaces)
- [🧪 MVP Progress](#-mvp-progress)
- [🗺️ Roadmap Snapshot](#-roadmap-snapshot)
- [📚 Documentation](#-documentation)
- [⚡ Prototype Demo](#-prototype-demo)
- [🔐 Safety Principles](#-safety-principles)
- [📈 Star History](#-star-history)
- [🤝 Contributing](#-contributing)
- [🙏 Acknowledgments](#-acknowledgments)

## 📌 中文

PilotFlow 不是普通聊天机器人，不是文档生成器，也不是只面向程序员的代码 Agent。它的产品定位是：

> **像一个项目经理一样，在飞书群里推动团队从讨论走向交付。**

在真实协作里，项目的关键信息经常散落在群聊中：目标、负责人、截止时间、风险、材料、确认意见、临时承诺。PilotFlow 让 AI Agent 成为主驾驶，负责理解讨论、生成项目飞行计划、请求人类确认、调用飞书原生工具，并把结果沉淀到 Doc、Base、Task、群公告和总结消息中。

GUI 或 Chat Tab 不是主流程，它只是仪表盘和辅助操作台。真正的产品体验应该发生在团队已经工作的地方：**飞书 IM、卡片、文档、多维表格和任务系统**。

## 🌍 English

PilotFlow is a Feishu-native AI project operations officer. It lives inside a group chat, understands project intent, proposes a flight plan, asks for human confirmation, executes through Feishu tools, records every step, and sends a delivery summary back to the team.

The product principle is simple:

> **Agent as Pilot. GUI as cockpit. Humans stay in control.**

PilotFlow is designed for practical team operations first: fewer lost decisions, fewer forgotten tasks, clearer project state, and a traceable AI workflow.

## 🎯 Why PilotFlow

| Team pain | PilotFlow response | Feishu-native output |
| --- | --- | --- |
| Discussion is scattered across group messages | Extract goals, members, deadlines, deliverables, and risks | Project flight plan |
| Verbal agreement is hard to track | Ask for explicit confirmation before side effects | Card or text confirmation |
| Tasks and risks disappear in chat history | Write structured project state | Base records and Tasks |
| Project entry points are hard to find | Publish a stable project entry | Pinned entry message or group announcement |
| AI actions are hard to trust | Record plans, tool calls, artifacts, fallbacks, and errors | Flight Recorder |

## 🧭 Product Experience

```mermaid
journey
    title PilotFlow project launch journey
    section Discuss
      Team discusses a new project in Feishu group: 3: Team
      PilotFlow extracts goal, owners, deliverables, deadline, risks: 5: PilotFlow
    section Confirm
      PilotFlow posts a project flight plan: 5: PilotFlow
      Human owner confirms or edits the plan: 4: Owner
    section Execute
      PilotFlow creates project brief: 5: PilotFlow
      PilotFlow writes task and risk state: 5: PilotFlow
      PilotFlow sends final summary back to group: 5: PilotFlow
    section Trace
      Team opens Doc, Base, Task, and Flight Recorder: 4: Team
```

## 🔁 Product Loop

```mermaid
flowchart LR
    A["Feishu group chat<br/>text or voice intent"] --> B["Agent Planner<br/>project flight plan"]
    B --> C["Confirmation Gate<br/>human approval"]
    C --> D["Feishu Tool Router"]
    D --> E["Doc<br/>project brief"]
    D --> F["Base / Task<br/>state and actions"]
    D --> G["IM / Card<br/>updates and decisions"]
    D --> H["Pinned Entry / Group Announcement<br/>project entry"]
    E --> I["Delivery Summary"]
    F --> I
    G --> I
    H --> I
    I --> J["Flight Recorder<br/>trace and replay"]
```

## 🧠 Architecture

```mermaid
flowchart TB
    subgraph "Feishu Native Surfaces"
        IM["IM / Group Chat"]
        Card["Message Cards"]
        Doc["Docs"]
        Base["Base"]
        Task["Tasks"]
        Ann["Pinned Entry / Announcement"]
    end

    subgraph "PilotFlow Core"
        Trigger["Trigger"]
        Planner["Agent Planner"]
        Confirm["Confirmation Gate"]
        Orchestrator["Run Orchestrator"]
        Router["Feishu Tool Router"]
        Recorder["Flight Recorder"]
    end

    IM --> Trigger
    Trigger --> Planner
    Planner --> Confirm
    Confirm --> Orchestrator
    Orchestrator --> Router
    Orchestrator --> Recorder
    Router --> Doc
    Router --> Base
    Router --> Task
    Router --> Card
    Router --> Ann
    Router --> IM
```

Detailed architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🧩 Feishu-Native Surfaces

| Surface | Product role | MVP status |
| --- | --- | --- |
| IM | Main collaboration entry and summary channel | ✅ validated |
| Cards | Flight plan, confirmation, risk decision | ✅ live send fixed, flight plan + risk decision prototypes, callback action protocol, bounded listener bridge |
| Docs | Project brief and delivery documents | ✅ creation validated |
| Base | Tasks, detected risks, artifacts, confirmations | ✅ live rich Project State table validated |
| Task | Concrete owner/deadline action items | ✅ creation validated, optional open_id/contact assignee mapping |
| Pinned Entry / Announcement | Stable project entrance | ✅ live pinned entry; announcement attempted and falls back on docx announcement API block |
| Event subscription | Card callback listener first, `@PilotFlow` automatic trigger later | 🟡 listener bridge ready; platform card callback EventKey/config still needs validation |
| Chat Tab / H5 | Lightweight cockpit and flight recorder | ✅ static recorder prototype |
| Whiteboard / Calendar / Slides | Demo enhancement surfaces | ⏳ later |

## 🧪 MVP Progress

PilotFlow is currently in **MVP prototype** stage. The first deliverable is a reliable Feishu-native project launch loop, not a separate project-management SaaS.

| Capability | Status |
| --- | --- |
| Activity tenant authorization | ✅ validated |
| Test group creation | ✅ validated |
| Group IM send | ✅ validated |
| Static interactive card send | ✅ validated |
| Feishu Doc creation | ✅ validated |
| Plan schema validation fallback | ✅ prototype |
| Base state write | ✅ validated |
| Base owner/deadline fallback fields | ✅ live validated |
| Task creation | ✅ validated |
| Task assignee open_id mapping | ✅ dry-run prototype |
| Contact lookup for Task owner | ✅ read-path validated, optional prototype |
| Local Flight Recorder | ✅ prototype |
| Real one-command Feishu run | ✅ validated |
| Project flight plan card | ✅ live send validated |
| Card button action protocol | ✅ local handler prototype |
| Project entry message fallback | ✅ prototype |
| Pinned project entry message | ✅ live validated |
| Artifact-aware final summary | ✅ prototype |
| Duplicate live-run guard | ✅ prototype |
| Flight Recorder static view | ✅ prototype |
| Risk detection | ✅ prototype |
| Risk decision card | ✅ live send validated |
| Card callback listener bridge | ✅ local tests passed |
| Live card callback confirmation | 🟡 listener connected, no real callback event received yet |
| Group announcement project entry | ✅ attempted; current group returns docx announcement API block and falls back to pinned entry |

## 🗺️ Roadmap Snapshot

```mermaid
gantt
    title PilotFlow MVP Roadmap
    dateFormat  YYYY-MM-DD
    section Foundation
    CLI update and API validation        :done,    a1, 2026-04-28, 1d
    Runnable prototype skeleton          :done,    a2, 2026-04-28, 1d
    section Real Loop
    Live Feishu tool mode                :done,    b1, 2026-04-28, 1d
    Confirmation fallback                :done,    b2, 2026-04-28, 1d
    Base and Task project state          :done,    b3, 2026-04-28, 1d
    Contact owner lookup                 :done,    b4, 2026-04-28, 1d
    Artifact-aware summary               :done,    b5, 2026-04-28, 1d
    section Demo
    Risk detection and decision card     :done,    c1, 2026-04-28, 1d
    Card callback action protocol        :done,    c2, 2026-04-28, 1d
    Flight Recorder cockpit              :         c3, 2026-05-03, 3d
    Demo hardening and recording         :         c4, 2026-05-06, 2d
```

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

## 📚 Documentation

| Document | Purpose |
| --- | --- |
| [Docs Index](docs/README.md) | Complete documentation map |
| [Project Brief](docs/PROJECT_BRIEF.md) | Product and competition brief |
| [Product Spec](docs/PRODUCT_SPEC.md) | User promise, feature tiers, non-goals |
| [Architecture](docs/ARCHITECTURE.md) | Components, state model, tool routing |
| [Development Guide](docs/DEVELOPMENT.md) | Local setup, validation, profiles, GitHub sync |
| [Visual Design](docs/VISUAL_DESIGN.md) | Feishu-native cards, cockpit, UX rules |
| [Roadmap](docs/ROADMAP.md) | Long-term plan and immediate next actions |
| [Documentation Plan](docs/DOCUMENTATION_PLAN.md) | Documentation governance |

## ⚡ Prototype Demo

For local development and reviewer reproduction:

```bash
npm run check
npm run demo:manual
npm run demo:manual -- --send-plan-card --no-auto-confirm
npm run demo:manual -- --send-entry-message
npm run demo:manual -- --pin-entry-message
npm run demo:manual -- --send-risk-card
npm run demo:manual -- --owner-open-id-map-json '{"Product Owner":"ou_xxx"}'
npm run demo:manual -- --auto-lookup-owner-contact
npm run flight:recorder -- --input tmp/runs/latest-manual-run.jsonl
npm run test:artifacts
npm run test:plan
npm run test:callback
npm run test:listener
npm run test:trigger
npm run listen:cards -- --dry-run --max-events 1 --timeout 30s
npm run test:card
npm run test:guard
npm run test:entry
npm run test:flight
npm run test:risk
npm run test:state
npm run test:summary
npm run test:contact
npm run test:assignee
npm run test:orchestrator
npm run test:config
```

The current local demo reads a project-init fixture, writes a traceable run log, and returns planned artifacts. Live Feishu execution is available behind an explicit confirmation gate; detailed setup lives in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## 🔐 Safety Principles

- Human confirmation is required before publishing project artifacts.
- Tool failures must be recorded and surfaced.
- The Agent must not pretend a failed Feishu write succeeded.
- Every write path should be designed for idempotency or duplicate detection.
- Live project-init runs are guarded against accidental duplicate Feishu writes unless explicitly bypassed.
- Secrets never belong in the repository, public docs, screenshots, or chat logs.
- Official Feishu reference caches stay outside this repo.

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=DeliciousBuding/pilot-flow&type=Date)](https://star-history.com/#DeliciousBuding/pilot-flow&Date)

## 🤝 Contributing

PilotFlow is moving quickly toward a competition MVP. Changes should keep the main loop stable:

```text
Group chat -> Flight plan -> Confirmation -> Feishu tools -> State -> Risk decision -> Delivery summary
```

Before opening a change:

1. Run the relevant validation.
2. Update the affected docs.
3. Keep official reference caches and local secrets out of the repo.

## 🙏 Acknowledgments

- Feishu / Lark Open Platform and `lark-cli`.
- Feishu AI Campus Challenge materials and challenge brief.
- Agent engineering tools that influenced the worker-artifact roadmap.
