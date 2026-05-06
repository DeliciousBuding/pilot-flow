# ✈️ PilotFlow

**AI project operator for Feishu group chats.** Mention a need, get a confirmable plan, and PilotFlow orchestrates Feishu docs, bitable, tasks, calendar, cards, and permissions — all through a Hermes Agent plugin that never touches Hermes core.

[中文版](README.md)
[![Hermes](https://img.shields.io/badge/Hermes-plugin-6f42c1)](https://github.com/NousResearch/hermes-agent)

## Problem

Project discussions in Feishu group chats scatter goals, members, deliverables, deadlines, and risks across messages. These don't automatically become collaborative artifacts. **PilotFlow identifies these signals in chat, sends a confirmation card, and upon confirmation creates real Feishu resources — then keeps tracking state.**

## Differentiation

| Feishu Project (飞书项目) | PilotFlow |
| --- | --- |
| Post-creation management & execution | Pre-creation: intent recognition, proactive suggestion, confirmed writing |
| Workbench / project space entry | Group chat entry, natural language driven |
| Manual project creation | Agent discovers from context; Hermes understands, PilotFlow executes |

Complementary relationship. PilotFlow will target Feishu Project OpenAPI as its authoritative backend when available.

## Verified Capabilities

| Capability | Evidence |
| --- | --- |
| One-sentence project creation | @bot → Agent reasoning → plan card → confirm → doc/Base/task/calendar/entry card |
| Confirmation gate + cancel | chat_id-scoped TTL (10min), text/card/cancel all verified |
| Destructive action gate | remove_member / archive require explicit confirmation text |
| Agent-driven (tool doesn't guess) | view_mode / template / risk_level / page / filters: 5 params must be Agent-passed; `allow_inferred_*=true` is legacy-only |
| Interactive cards + button callback | `/card` bridge, confirm/cancel/mark-done/reopen/resolve-risk/remind/todo/paginate |
| Dashboard + overdue boards | Progress/overdue/due-soon/risk filters with countdown color coding |
| Standup briefing | Risk-prioritized summary with batch-remind / batch-todo buttons |
| Doc audit trail | Status changes / reminders / new deliverables written back to Feishu docs |
| Bitable change log | Every update appends a history record |
| Card retry on failure | Failed button ops retain action ref for retry |
| Restart recovery | Sanitized state file (public) + private resource refs, with file locks (msvcrt/fcntl) |
| Privacy sanitization | Public state excludes URL/token/open_id/chat_id/message_id; resource links in private refs |
| Non-@ subscription | `pilotflow_subscribe_chat` generates per-group `require_mention: false` config snippet |
| Hermes deep integration | memory write, cron reminders, `/card` bridge, `registry.dispatch` messaging — zero Hermes source changes |
| Automated tests | 328 unit/integration/config/multiprocess tests |
| Reproducible WSL install | `python setup.py --hermes-dir <path> --hermes-home ~/.hermes` with config validation |

Full evidence in [LIVE_TEST_EVIDENCE.md](docs/LIVE_TEST_EVIDENCE.md).

## Architecture

```
Hermes Agent runtime (LLM + Feishu WebSocket gateway + tool registry + memory + cron)
  └── PilotFlow plugin (9 tools, lark_oapi SDK, /card command bridge)
```

- **Zero Hermes core changes**: pure plugin via `ctx.register_tool()` and `/card` bridge
- **Agent is the pilot**: 5 semantic params must be Agent-passed; tools default to refusing inference
- **Direct Feishu**: doc/Base/task/calendar via lark_oapi SDK; cards via Feishu IM API; text via `registry.dispatch`
- **LLM swappable**: OpenAI-compatible API per Hermes config; verified with `Doubao`
- **Known tech debt**: `tools.py` >5000 lines; post-contest refactor to `actions.py` / `state.py` / `feishu_client.py`

## Quick Start

```bash
git clone https://github.com/NousResearch/hermes-agent.git && cd hermes-agent && uv sync --extra feishu
git clone https://github.com/DeliciousBuding/PilotFlow.git && cd PilotFlow
python setup.py --hermes-dir <hermes-agent-path>
# Edit ~/.hermes/.env with FEISHU_APP_ID / FEISHU_APP_SECRET and LLM API key
uv run hermes gateway
```

See [INSTALL.md](INSTALL.md) for group subscription setup, [USER_GUIDE.md](docs/USER_GUIDE.md) for usage.

## Docs

| For Judges | For Users |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | [User Guide](docs/USER_GUIDE.md) |
| [Product Spec](docs/PRODUCT_SPEC.md) | [Install Guide](INSTALL.md) |
| [Live Test Evidence](docs/LIVE_TEST_EVIDENCE.md) | |
| [Live Test Evidence](docs/LIVE_TEST_EVIDENCE.md) | |

## Credits

[Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent runtime · Feishu Open Platform · Feishu AI Campus Challenge
