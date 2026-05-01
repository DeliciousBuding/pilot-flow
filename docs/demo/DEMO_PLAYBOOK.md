# PilotFlow Demo Playbook

This playbook is the recommended 6 to 8 minute demo flow for PilotFlow.

## Product Story

PilotFlow is an AI project operations officer inside Feishu. It turns a messy group discussion into a confirmed plan, project brief, task state, risk decision, stable project entry, and delivery summary.

The product should feel less like "ask a bot a question" and more like "a project manager is quietly pushing the team from discussion to delivery."

## Demo Setup

Use the activity tenant test environment.

| Resource | Current target |
| --- | --- |
| Feishu group | *(configured locally in `.env`)* |
| Activity profile | `pilotflow-contest` |
| Project State Base | *(configured locally in `.env`)* |
| Project State table | *(configured locally in `.env`)* |

Before a live recording or live presentation:

- Confirm `lark-cli auth status --verify` reports a valid token for `pilotflow-contest`.
- Confirm `.env` contains the local-only demo targets and is not committed.
- Run `npm run pilot:check`.
- Run `npm run pilot:doctor` to verify the local environment.
- Run `npm run pilot:live-check` to confirm Feishu targets are reachable.
- Run `npm test` when the code changed, not just the recording material.
- Keep the latest successful JSONL run log available.
- Generate a local Flight Recorder HTML via `npm run pilot:recorder`.
- Generate the Evidence Pack via `npm run pilot:package`.

## 6 To 8 Minute Script

### 1. Open With The User Problem (0:00 - 0:40)

Show the Feishu group first.

Key message:

> Team decisions often happen in chat, but delivery state lives elsewhere. PilotFlow keeps the work inside Feishu and turns the discussion into confirmed execution.

Do not start from terminal output. The product surface is the Feishu group.

### 2. Trigger A Project Launch (0:40 - 1:30)

Explain that the current prototype accepts a natural-language project brief. The intended product entry is a group mention `@PilotFlow`; today we invoke it from the operator CLI with the same engine.

Run the validated live command:

```bash
npm run pilot:run -- --live --confirm "确认执行" \
  --send-plan-card --send-risk-card \
  --send-entry-message --pin-entry-message
```

Expected product result:

- An execution-plan card is sent to the group before any side effect.
- Human confirmation is required before PilotFlow creates or updates project artifacts.
- After confirmation, PilotFlow creates a Doc, Base rows, Task, risk card, pinned entry, and final summary.

### 3. Show The Feishu-Native Outputs (1:30 - 3:30)

Walk through the real outputs in this order:

| Step | What to show | What to say |
| --- | --- | --- |
| Execution plan card | Group message card | PilotFlow summarizes the intent before acting. Nothing is created until the team confirms. |
| Feishu Doc | Generated project brief | The project now has a stable narrative artifact that lives alongside the chat. |
| Base rows | Project State table | Tasks, risks, artifacts, owners, deadlines, and the source run are structured in one place. |
| Task | Feishu Task | At least one action item becomes a native Feishu Task with an assignee and due date. |
| Risk card | Group message card | Risks are not hidden in a log. They are pushed back into the group for the team to decide. |
| Pinned entry | Group pin | The project has a stable group entry so new members can find the brief and status. |
| Final summary | Group message | The team gets links and next actions back in the same chat where the work started. |

### 4. Show The Trace (3:30 - 4:30)

Open the generated Flight Recorder HTML or Evidence Pack Markdown.

Key message:

> PilotFlow does not just create artifacts. It records every plan step, tool call, returned ID, failure, and fallback so the team can audit exactly what happened.

Use this to explain why the product is safer than a black-box chat assistant: every side effect is traceable to a recorded decision.

### 5. Demonstrate The Failure Path (4:30 - 6:00)

Switch to a pre-recorded or dry-run scenario where the card callback event does not arrive within the expected window.

Show the sequence:

1. PilotFlow sends an execution-plan card with a "confirm" button.
2. The button is clicked, but the platform does not deliver the callback event back to the listener.
3. PilotFlow detects the timeout and falls back to text confirmation: the user types `确认执行` in the same chat.
4. The run continues through the stable fallback path and produces the same artifacts.

Key message:

> This is not a silent failure. The timeout and fallback are recorded in the run trace. The team can see exactly what happened and why the system switched to a text confirmation path. The delivery guarantee comes from the fallback, not from hoping every callback arrives on time.

If time permits, briefly show the callback-proof result:

```bash
npm run pilot:callback-proof -- --timeout 60s
```

This validates whether the Open Platform delivers `card.action.trigger` to the local listener. The result is recorded as proof, regardless of whether the callback arrives.

### 6. Close With Roadmap (6:00 - 6:30)

Summarize the current state and next steps:

- The core loop -- plan, confirm, create artifacts, record trace -- is operational on Feishu.
- The callback-driven confirmation path is validated; text confirmation remains as a stable fallback.
- Next priorities include mobile confirmation flow, richer artifact previews, and production-grade event subscription.

## Operator Checklist

Before demo:

- [ ] `npm run pilot:check` passes.
- [ ] `npm run pilot:doctor` reports no missing environment variables.
- [ ] `npm run pilot:live-check` confirms Feishu targets are reachable.
- [ ] `npm test` passes after code changes.
- [ ] Latest live run log exists at `tmp/runs/latest-live-run.jsonl`.
- [ ] Flight Recorder HTML generated via `npm run pilot:recorder`.
- [ ] Evidence Pack generated via `npm run pilot:package`.
- [ ] Feishu group, Doc, Base, Task, and pinned entry are ready to open.
- [ ] Known fallback explanation is prepared (callback timeout, text confirmation).
- [ ] Failure-path demo material is ready (pre-recorded trace or dry-run run).

During demo:

- [ ] Start from Feishu group, not terminal.
- [ ] Show the execution-plan card before any side effect.
- [ ] Walk through each native output in order.
- [ ] Show the trace to prove auditability.
- [ ] Demonstrate the failure path and fallback without over-explaining internals.
- [ ] Close with a forward-looking statement, not a technical caveat.

After demo:

- [ ] Save the run log.
- [ ] Regenerate evidence pack if a new run was used.
- [ ] Update `docs/ROADMAP.md` if a milestone became complete.
