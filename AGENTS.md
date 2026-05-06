# AGENTS.md — PilotFlow

## Repository Purpose

PilotFlow is a Hermes Agent plugin for Feishu group chat project operations. It turns group-chat project intent into confirmed, traceable Feishu artifacts: documents, Base records, tasks, calendar events, reminders, status cards, and follow-up actions.

This repository is public-facing. Treat every tracked file as part of a mature open-source product.

## Repository Structure

```
PilotFlow/
├── plugins/pilotflow/       # Core plugin
│   ├── tools.py             # Tool handlers, Feishu API adapters, state workflows
│   ├── trace.py             # Redacted business trace helpers
│   ├── __init__.py          # Hermes plugin registration
│   └── plugin.yaml          # Plugin metadata
├── skills/pilotflow/        # Hermes skill guidance
├── docs/                    # Public product and developer documentation
├── tests/                   # Regression tests
├── scripts/                 # Runtime verification helpers
├── README.md / README_EN.md # Public project landing pages
├── INSTALL.md               # Public installation guide
└── setup.py                 # Plugin installer
```

## Product Boundary

- Hermes Agent owns semantic understanding: intent recognition, context summarization, missing-info judgment, projectization suggestions, and extraction of goals, commitments, risks, action items, filters, view modes, and templates.
- PilotFlow owns execution: validation, confirmation gates, Feishu API writes, card rendering, state persistence, reminders, recovery, and safe follow-up actions.
- Do not implement Agent behavior with broad keyword lists, regex intent classifiers, or hardcoded phrase matching in `plugins/pilotflow/tools.py`.
- Deterministic parsing is allowed only for execution-layer tasks such as date normalization, explicit project lookup, Feishu mention cleanup, resource extraction, and safety gates.
- If a feature requires semantic judgment, expose structured schema fields and update `skills/pilotflow/SKILL.md` so Hermes supplies the decision.

## Public Documentation Rules

`docs/`, `README.md`, `README_EN.md`, `INSTALL.md`, and `CONTRIBUTING.md` serve open-source users and contributors.

Allowed:

- Product positioning and user workflows
- Installation, configuration, and troubleshooting
- Public architecture, product spec, innovation notes, and contribution guidance
- Redacted live evidence and reproducible verification commands

Not allowed:

- Contest submission forms, defense scripts, Q&A preparation, reviewer notes, or internal score material
- Personal information, school or internship details, personal progress reports
- Private Feishu links, real chat/member/message identifiers, tokens, secrets, API keys
- Private model provider names, endpoints, or account-specific model names
- Local machine paths, WSL mount paths, or operator-specific setup notes
- Internal delivery audits, spike reports, temporary handoff prompts, or review inbox files

Contest materials belong outside this repository in the workspace `Docs/` or `Archive/` directories.

## Key Technical Decisions

- Text messages use `registry.dispatch("send_message")`.
- Interactive cards use Feishu IM API through `lark_oapi`.
- Feishu documents, Base apps, tasks, calendars, and permissions use `lark_oapi` directly.
- Project memory and deadline reminders use Hermes dispatch interfaces on a best-effort basis.
- Card buttons are handled through a plugin-level `/card` command bridge and `pilotflow_handle_card_action`.
- Public state is redacted; private resource references stay outside tracked git files.
- The default branch is `main`.

## User-Facing Conventions

- User-facing text is Chinese.
- Tool names remain English (`pilotflow_*`) for schema compatibility.
- Tool names and internal progress should not be shown to Feishu group users.
- PilotFlow is positioned as the group-chat project kickoff and governance layer before formal project management systems.

## Testing

Run before committing code changes:

```powershell
python -m pytest tests -q
```

Run after plugin or skill installation changes:

```powershell
python setup.py --hermes-dir ..\hermes-agent
```

Use `scripts/verify_wsl_feishu_runtime.py` for redacted runtime checks when validating an installed Hermes environment. Real Feishu tests must keep all identifiers and links out of public files.

## Maintenance Checklist

- Keep README, install guide, architecture, product spec, and user guide aligned with current behavior.
- Keep `docs/` free of contest-specific or private preparation material.
- Keep `.gitignore` blocking private contest drafts and local runtime artifacts.
- Separate local regression evidence from real Feishu live evidence.
- Do not modify Hermes runtime source as part of PilotFlow feature work.
