# Demo Capture Guide

The capture guide turns the current demo evidence into a concrete recording and screenshot checklist. It is designed for the demo owner who needs to prepare a clean walkthrough without overstating what is already verified.

## Generate The Capture Pack

```bash
npm run demo:capture -- --output tmp/demo-capture/CAPTURE_PACK.md
```

The generated file is local-only by default and lives under ignored `tmp/`.

The pack checks whether the following local evidence files exist:

| Evidence | Default path |
| --- | --- |
| JSONL run log | `tmp/runs/announcement-upgrade-live-20260429-fixed.jsonl` |
| Flight Recorder HTML | `tmp/flight-recorder/announcement-upgrade-live-20260429-fixed.html` |
| Demo Evidence Pack | `tmp/demo-evidence/DEMO_EVIDENCE_20260429.md` |
| Demo Evaluation Pack | `tmp/demo-eval/DEMO_EVAL_20260429.md` |

## Required Captures

| Capture | Surface | Purpose |
| --- | --- | --- |
| Happy path group opening | Feishu group | Show card, risk card, pinned entry, and final summary in the primary collaboration space |
| Generated project brief | Feishu Doc | Show the project narrative artifact |
| Structured project state | Feishu Base | Show owner, due date, risk level, source run, source message, and URL fields |
| Native task artifact | Feishu Task | Show at least one action item became a Feishu-native task |
| Traceability view | Flight Recorder HTML | Show plan, artifacts, tool calls, timeline, and fallback records |
| Failure path evidence | Demo Evaluation Pack | Show missing owner, vague deadline, invalid plan, duplicate run, and tool-failure cases |
| Permission and callback appendix | Open Platform console / CLI output | Show pending callback configuration without claiming end-to-end callback readiness |

## Recording Rules

- Start from the Feishu group, not from terminal output.
- Hide app secrets, access tokens, private contact fields, and anything in `.env`.
- Do not claim card-button callback delivery is verified until a real `card.action.trigger` event is captured.
- Do not claim group announcement works in the current group; explain pinned entry as the stable fallback.
- Store videos and raw screenshots outside the repo unless they are scrubbed and intentionally added to public docs.

## Current Generated Evidence

Latest local output:

```text
tmp/demo-capture/CAPTURE_PACK_20260429.md
```

The latest pack was generated from:

```text
run-52a5ca97-be41-4e91-a165-0b71ca9a61ea
```

It reports seven required captures and four ready evidence files.
