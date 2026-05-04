# AGENTS.md — PilotFlow

## Project

PilotFlow is a Hermes Agent plugin for Feishu group chat project supervision. Users @PilotFlow in a group chat, describe or discuss work, and Hermes decides whether to plan, ask follow-up questions, suggest projectization, or execute real Feishu artifacts (docs, bitable, tasks, messages).

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

- **Messaging**: text via `registry.dispatch("send_message")`; Feishu interactive cards via `lark_oapi` IM API (`msg_type=interactive`)
- **Memory**: project creation writes patterns via `registry.dispatch("memory")`; reading/scanning history is next work
- **Cron**: deadline reminders are scheduled via `registry.dispatch("cronjob")`
- **Doc/Task/Bitable/Calendar**: via lark_oapi SDK (Hermes doesn't have native write tools for these surfaces)
- **Permissions**: auto-open link access + add group members as editors after creation
- **@mention**: resolve group member names to open_id via `im.chat.members.get`
- **Confirmation gate**: per-chat_id with TTL, prevents execution without user confirmation
- **Card actions**: PilotFlow registers a plugin `/card` bridge for Hermes-routed Feishu button clicks; `pilotflow_handle_card_action` confirms/cancels using pending plan state

## Intelligence Boundary

- Hermes Agent owns semantic understanding: intent recognition, context summarization, missing-info judgment, projectization suggestions, and extraction of goals/commitments/risks/action items.
- PilotFlow tools own execution: validation, confirmation gates, Feishu API writes, card rendering, state persistence, reminders, and safe follow-up actions.
- Do not implement Agent behavior with keyword lists, regex intent classifiers, or hardcoded Chinese phrase matching in `plugins/pilotflow/tools.py`.
- Keyword or regex logic is allowed only for execution-layer parsing with narrow deterministic semantics, such as ISO/Chinese date normalization, explicit project-name fuzzy lookup, Feishu mention cleanup, URL/resource extraction, and safety gates.
- If a feature needs "understanding", expose structured schema fields and update `skills/pilotflow/SKILL.md` so Hermes supplies the semantic result. The tool should not infer meaning from raw chat text.
- Tests for Agent-facing tools should assert structured input/output and safety behavior, not that a keyword phrase is classified as a specific intent.

## Conventions

- All user-facing text in Chinese
- Tool names are English (`pilotflow_*`) — required by OpenAI API schema validation
- No English or tool names shown to users
- Plugin is installed with `python setup.py --hermes-dir <hermes-agent-path>`; manual copy is fallback only

## Testing

- Local tests: `C:\Users\Ding\miniforge3\python.exe -m pytest tests\test_tools.py tests\test_setup.py tests\test_plugin_registration.py -q`
- Gateway test: `uv run hermes gateway` in hermes-agent directory
- Direct tool test: set `PILOTFLOW_TEST_CHAT_ID` env var
- End-to-end: @PilotFlow in Feishu group chat

## Dependencies

- hermes-agent (runtime)
- lark-oapi (Feishu SDK)
- OpenAI-compatible chat completion provider configured through Hermes

## Verification Checklist

- Run `pytest -q` before committing.
- Run `python setup.py --hermes-dir <hermes-agent-path>` after plugin changes.
- In the Hermes runtime, import `plugins.pilotflow` and verify registered tools.
- For release claims, separate local test evidence from real Feishu live evidence.
