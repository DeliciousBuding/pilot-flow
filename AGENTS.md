# AGENTS.md — PilotFlow

## Project

PilotFlow is a Hermes Agent plugin for Feishu group chat project management. Users @PilotFlow in a group chat, describe a project, and it creates real Feishu artifacts (docs, bitable, tasks, messages).

## Structure

```
PilotFlow/
├── plugins/pilotflow/       # Core plugin (tools.py + __init__.py + plugin.yaml)
│   ├── tools.py             # All 6 tool handlers + Feishu API wrappers
│   ├── __init__.py          # Plugin registration with Hermes tool registry
│   └── plugin.yaml          # Plugin metadata
├── skills/pilotflow/        # Hermes skill definitions
│   ├── SKILL.md             # Full skill with YAML frontmatter (LLM workflow guide)
│   └── DESCRIPTION.md       # Short discovery hint
├── docs/                    # Product spec, architecture, innovation docs
├── README.md / README_EN.md # Project documentation
├── INSTALL.md               # Installation guide
├── PERSONAL_PROGRESS.md     # Development progress
└── .env.example             # Environment template
```

## Key Technical Decisions

- **Messaging**: via `registry.dispatch("send_message")` (reuses Hermes channels)
- **Doc/Task/Bitable**: via lark_oapi SDK (Hermes doesn't have native Feishu doc tools)
- **Permissions**: auto-open link access + add group members as editors after creation
- **@mention**: resolve group member names to open_id via `im.chat.members.get`
- **Confirmation gate**: per-chat_id with TTL, prevents execution without user confirmation

## Conventions

- All user-facing text in Chinese
- Tool names are English (`pilotflow_*`) — required by OpenAI API schema validation
- No English or tool names shown to users
- Plugin is "即插即用" — `cp -r` to install into Hermes

## Testing

- Gateway test: `uv run hermes gateway` in hermes-agent directory
- Direct tool test: set `PILOTFLOW_TEST_CHAT_ID` env var
- End-to-end: @PilotFlow in Feishu group chat

## Dependencies

- hermes-agent (runtime)
- lark-oapi (Feishu SDK)
- gpt-5.5 via vectorcontrol API
