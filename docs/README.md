# PilotFlow Documentation

This directory contains the public documentation set for PilotFlow.

## Start Here

| Reader | Recommended path |
| --- | --- |
| Judge or product reviewer | `README.md` -> `PROJECT_BRIEF.md` -> `PRODUCT_SPEC.md` -> `ROADMAP.md` |
| Engineer | `README.md` -> `PROJECT_STRUCTURE.md` -> `DEVELOPMENT.md` -> `ARCHITECTURE.md` |
| Operator | `README.md` -> `OPERATOR_RUNBOOK.md` -> `demo/README.md` |
| Designer or demo owner | `VISUAL_DESIGN.md` -> `demo/README.md` -> `ROADMAP.md` |
| Demo reviewer package owner | `demo/DELIVERY_INDEX.md` -> generated Delivery Index -> generated Judge Review Pack -> generated Submission Pack |
| Future agent session | workspace `AGENTS.md` -> `PERSONAL_PROGRESS.md` -> repo README -> this index |

## Documents

| File | Purpose | Update when |
| --- | --- | --- |
| `PROJECT_BRIEF.md` | Short product narrative, competition brief, and MVP scope | Positioning or scope changes |
| `PRODUCT_SPEC.md` | User promise, target users, maturity model, trust model, MVP boundary | Product decisions change |
| `ARCHITECTURE.md` | Core components, state, tool routing | Runtime or module design changes |
| `PROJECT_STRUCTURE.md` | Runtime layers, command surface, and placement rules | Files move or command boundaries change |
| `OPERATOR_RUNBOOK.md` | Local operation, live run, evidence regeneration, troubleshooting | Commands, profiles, run targets, or fallback behavior change |
| `DEVELOPMENT.md` | Contributor workflow, module boundaries, validation matrix | Code ownership, validation policy, or Git workflow changes |
| `PRODUCTIZATION_REFACTOR_PLAN.md` | Cleanup and productization refactor plan | Repo structure, docs surface, or cleanup priorities change |
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
| `demo/READINESS.md` | Pre-recording readiness gate for evidence, docs, and manual capture work |
| `demo/PERMISSIONS.md` | Permission and callback appendix generation workflow |
| `demo/CALLBACK_VERIFICATION.md` | Callback readiness report for card payloads, bounded listener, and real event delivery |
| `demo/JUDGE_REVIEW.md` | Reviewer-facing entry pack for product story, evidence sources, boundaries, and reproduction commands |
| `demo/SUBMISSION.md` | Final local gate for machine evidence and manual capture manifest status |
| `demo/DELIVERY_INDEX.md` | Local review-packaging start page across docs, generated evidence, traces, and manual capture state |
| `demo/SAFETY_AUDIT.md` | Pattern-based safety gate for public docs, generated review packs, and trace material |

## Command Surface

| Need | Command |
| --- | --- |
| Validate the repo | `npm run pilot:check` |
| Run grouped tests | `npm test` |
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
├─ demo/             # demo playbook, Q&A, fallback notes
└─ images/           # screenshots and visual assets after UI is real
```

Do not commit official reference caches, raw private API logs, App Secrets, access tokens, or personal progress-only materials into this public repository.
