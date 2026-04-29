# PilotFlow Documentation

This directory contains the public documentation set for PilotFlow.

## Start Here

| Reader | Recommended path |
| --- | --- |
| Judge or product reviewer | `README.md` -> `PROJECT_BRIEF.md` -> `PRODUCT_SPEC.md` -> `ROADMAP.md` |
| Engineer | `README.md` -> `DEVELOPMENT.md` -> `ARCHITECTURE.md` |
| Designer or demo owner | `VISUAL_DESIGN.md` -> `demo/README.md` -> `ROADMAP.md` |
| Future agent session | workspace `AGENTS.md` -> `PERSONAL_PROGRESS.md` -> repo README -> this index |

## Documents

| File | Purpose | Update when |
| --- | --- | --- |
| `PROJECT_BRIEF.md` | Short product and competition brief | Positioning or scope changes |
| `PRODUCT_SPEC.md` | User promise, MVP boundary, feature tiers | Product decisions change |
| `ARCHITECTURE.md` | Core components, state, tool routing | Runtime or module design changes |
| `DEVELOPMENT.md` | Local setup, validation, GitHub sync | Commands, profiles, validation, or workflows change |
| `VISUAL_DESIGN.md` | Feishu-native UX and visual rules | Cards, cockpit, or demo surfaces change |
| `ROADMAP.md` | Immediate and long-term plan | Any phase completes or priorities shift |
| `DOCUMENTATION_PLAN.md` | Documentation governance | README/docs conventions change |

## Demo Kit

| File | Purpose |
| --- | --- |
| `demo/README.md` | Demo material index and current validation status |
| `demo/DEMO_PLAYBOOK.md` | 6 to 8 minute demo script and operator checklist |
| `demo/DEMO_QA.md` | Reviewer-facing product and technical Q&A |
| `demo/FAILURE_PATHS.md` | Fallback behavior, known platform limits, and no-network explanation |
| `demo/EVALUATION.md` | Runnable demo-risk evaluation cases and generated-report workflow |
| `demo/CAPTURE_GUIDE.md` | Recording and screenshot capture checklist |
| `demo/FAILURE_DEMO.md` | Failure-path demo pack workflow and reviewer-facing boundaries |

## Planned Folders

```text
docs/
├─ adr/              # architecture decision records
├─ api-validation/   # public distilled Feishu API validation notes
├─ demo/             # demo playbook, Q&A, fallback notes
└─ images/           # screenshots and visual assets after UI is real
```

Do not commit official reference caches, raw private API logs, App Secrets, access tokens, or personal progress-only materials into this public repository.
