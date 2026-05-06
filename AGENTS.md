# AGENTS.md — PilotFlow

## Project

PilotFlow is a Hermes Agent plugin for Feishu group chat project supervision. Users @PilotFlow in a group chat, describe or discuss work, and Hermes decides whether to plan, ask follow-up questions, suggest projectization, or execute real Feishu artifacts (docs, bitable, tasks, messages).

## Structure

```
PilotFlow/
├── plugins/pilotflow/       # Core plugin (tools.py + __init__.py + plugin.yaml)
│   ├── tools.py             # 9 tool handlers + Feishu API wrappers (~5800 lines)
│   ├── trace.py             # Business-readable Flight Recorder trace primitives
│   ├── __init__.py          # Plugin registration with Hermes tool registry
│   └── plugin.yaml          # Plugin metadata
├── skills/pilotflow/        # Hermes skill definitions
│   ├── SKILL.md             # Full skill with YAML frontmatter (LLM workflow guide)
│   └── DESCRIPTION.md       # Short discovery hint
├── docs/                    # Product spec, architecture, innovation docs
├── README.md / README_EN.md # Project documentation
├── INSTALL.md               # Installation guide
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
- **Flight Recorder**: `plugins/pilotflow/trace.py` owns business-readable traces and redaction; future run evidence should build on it instead of ad-hoc logs
- **Branch policy**: the only default branch is `main`; never recreate `master`. New work uses explicit feature branches when needed.

## Intelligence Boundary

- Hermes Agent owns semantic understanding: intent recognition, context summarization, missing-info judgment, projectization suggestions, and extraction of goals/commitments/risks/action items.
- PilotFlow tools own execution: validation, confirmation gates, Feishu API writes, card rendering, state persistence, reminders, and safe follow-up actions.
- Do not implement Agent behavior with keyword lists, regex intent classifiers, or hardcoded Chinese phrase matching in `plugins/pilotflow/tools.py`.
- Keyword or regex logic is allowed only for execution-layer parsing with narrow deterministic semantics, such as ISO/Chinese date normalization, explicit project-name fuzzy lookup, Feishu mention cleanup, URL/resource extraction, and safety gates.
- If a feature needs "understanding", expose structured schema fields and update `skills/pilotflow/SKILL.md` so Hermes supplies the semantic result. The tool should not infer meaning from raw chat text.
- Tests for Agent-facing tools should assert structured input/output and safety behavior, not that a keyword phrase is classified as a specific intent.

## Product Direction

- PilotFlow should position itself as the group-chat project kickoff governance layer before Feishu Projects, not as a replacement project-management system.
- The durable differentiators are group-chat projectization, unified confirmation gates, risk decision cards, idempotency, and Flight Recorder evidence.
- Treat Base/tasks/docs as current execution backends and fallbacks. If Feishu Projects APIs become available, prefer integrating them as the authoritative project backend.
- Do not prioritize adding more low-level Feishu API surfaces unless they strengthen project governance, evidence, confirmation, or follow-up.

## Conventions

- All user-facing text in Chinese
- Tool names are English (`pilotflow_*`) — required by OpenAI API schema validation
- No English or tool names shown to users
- Plugin is installed with `python setup.py --hermes-dir <hermes-agent-path>`; manual copy is fallback only

## Testing

- Local: `C:\Users\Ding\miniforge3\python.exe -m pytest tests -q` (328 passed)
- Plugin install: `python setup.py --hermes-dir D:\Code\LarkProject\hermes-agent`
- WSL runtime verifier: `scripts/verify_wsl_feishu_runtime.py --hermes-dir <path> --env-file ~/.hermes/.env --config-file ~/.hermes/config.yaml` supports `--probe-llm`, `--send-card`, `--verify-health-check`, `--verify-plugin-registration`, `--verify-projectization-suggestion`, `--verify-card-command-bridge`, `--verify-history-suggestions` and ~15 additional modes for release evidence.
- E2E: @PilotFlow in Feishu group chat

## Dependencies

- hermes-agent (runtime)
- lark-oapi (Feishu SDK)
- OpenAI-compatible chat completion provider configured through Hermes

## Verification Checklist

- Run `pytest -q` before committing.
- Run `python setup.py --hermes-dir <hermes-agent-path>` after plugin changes.
- In the Hermes runtime, import `plugins.pilotflow` and verify registered tools.
- For release claims, separate local test evidence from real Feishu live evidence.

## Public Repo Boundaries

This is a public GitHub repo. Never commit:

- Personal info, contest submission forms, Q&A prep, demo scripts, internal reviews
- Model provider details, endpoint URLs, API keys, secrets, tokens
- Local paths (`C:\Users\...`, `/mnt/d/...`), WSL-specific notes
- Internal roadmap, delivery audits, spike reports, review inbox

These belong in `D:\Code\LarkProject\Docs\` or `Archive\`, not in git.
