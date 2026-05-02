<div align="center">

# ✈️ PilotFlow

**Hermes Project Management Plugin for Feishu**

Mention @PilotFlow in a Feishu group chat with a requirement, and it automatically creates Feishu docs, tasks, and project entry messages.

[中文版](README.md)

[![Feishu](https://img.shields.io/badge/Feishu-Native-00A4FF)](https://open.feishu.cn/)
[![Hermes](https://img.shields.io/badge/Hermes-Plugin-6f42c1)](https://github.com/NousResearch/hermes-agent)
[![GitHub stars](https://img.shields.io/github/stars/DeliciousBuding/PilotFlow?style=social)](https://github.com/DeliciousBuding/PilotFlow/stargazers)

</div>

---

## One-liner

**PilotFlow is an AI project operator living in your Feishu group chat.**

Mention @PilotFlow with a requirement in plain language. It extracts goals, members, deliverables, and deadlines, then calls Feishu APIs to create real documents, tasks, and project entry messages. Fully LLM-driven, plug and play.

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
| **Plug and Play** | Built on Hermes runtime — `cp -r` to install |

## Architecture

```
Hermes Agent Runtime (LLM + Feishu Gateway + Tool Registry)
  └── PilotFlow Plugin (Project Management Workflow + lark_oapi Feishu Tools)
```

- **Base**: Hermes provides Agent runtime, Feishu WebSocket gateway, LLM orchestration
- **Plugin**: PilotFlow provides project management workflow and Feishu API tools (lark_oapi SDK)
- **LLM**: gpt-5.5 via OpenAI-compatible API

## Quick Start

See [INSTALL.md](INSTALL.md) for detailed steps.

```bash
# 1. Install Hermes
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent && uv sync --extra feishu

# 2. Install PilotFlow plugin
git clone https://github.com/DeliciousBuding/PilotFlow.git
cp -r PilotFlow/plugins/pilotflow hermes-agent/plugins/
cp -r PilotFlow/skills/pilotflow hermes-agent/skills/

# 3. Configure
cp PilotFlow/.env.example ~/.hermes/.env
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
| **@mention** | Resolve group member list, mention_user in docs, `<at>` tags in messages |
| **Permission Management** | Auto-open link access + add group members as editors |

## Verified Capabilities

| Capability | Description |
| --- | --- |
| Feishu Doc Creation | Formatted markdown, @mention, auto permissions + editor access for group members |
| Bitable | Auto-create project status ledger, write records, auto permissions + editor access |
| Feishu Task Creation | Auto-creates tasks linked to project |
| @mention | Resolves group members, mention_user in docs, `<at>` tags in messages |
| Permission Management | Auto: link viewable + group members as editors |
| Confirmation Gate | Shows plan card first, waits for user to confirm before executing |
| Project Templates | Auto-detects keywords (defense/sprint/event/launch), suggests deliverables and timeline |
| Multi-turn Management | Update deadline, add members, change status — syncs to bitable |
| Project Dashboard | Query project status, send card to group chat |
| Risk Detection | Auto-detect missing members, vague deadlines, unclear deliverables |
| Calendar Integration | Auto-create deadline calendar event (UTC+8) |
| LLM-Driven | gpt-5.5 understands Chinese intent, selects tools automatically |
| End-to-End Verified | Feishu group @PilotFlow → LLM → 5 Feishu artifacts, ~30 seconds |

## Competitive Positioning

| Dimension | Feishu Miaoji/Projects | PilotFlow |
| --- | --- | --- |
| Positioning | Meeting notes / project space | Group chat project operator |
| Entry Point | Meeting / workspace | Feishu group chat @mention |
| Workflow | Meeting → todo / project flow | One sentence → docs + tasks + messages |
| AI Capability | None | LLM understands intent, auto-executes |
| Extensibility | Fixed features | Hermes plugin ecosystem |

## Documentation

| Document | Description |
| --- | --- |
| [Installation Guide](INSTALL.md) | Setup steps |
| [Product Spec](docs/PRODUCT_SPEC.md) | User commitments, feature tiers |
| [Architecture Design](docs/ARCHITECTURE.md) | Components, state model, tool routing |
| [Personal Progress](PERSONAL_PROGRESS.md) | Development progress and verification results |

## Roadmap

| Phase | Goal | Status |
| --- | --- | --- |
| Phase 1 | Plugin foundation: Feishu tools + project workflow | ✅ Done |
| Phase 2 | LLM-driven intent understanding and plan generation | ✅ Done |
| Phase 3 | lark_oapi SDK + @mention + formatted docs + auto permissions | ✅ Done |
| Phase 4 | Confirmation gate + risk detection + interactive cards | In Progress |
| Phase 5 | Multi-turn project management, calendar integration, approval flows | Planned |

## Acknowledgments

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent runtime base
- Feishu / Lark Open Platform
- Feishu AI Campus Challenge
