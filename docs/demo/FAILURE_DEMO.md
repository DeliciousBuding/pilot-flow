# Failure-Path Demo Pack

PilotFlow keeps a failure-path demo pack for the cases that reviewers are most likely to ask about after seeing the happy path. The pack turns listener logs, live fallback logs, and local evaluation reports into a single reviewer-facing failure narrative.

The goal is practical: show that PilotFlow does not hide platform limits, unclear requirements, or unsafe planner output. It records the condition, chooses the stable fallback, and keeps the project launch explainable.

## Generate The Pack

```bash
npm run test:one -- failure
npm run demo:failure -- --output tmp/demo-failure/FAILURE_DEMO.md
```

The generated report is local-only by default and lives under ignored `tmp/`.

## Source Evidence

| Evidence | Default path | Purpose |
| --- | --- | --- |
| Card callback listener log | `tmp/runs/card-button-listener-dryrun-20260429.jsonl` | Shows that the listener connected but received no `card.action.trigger` event in the bounded window |
| Live announcement fallback run log | `tmp/runs/announcement-upgrade-live-20260429-fixed.jsonl` | Shows the announcement API `232097` error and pinned-entry continuation |
| Demo Evaluation Pack | `tmp/demo-eval/DEMO_EVAL_20260429.md` | Shows invalid plan, duplicate run, vague deadline, and missing-owner cases |

## Covered Failure Paths

| Scenario | Product behavior | Demo boundary |
| --- | --- | --- |
| Card callback event did not arrive | Keep text confirmation as the stable fallback while Open Platform callback configuration is verified | Do not claim real button callback delivery is verified |
| Group announcement API blocked | Record the optional announcement failure and continue with the pinned project-entry message | Do not claim group announcement works in the current test group |
| Invalid planner schema | Return a clarification plan before confirmation, duplicate guard, or Feishu side effects | Show that malformed planner output fails closed |
| Duplicate live run blocked | Stop repeated visible Feishu writes unless the operator explicitly bypasses the guard | Show idempotency and demo safety |
| Missing owner or vague deadline | Surface ownership, deliverable, and deadline risks before polishing the output | Show PilotFlow as a project operator, not a blind content generator |

## Current Generated Evidence

Latest local output:

```text
tmp/demo-failure/FAILURE_DEMO_20260429.md
```

The current pack contains five evidence-ready scenarios and includes these anchors:

```text
card.action.trigger
232097 Unable to operate docx type chat announcement
DUPLICATE_RUN_BLOCKED
```

## How To Use In Recording

Use this pack after the happy-path walkthrough:

1. Start from the Feishu group and show the normal stable path first.
2. Open the Failure-Path Demo Pack as the appendix.
3. Explain callback and announcement limits as platform or configuration boundaries, not product success claims.
4. Show that invalid plans and duplicate runs stop before Feishu side effects.
5. Tie missing owner and vague deadline cases back to the risk decision card.

## Scope Boundary

- This pack is not a replacement for a recorded failure-path walkthrough.
- It does not trigger live Feishu writes.
- It does not claim card callback delivery is verified.
- It does not claim native group announcement works in the current test group.
- It should be shown together with the Capture Pack, Evaluation Pack, and real Feishu artifacts.
