<div align="center">

# ✈️ PilotFlow

**AI project operator for Feishu group chats, built on the Hermes runtime**

Mention @PilotFlow in a Feishu group chat, get a confirmable project plan, and let it orchestrate Feishu docs, bitable, tasks, calendar, cards, permissions, mentions, and reminders.

[中文版](README.md)

[![Feishu](https://img.shields.io/badge/Feishu-Native-00A4FF)](https://open.feishu.cn/)
[![Hermes](https://img.shields.io/badge/Hermes-Plugin-6f42c1)](https://github.com/NousResearch/hermes-agent)

</div>

---

## Demo And Evidence

| Asset | Status | Link |
| --- | --- | --- |
| Demo script | Prepared | [docs/demo/README.md](docs/demo/README.md) |
| Contest submission pack | Prepared | [docs/CONTEST_SUBMISSION.md](docs/CONTEST_SUBMISSION.md) |
| Local tests | 47 tests passing | `uv run pytest -o addopts='' -q` |
| Live Feishu card | Verified: interactive send, button confirmation, source-card status update | WSL Hermes + Feishu test chat |
| Live status dashboard | Verified Chinese text feedback + interactive dashboard card | [docs/LIVE_TEST_EVIDENCE.md](docs/LIVE_TEST_EVIDENCE.md) |
| Live text-confirm creation | Verified plan card -> text confirmation -> project entry card | [docs/LIVE_TEST_EVIDENCE.md](docs/LIVE_TEST_EVIDENCE.md) |
| Live text-cancel | Verified plan card -> cancel execution -> no project creation | [docs/LIVE_TEST_EVIDENCE.md](docs/LIVE_TEST_EVIDENCE.md) |
| Live recording/artifacts | To be completed before submission | Success/cancel path recordings and live link samples |

---

## One-liner

**PilotFlow is an AI project operator living in your Feishu group chat.**

Mention @PilotFlow with a requirement in plain language. It extracts goals, members, deliverables, and deadlines, sends a confirmation card, and creates real Feishu artifacts only after confirmation. It is not a raw Feishu API wrapper; it packages project kickoff, confirmation, execution, tracking, reminders, and review into an auditable workflow.

## Why PilotFlow

| Pain Point | How PilotFlow Solves It |
| --- | --- |
| Key decisions lost in chat threads | AI extracts goals, members, deliverables, deadlines |
| Setting up a project space takes 30 min | One sentence triggers the full Feishu artifact suite |
| AI output requires copy-paste | Calls Feishu API directly to create real docs, tasks |
| No traceability when things go wrong | Full logging for every step |

## Core Strengths

| Strength | Description |
| --- | --- |
| **Most Natural Entry Point** | @mention the bot in Feishu — no extra tools needed |
| **AI Does Real Work** | lark_oapi SDK connects directly to Feishu API |
| **@mention Support** | Auto-resolves group member names to @mentions in docs and messages |
| **Auto Permissions** | Created docs automatically open link access |
| **Plug and Play** | Built on Hermes runtime — one-command install via `python setup.py --hermes-dir ...` |
| **Project Pattern Memory** | Writes created project patterns to Hermes memory, preparing for history-based suggestions |

## More Than A Feishu Tool Wrapper

| Layer | Hermes Provides | PilotFlow Adds |
| --- | --- | --- |
| Runtime | LLM orchestration, tool registry, Feishu gateway, messaging, memory, cron | Project semantics, templates, confirmation gate, pending plans, risk checks, multi-turn status management |
| Feishu surfaces | Message channel and card action routing | Docs, bitable, tasks, calendar, permissions, group-member resolution, @mentions, entry cards |
| Workflow | Tool execution environment | Group request -> plan card -> human confirmation -> artifact orchestration -> dashboard -> deadline reminder |
| Trust controls | Tool infrastructure | Per-chat confirmation gate, 10-minute TTL, cancel action, display summaries, graceful fallback |

## Architecture

```
Hermes Agent Runtime (LLM + Feishu Gateway + Tool Registry)
  └── PilotFlow Plugin (Project Management Workflow + lark_oapi Feishu Tools)
```

- **Base**: Hermes provides Agent runtime, Feishu WebSocket gateway, LLM orchestration
- **Plugin**: PilotFlow provides project management workflow and Feishu API tools (lark_oapi SDK). Interactive cards are sent directly through Feishu IM as `msg_type=interactive`.
- **Boundary**: PilotFlow is a Hermes plugin, not a Hermes fork. Card actions are handled by a plugin-level `/card` bridge.
- **LLM**: OpenAI-compatible API. The default example uses `gpt-4.1`, and can be replaced through Hermes config.

## Quick Start

See [INSTALL.md](INSTALL.md) for detailed steps.

```bash
# 1. Install Hermes
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent && uv sync --extra feishu

# 2. Install PilotFlow plugin
git clone https://github.com/DeliciousBuding/PilotFlow.git
cd PilotFlow
python setup.py --hermes-dir <hermes-agent-path>

# 3. Configure
cp .env.example ~/.hermes/.env
# Edit ~/.hermes/.env with Feishu credentials and LLM API key

# 4. Start
uv run hermes gateway
```

## Deep Feishu Integration

| Feishu Capability | Integration |
| --- | --- |
| **Feishu Docs** | Auto-create project brief, formatted markdown, @mention members |
| **Bitable** | Auto-create project status ledger, write records, real-time tracking |
| **Feishu Tasks** | Auto-create tasks, link to project, assign owners |
| **Group Messages** | Project entry message (@members + doc/table/deadline links) |
| **Interactive Cards** | Plan confirmation, status dashboard, button continuation, source-card status feedback via direct Feishu send |
| **@mention** | Resolve group member list, mention_user in docs, `<at>` tags in messages |
| **Permission Management** | Auto-open link access + add group members as editors |

## Capability Evidence

| Capability | Current Evidence | Notes |
| --- | --- | --- |
| Feishu docs/bitable/tasks/entry message | Validated in a real Feishu group on 2026-05-03 after card confirmation | Sends a project entry interactive card after creation |
| Confirmation gate | Local integration tests + per-chat TTL | Project creation is blocked before confirmation |
| Card confirm/cancel | Local integration tests + plugin `/card` bridge + real button confirmation | The source card updates to processing/done/cancelled |
| Hermes memory write | Local tests cover success/failure dispatch | Best-effort write; member names are not persisted by default |
| Hermes cron reminder | Local tests cover success/failure dispatch | Attempts pre-deadline scheduling; failures do not block project creation |
| Templates/risks/dashboard/updates | Unit + integration tests | Covers defense, sprint, event, and launch templates |
| LLM-driven tool choice | Hermes tool descriptions + skill instructions + live @bot checks | Quiet Feishu output is configured; delivery materials are being finalized |

## Competitive Positioning

| Dimension | Feishu Miaoji/Projects | PilotFlow |
| --- | --- | --- |
| Positioning | Mature project/meeting/collaboration workspace | Project supervisor Agent in group chat, not a Feishu Projects replacement |
| Entry Point | Workspace, project space, meeting scenarios | Natural Feishu group/private chat and @mentions |
| Core Advantage | Complete structured project-management surface | Reads scattered chat goals, commitments, risks, and action items, then pushes them into docs, tasks, reminders, or projectization suggestions |
| AI Workflow | Product-surface scenario enhancement | Hermes understands context and chooses the next step; PilotFlow handles confirmation gates and Feishu execution |
| Relationship to Feishu Projects | Project system of record | Upstream intent and orchestration layer; future Feishu Projects API should become the authoritative backend |
| Extensibility | Mostly within Feishu product surfaces | Hermes plugins/skills/cron/memory plus Feishu OpenAPI orchestration |

PilotFlow should not compete by rebuilding Feishu Projects. Its advantage is the pre-project layer: before work is formalized, the Agent can read chat context, ask missing questions, suggest projectization, and write confirmed outcomes into Feishu docs, tasks, Base, calendar reminders, or eventually Feishu Projects as the system of record.

## Documentation

| Document | Description |
| --- | --- |
| [Installation Guide](INSTALL.md) | Setup steps |
| [Product Spec](docs/PRODUCT_SPEC.md) | User commitments, feature tiers |
| [Architecture Design](docs/ARCHITECTURE.md) | Components, state model, tool routing |
| [Contest Submission Pack](docs/CONTEST_SUBMISSION.md) | Positioning, demo path, evidence matrix |
| [Live Test Evidence](docs/LIVE_TEST_EVIDENCE.md) | Sanitized real Feishu test evidence |
| [Delivery Audit](docs/DELIVERY_AUDIT.md) | Requirement-to-evidence checklist and remaining gaps |
| [Personal Progress](PERSONAL_PROGRESS.md) | Development progress and verification results |
| [Contributing](CONTRIBUTING.md) | Dev setup, coding conventions, submitting PRs |

## Roadmap

| Phase | Goal | Status |
| --- | --- | --- |
| Phase 1 | Plugin foundation: Feishu tools + project workflow | ✅ Done |
| Phase 2 | LLM-driven intent understanding and plan generation | ✅ Done |
| Phase 3 | lark_oapi SDK + @mention + formatted docs + auto permissions | ✅ Done |
| Phase 4 | Confirmation gate + risk detection + multi-turn management + project dashboard | ✅ Done |
| Phase 5 | Hermes memory write + smart templates + calendar integration | ✅ Done |
| Phase 6 | Hermes memory read + live card-button recording + quiet Feishu output | In progress |

## Acknowledgments

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent runtime base
- Feishu / Lark Open Platform
- Feishu AI Campus Challenge
