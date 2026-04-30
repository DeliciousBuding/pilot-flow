# PilotFlow Documentation

This directory contains the public documentation set for PilotFlow. It should read like a product repository, not a development diary.

## Start Here

| Reader | Recommended path |
| --- | --- |
| Judge or product reviewer | `README.md` -> `PROJECT_BRIEF.md` -> `PRODUCT_SPEC.md` -> `ROADMAP.md` |
| Engineer | `README.md` -> `PROJECT_STRUCTURE.md` -> `DEVELOPMENT.md` -> `ARCHITECTURE.md` |
| Operator | `README.md` -> `OPERATOR_RUNBOOK.md` -> `demo/README.md` |
| Designer or demo owner | `VISUAL_DESIGN.md` -> `demo/README.md` -> `demo/CAPTURE_GUIDE.md` |
| Future agent session | workspace `AGENTS.md` -> `PERSONAL_PROGRESS.md` -> repo README -> this index |

## Product And Engineering Docs

| File | Purpose | Update when |
| --- | --- | --- |
| `PROJECT_BRIEF.md` | Short product narrative, competition brief, and MVP scope | Positioning or scope changes |
| `PRODUCT_SPEC.md` | User promise, target users, maturity model, trust model, MVP boundary | Product decisions change |
| `ARCHITECTURE.md` | Core components, state, tool routing | Runtime or module design changes |
| `PROJECT_STRUCTURE.md` | Runtime layers, command surface, and placement rules | Files move or command boundaries change |
| `OPERATOR_RUNBOOK.md` | Local operation, live run, review-pack generation, troubleshooting | Commands, profiles, run targets, or fallback behavior change |
| `DEVELOPMENT.md` | Contributor workflow, module boundaries, validation matrix | Code ownership, validation policy, or Git workflow changes |
| `PRODUCTIZATION_REFACTOR_PLAN.md` | Cleanup and productization refactor plan | Repo structure, docs surface, or cleanup priorities change |
| `VISUAL_DESIGN.md` | Feishu-native UX and visual rules | Cards, cockpit, or demo surfaces change |
| `ROADMAP.md` | Forward-looking plan and unchecked work | Any phase completes or priorities shift |
| `AGENT_EVOLUTION.md` | Hermes-inspired self-evolution and worker orchestration plan | Agent runtime, memory, eval, worker, or self-improvement direction changes |
| `DOCUMENTATION_PLAN.md` | Documentation governance | README/docs conventions change |
| `rebuild/README.md` | Hermes-style TypeScript Agent kernel rebuild plan and execution status | Runtime kernel, tool registry, gateway, or Agent loop changes |

## Demo Kit

| File | Purpose |
| --- | --- |
| `demo/README.md` | Compact demo material index, current status, and reviewer boundaries |
| `demo/DEMO_PLAYBOOK.md` | 6 to 8 minute demo script and operator checklist |
| `demo/CAPTURE_GUIDE.md` | Recording, screenshot, submission, and safety checklist |
| `demo/FAILURE_PATHS.md` | Fallback behavior, known platform limits, Q&A boundaries, and no-network explanation |

Generated review reports are created under ignored `tmp/` and are not tracked as individual docs. Use `OPERATOR_RUNBOOK.md` for the regeneration commands.

## Command Surface

| Need | Command |
| --- | --- |
| Validate the repo | `npm run pilot:check` |
| Run grouped tests | `npm test` |
| Run TypeScript tests only | `npm run test:ts` |
| Check local environment | `npm run pilot:doctor` |
| Run the manual product loop | `npm run pilot:demo` |
| Render a run trace | `npm run pilot:recorder -- --input <run.jsonl> --output <html>` |
| Rebuild review materials | `npm run pilot:package` |
| Check submission status | `npm run pilot:status` |
| Scan before sharing | `npm run pilot:audit` |

## Planned Folders

```text
docs/
├─ adr/              # architecture decision records
├─ api-validation/   # public distilled Feishu API validation notes
├─ demo/             # human-facing demo kit only
└─ images/           # screenshots and visual assets after UI is real
```

Do not commit official reference caches, raw private API logs, App Secrets, access tokens, or personal progress-only materials into this public repository.
