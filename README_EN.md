<div align="center">

# ✈️ PilotFlow
## AI project kickoff officer for Feishu group chats

Turn the goals, commitments, and deadlines scattered across a chat into a confirmed Feishu project.

[中文版](README.md) &nbsp;·&nbsp; [Quick Start](#quick-start) &nbsp;·&nbsp; [User Guide](docs/USER_GUIDE.md)

<img src="https://img.shields.io/badge/version-1.12.0-blue?style=flat-square" alt="version">
<img src="https://img.shields.io/badge/python-3.12+-informational?style=flat-square&logo=python" alt="python">
<img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="license">

</div>


## The kickoff officer for group-chat projects

Project discussions in a Feishu group chat scatter goals, members, deliverables, deadlines, and risks across messages. PilotFlow picks up these signals, sends a confirmation card, and once the user confirms it creates the Feishu doc, Bitable record, task, calendar event, and project entry card.

**How it relates to Feishu Project (Meego)**: Feishu Project is for managing work items after a project has been formed. PilotFlow handles the step before that — turning a fuzzy chat discussion into a confirmed project. The natural sequence is PilotFlow → Feishu Project, not a replacement.

<br>

## How it works

```
You: @PilotFlow Help me kick off a product launch. Members: Alice and Bob.
     Deliverables: release notes, checklist. Deadline: May 7.

PilotFlow:
  1. Sends a plan card to the group with the extracted goal, members,
     deliverables, and deadline
  2. You click confirm (or reply "确认执行")
  3. PilotFlow creates, in one step:
     - Feishu Doc (formatted, members @-mentioned, link permission opened)
     - Bitable (project status registry with seed records)
     - Feishu Tasks (assigned to owners with deadlines)
     - Calendar event (deadline reminder)
     - Hermes cron (best-effort reminder before deadline)
     - Project entry card (one-click navigation in the group)

  Afterwards:
  4. "How is it going?" -> dashboard card with countdown coloring
  5. "Move the deadline to May 10." -> status table updated, group notified
  6. "We're blocked." -> risk recorded, audit trail written to the doc
  7. "Done." -> project marked complete and archived
```

<br>

## Where AI participates

| Surface | What AI does |
| :--- | :--- |
| Chat intent | Extracts title, members, deliverables, deadline, and risks from natural-language input |
| Missing-info judgment | Decides whether to ask the user back instead of guessing with keywords |
| Proactive scanning (opt-in) | When the subscription mode is enabled for a group, recognizes commitments and risks from ordinary discussion and offers to organize them into a project |
| Project content | Drafts the doc body and Bitable schema in the plan card before any write happens |

PilotFlow keeps the execution side deterministic: every Feishu write goes through a confirmation card; high-risk actions (member removal, archival) need explicit confirmation; public state files exclude chat IDs, member IDs, document URLs, and tokens.

<br>

## Architecture

```
 Hermes Agent runtime (LLM dispatch + Feishu gateway + tool registry + memory + cron)
                          |
                 Plugin Interface
                          |
  +-----------------------v-----------------------+
  |              PilotFlow Plugin                 |
  |   9 tools  ·  /card bridge  ·  lark_oapi SDK  |
  +-----------------------+-----------------------+
                          | lark_oapi SDK
                          v
  +-----------------------------------------------+
  |              Feishu Open API                  |
  |  Doc · Bitable · Tasks · Calendar · IM · Card |
  +-----------------------------------------------+
```

PilotFlow is a pure plugin: it does not modify any Hermes source. It registers tools through `ctx.register_tool()` and handles card buttons through a plugin-level `/card` command bridge. The LLM is configured through Hermes' OpenAI-compatible interface and is swappable.

<br>

## Quick Start

```bash
git clone https://github.com/NousResearch/hermes-agent.git && cd hermes-agent
uv sync --extra feishu

git clone https://github.com/DeliciousBuding/PilotFlow.git && cd PilotFlow
python setup.py --hermes-dir <hermes-agent-path>

# Edit ~/.hermes/.env -> FEISHU_APP_ID / FEISHU_APP_SECRET / LLM API key
uv run hermes gateway
```

See [INSTALL.md](INSTALL.md) for full installation, including the optional group subscription mode.

<br>

## Docs

| | |
| :--- | :--- |
| [User Guide](docs/USER_GUIDE.md) | What you can ask, with sample prompts and FAQ |
| [Install Guide](INSTALL.md) | Installation and group subscription configuration |
| [Architecture](docs/ARCHITECTURE.md) | Components, state model, tool routing |
| [Product Spec](docs/PRODUCT_SPEC.md) | Feature tiers and technical constraints |
| [Innovation Notes](docs/INNOVATION.md) | Product and engineering differentiators |

<br>

## Credits

[Hermes Agent](https://github.com/NousResearch/hermes-agent) — Agent runtime · Feishu Open Platform

<br>

<div align="center">

### ✈️ Bring the project parts of group chat into Feishu.

</div>
