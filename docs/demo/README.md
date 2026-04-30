# PilotFlow Demo Kit

This folder is the compact public demo kit for PilotFlow. It keeps only the human-facing material needed to show the product, prepare capture, and explain known failure paths. Generated review reports stay under ignored `tmp/` and are regenerated from commands, not maintained as separate tracked docs.

## Demo Goal

Show that PilotFlow can work inside a real Feishu group as an AI project operations officer:

```text
Group intent -> Execution plan -> Human confirmation -> Doc/Base/Task/Card/Entry -> Summary -> Trace
```

The demo should make three things obvious:

| What to prove | How to show it |
| --- | --- |
| Feishu-native workflow | Real group, cards, Doc, Base, Task, pinned entry, and summary message |
| Human control | Confirmation gate, text fallback, and clear callback boundary |
| Traceability | Flight Recorder, run log, and generated review packs |

## Files

| File | Purpose |
| --- | --- |
| [`DEMO_PLAYBOOK.md`](DEMO_PLAYBOOK.md) | 6 to 8 minute product demo script and operator checklist |
| [`CAPTURE_GUIDE.md`](CAPTURE_GUIDE.md) | Recording, screenshot, submission, and safety checklist |
| [`FAILURE_PATHS.md`](FAILURE_PATHS.md) | Known platform limits, fallback behavior, Q&A boundaries, and failure-path evidence |

Generated review reports include evidence, evaluation, readiness, permissions, callback verification, judge review, submission status, delivery index, and safety audit. They are local outputs, not public docs:

```bash
npm run pilot:package
npm run pilot:status
npm run pilot:audit
```

Individual review-pack commands are documented in [`../OPERATOR_RUNBOOK.md`](../OPERATOR_RUNBOOK.md).

## Recommended Screens

| Screen | Use in demo |
| --- | --- |
| Feishu test group | Primary product surface: cards, entry pin, final summary |
| Feishu Doc | Generated project brief |
| Feishu Base | Structured tasks, risks, artifacts, owner/deadline/source fields |
| Feishu Task | Concrete action item and optional assignee mapping |
| Flight Recorder HTML | Plan, artifacts, tool calls, timeline, errors, and fallbacks |
| Generated review packs | Backup evidence if live UI or network switching is unreliable |
| Open Platform console | Permission and callback configuration proof after sensitive fields are hidden |

## Current Demo Status

| Area | Status |
| --- | --- |
| Live one-command Feishu run | Validated |
| Project execution-plan card send | Validated |
| Risk decision card live send | Validated |
| Rich Base state rows | Validated |
| Project entry pinned in group | Validated |
| Native group announcement | Attempted; current test group returns docx announcement API block |
| Card callback delivery | Listener connects; real callback event still needs Open Platform configuration verification |
| Review packs | Evidence, evaluation, readiness, permissions, callback, judge, submission, delivery, and safety generators are available |
| Manual media | Happy-path recording, failure-path capture, permission screenshots, and callback proof remain outside Git |

## Reviewer Q&A Boundaries

| Question | Short answer |
| --- | --- |
| Is this just a chatbot? | No. It plans, waits for approval, writes project state, creates artifacts, sends summaries, and records the run. |
| Is it only useful for programmers? | No. The core value is documents, tasks, risks, status, summaries, and team coordination inside Feishu. |
| Why a pinned entry if announcement exists? | The pinned entry is the stable fallback for the current group; announcement update is recorded as an attempted native upgrade. |
| Why is callback still pending? | Card payloads, local handler, listener, and trigger bridge exist, but real button delivery still needs Open Platform configuration proof. |
| How do humans stay in control? | Live writes require explicit confirmation before visible Feishu side effects. |
| What should not be claimed yet? | Production readiness, fully verified card callback delivery, native group announcement success in the current group, or general multi-agent automation. |
