# PilotFlow Demo Kit

This folder keeps the public demo materials for PilotFlow. It is written for reviewers, demo owners, and future contributors who need to understand how the product is shown, what has already been validated, and how fallback paths should be explained.

## Demo Goal

Show that PilotFlow can work inside a real Feishu group as an AI project operations officer:

```text
Group intent -> Flight plan -> Human confirmation -> Doc/Base/Task/Card/Entry -> Summary -> Evidence trace
```

The demo should make three things obvious:

| What to prove | How to show it |
| --- | --- |
| PilotFlow is Feishu-native | Use the real group, cards, Doc, Base, Task, pinned entry, and summary message |
| PilotFlow is controllable | Show the confirmation gate and explain fallback confirmation |
| PilotFlow is traceable | Open the run log evidence pack or Flight Recorder view |

## Files

| File | Purpose |
| --- | --- |
| [`DEMO_PLAYBOOK.md`](DEMO_PLAYBOOK.md) | 6 to 8 minute product demo script and operator checklist |
| [`DEMO_QA.md`](DEMO_QA.md) | Reviewer-facing Q&A for product, Feishu integration, safety, and roadmap |
| [`FAILURE_PATHS.md`](FAILURE_PATHS.md) | Known platform limits, fallback behavior, and how to explain them |

Generated local evidence artifacts are not committed by default. Create them from a JSONL run log:

```bash
npm run flight:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html
npm run demo:evidence -- --input tmp/runs/latest-manual-run.jsonl --output tmp/demo-evidence/DEMO_EVIDENCE.md
```

## Recommended Screens

| Screen | Use in demo |
| --- | --- |
| Feishu test group | Primary product surface: cards, entry pin, final summary |
| Feishu Doc | Shows generated project brief |
| Feishu Base | Shows structured tasks, risks, artifacts, owner/deadline/source fields |
| Feishu Task | Shows concrete action item and optional assignee mapping |
| Flight Recorder HTML | Shows tool calls, artifacts, failures, and fallback decisions |
| Evidence Pack Markdown | Backup narrative if network or UI switching is unreliable |

## Current Demo Status

| Area | Status |
| --- | --- |
| Live one-command Feishu run | Validated |
| Project flight plan card send | Validated after short idempotency-key fix |
| Risk decision card live send | Validated |
| Rich Base state rows | Validated |
| Project entry pinned in group | Validated |
| Native group announcement | Attempted; current test group returns docx announcement API block |
| Card callback delivery | Listener connects; real callback event still needs Open Platform configuration verification |
