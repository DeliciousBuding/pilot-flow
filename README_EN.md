<div align="center">

# ✈️ PilotFlow

**An AI operating layer for Feishu project work**

Start from group-chat discussion and turn intent into confirmed plans, executable tasks, traceable state, and delivery summaries.

[中文版](README.md)

[![Feishu](https://img.shields.io/badge/Feishu-native-00A4FF)](#-feishu-native-capabilities)
[![Agent](https://img.shields.io/badge/Agent-as%20Pilot-6f42c1)](#-product-experience)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](docs/OPERATOR_RUNBOOK.md)
[![GitHub stars](https://img.shields.io/github/stars/DeliciousBuding/pilot-flow?style=social)](https://github.com/DeliciousBuding/pilot-flow/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/DeliciousBuding/pilot-flow)](https://github.com/DeliciousBuding/pilot-flow/commits/main)

[Product Spec](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Operator Runbook](docs/OPERATOR_RUNBOOK.md) · [Docs](docs/README.md)

</div>

---

## One-liner

**PilotFlow is an AI project operations officer that lives in your Feishu group chat — like a project manager that pushes teams from discussion to delivery.**

In real collaboration, key project signals are scattered across group messages: goals, owners, deadlines, risks, materials, confirmations, and ad-hoc commitments. PilotFlow lets an AI Agent act as the primary driver — understanding discussion, generating execution plans, requesting human confirmation, invoking Feishu-native tools, and writing results into Docs, Base, Tasks, pinned entries, and summary messages.

## Why PilotFlow

| Team pain | PilotFlow response | Feishu-native output |
| --- | --- | --- |
| Discussion is scattered across group messages | Extract goals, members, deadlines, deliverables, and risks | Project execution plan |
| Verbal agreement is hard to track | Ask for explicit confirmation before side effects | Card or text confirmation |
| Tasks and risks disappear in chat history | Write structured project state | Base records and Tasks |
| Project entry points are hard to find | Publish a stable project entry | Pinned entry message |
| AI actions are hard to trust | Record plans, tool calls, artifacts, fallbacks, and errors | Run trace |

## Who It Is For

| Team type | Typical job | Why PilotFlow fits |
| --- | --- | --- |
| Student teams | Turn brainstorming into a deliverable plan | Lightweight, traceable, fits fast project cycles |
| Product and operations groups | Convert group decisions into documents, tasks, and status | Works inside Feishu where decisions already happen |
| Hackathon or prototype teams | Keep scope, owners, risks, and demo assets aligned | One visible project spine without a heavy PM tool |
| AI-native teams | Let agents perform real collaboration work with guardrails | Confirmation and run traces keep automation explainable |

## Product Experience

```mermaid
journey
    title PilotFlow project launch journey
    section Discuss
      Team discusses a new project in Feishu group: 3: Team
      PilotFlow extracts goal, owners, deliverables, deadline, risks: 5: PilotFlow
    section Confirm
      PilotFlow posts a project execution plan: 5: PilotFlow
      Human owner confirms or edits the plan: 4: Owner
    section Execute
      PilotFlow creates project brief: 5: PilotFlow
      PilotFlow writes task and risk state: 5: PilotFlow
      PilotFlow sends final summary back to group: 5: PilotFlow
    section Trace
      Team opens Doc, Base, Task, and run trace: 4: Team
```

## Operating Model

| Step | Product behavior | Control point |
| --- | --- | --- |
| Observe | Read incoming project intent and extract goal, members, deliverables, deadline, and risks | No write side effects |
| Plan | Generate a structured project execution plan | Schema validation before execution |
| Confirm | Ask a human to approve, edit, restrict to doc-only, or cancel | Human confirmation gate |
| Execute | Create Feishu-native artifacts through a tool router | Preflight checks and duplicate-run guard |
| Record | Capture every step, tool call, artifact, fallback, and error | JSONL run log and run trace |
| Report | Send the final summary back to the group | Artifact-aware summary |

## Product Loop

```mermaid
flowchart LR
    A["Feishu group chat<br/>text or voice intent"] --> B["Agent Planner<br/>project execution plan"]
    B --> C["Confirmation Gate<br/>human approval"]
    C --> D["Feishu Tool Router"]
    D --> E["Doc<br/>project brief"]
    D --> F["Base / Task<br/>state and actions"]
    D --> G["IM / Card<br/>updates and decisions"]
    D --> H["Pinned Entry<br/>project entry"]
    E --> I["Delivery Summary"]
    F --> I
    G --> I
    H --> I
    I --> J["Run Trace<br/>trace and replay"]
```

## Architecture

```mermaid
flowchart TB
    subgraph "Feishu Native Surfaces"
        IM["IM / Group Chat"]
        Card["Message Cards"]
        Doc["Docs"]
        Base["Base"]
        Task["Tasks"]
        Ann["Pinned Entry"]
    end

    subgraph "PilotFlow Core"
        Trigger["Trigger"]
        Planner["Agent Planner"]
        Confirm["Confirmation Gate"]
        Orchestrator["Run Orchestrator"]
        Router["Feishu Tool Router"]
        Recorder["Run Trace"]
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

## Feishu-Native Capabilities

PilotFlow uses real Feishu capabilities, not mock data:

| Surface | Product role |
| --- | --- |
| IM | Project initiation and delivery-summary channel |
| Cards | Execution-plan display, confirmation, and risk-decision interaction |
| Docs | Auto-generated project brief and delivery documents |
| Base | Structured project state: owner, deadline, risk level, status, links |
| Task | Action items with optional assignee mapping |
| Pinned Entry | Stable project entrance in the group chat |

## Roadmap

| Phase | Goal | Status |
| --- | --- | --- |
| Phase 0 | CLI, Feishu API validation, local skeleton | Done |
| Phase 1 | Real Feishu loop: Doc, Base, Task, IM, run log | Done |
| Phase 2 | Plan cards, risk cards, pinned entry, owner mapping, duplicate-run guard | Done |
| Phase 3 | Demo hardening, recording, submission materials | In progress |
| Phase 4 | Mobile confirmation, project memory, worker preview | Planned |
| Phase 5 | Event subscription, multi-project spaces, self-evolution | Planned |

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

## Documentation

| Document | Purpose |
| --- | --- |
| [Docs Index](docs/README.md) | Complete documentation map |
| [Project Brief](docs/PROJECT_BRIEF.md) | Product and competition brief |
| [Product Spec](docs/PRODUCT_SPEC.md) | User promise, feature tiers, non-goals |
| [Architecture](docs/ARCHITECTURE.md) | Components, state model, tool routing |
| [Agent Evolution](docs/AGENT_EVOLUTION.md) | Self-evolution, memory, evaluation, and worker orchestration |
| [Project Structure](docs/PROJECT_STRUCTURE.md) | Runtime layers, command surface, and placement rules |
| [Operator Runbook](docs/OPERATOR_RUNBOOK.md) | Local operation, live run, evidence regeneration |
| [Development Guide](docs/DEVELOPMENT.md) | Contributor workflow, module boundaries |
| [Visual Design](docs/VISUAL_DESIGN.md) | Feishu-native cards, cockpit, UX rules |
| [Roadmap](docs/ROADMAP.md) | Long-term plan and next actions |
| [Demo Kit](docs/demo/README.md) | Demo playbook, capture guide, failure paths |
| [Reality Check](docs/PRODUCT_REALITY_CHECK.md) | Honest capability assessment and claim boundaries |

## Quick Start

```bash
# Install and validate
npm install
npm run pilot:check

# Run the product loop (dry-run)
npm run pilot:run -- --dry-run

# Run with custom input
npm run pilot:run -- --dry-run --input "目标: 建立答辩项目空间 成员: 产品, 技术 交付物: Brief, Task 截止时间: 2026-05-03"
```

<details>
<summary>Full command reference</summary>

```bash
# Validation and health
npm run pilot:check
npm run pilot:doctor
npm test

# Product loop
npm run pilot:run -- --dry-run
npm run pilot:gateway -- --dry-run --max-events 1
npm run pilot:agent-smoke

# Demo and evidence
npm run pilot:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html
npm run pilot:package
npm run pilot:status
npm run pilot:audit
```

Operational setup: [docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md). Contributor workflow: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

</details>

## Safety Principles

- Human confirmation is required before publishing project artifacts.
- Tool failures are recorded and surfaced; the Agent never pretends a failed write succeeded.
- Every write path is designed for idempotency or duplicate detection.
- Secrets never belong in the repository, public docs, screenshots, or chat logs.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=DeliciousBuding/pilot-flow&type=Date)](https://star-history.com/#DeliciousBuding/pilot-flow&Date)

## Contributing

Changes should keep the main loop stable:

```text
Group chat -> Execution plan -> Confirmation -> Feishu tools -> State -> Risk decision -> Delivery summary
```

1. Run the relevant validation.
2. Update the affected docs.
3. Keep local secrets out of the repo.

## Acknowledgments

- Feishu / Lark Open Platform and `lark-cli`.
- Feishu AI Campus Challenge materials and challenge brief.
- Agent engineering tools that influenced the worker-artifact roadmap.
