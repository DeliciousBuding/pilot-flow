# PilotFlow Demo Playbook

This playbook is the recommended 6 to 8 minute demo flow for PilotFlow.

## Product Story

PilotFlow is an AI project operations officer inside Feishu. It helps a team turn a messy group discussion into a confirmed plan, project brief, task state, risk decision, stable project entry, and delivery summary.

The product should feel less like "ask a bot a question" and more like "a project manager is quietly pushing the team from discussion to delivery."

## Demo Setup

Use the activity tenant test environment.

| Resource | Current target |
| --- | --- |
| Feishu group | `PilotFlow API Test 2026-04-28` |
| Activity profile | `pilotflow-contest` |
| Project State Base | `GM08bZjW2aRdWQsZOFLcIClrnac` |
| Project State table | `tbl6VvarB47BSudw` |

Before a live recording or live presentation:

- Confirm `lark-cli auth status --verify` reports a valid token for `pilotflow-contest`.
- Confirm `.env` contains the local-only demo targets and is not committed.
- Run `npm run pilot:check`.
- Run `npm test` when the code changed, not just the recording material.
- Keep the latest successful JSONL run log available.
- Generate a local Flight Recorder HTML and Evidence Pack Markdown.

## 6 To 8 Minute Script

### 1. Open With The User Problem

Show the Feishu group first.

Key message:

> Team decisions often happen in chat, but delivery state lives elsewhere. PilotFlow keeps the work inside Feishu and turns the discussion into confirmed execution.

Do not start from terminal output. The product surface is the Feishu group.

### 2. Trigger A Project Launch

Explain that the current prototype uses a manual trigger fixture, while the intended product entry is group IM or `@PilotFlow`.

Run or reference the live command used for the latest validated path:

```bash
npm run pilot:demo -- --live --confirm "确认起飞" --send-plan-card --send-risk-card --pin-entry-message --update-announcement
```

Expected product result:

- A project flight plan card is sent.
- Human confirmation is required before visible side effects.
- PilotFlow creates or updates the project artifacts.

### 3. Show The Feishu-Native Outputs

Move through the real outputs in this order:

| Step | What to show | What to say |
| --- | --- | --- |
| Flight plan card | Group message card | PilotFlow summarizes the intent before acting |
| Feishu Doc | Generated project brief | The project now has a stable narrative artifact |
| Base rows | Project State table | Tasks, risks, artifacts, owners, deadlines, and source run are structured |
| Task | Feishu Task | At least one action item can become a native task |
| Risk card | Group message card | Risks are not hidden; they are pushed back into the group for decision |
| Pinned entry | Group pin | The project has a stable group entry even if announcement API is blocked |
| Final summary | Group message | The team gets links and next actions back in the same chat |

### 4. Show The Trace

Open the generated Flight Recorder HTML or Evidence Pack Markdown.

Key message:

> PilotFlow does not just create artifacts. It records the plan, tool calls, returned IDs, failures, and fallbacks so the team can audit what happened.

Use this to explain why the product is safer than a black-box chat assistant.

### 5. Explain The Fallbacks

Briefly show the two current platform edges:

- Card callback listener connects, but real `card.action.trigger` has not yet arrived in the validation window.
- Native group announcement update returned `232097 Unable to operate docx type chat announcement` in the current test group.

Product framing:

> These are not hidden failures. PilotFlow records them and continues through stable Feishu-native fallbacks: text confirmation and pinned entry message.

### 6. Close With Roadmap

Use the roadmap language:

- Phase 2 standard Feishu-native MVP is mostly complete.
- Phase 3 focuses on demo hardening, recording, permission evidence, and callback configuration.
- Phase 4 adds mobile confirmation, Whiteboard or Calendar, and worker artifact preview.

## Operator Checklist

Before demo:

- [ ] `npm run pilot:check` passes.
- [ ] `npm test` passes after code changes.
- [ ] Latest live run log exists.
- [ ] Flight Recorder HTML generated.
- [ ] Evidence Pack Markdown generated.
- [ ] Feishu group, Doc, Base, Task, and pinned entry are ready to open.
- [ ] Known fallback explanation is ready.

During demo:

- [ ] Start from Feishu group, not terminal.
- [ ] Show confirmation before side effects.
- [ ] Show native outputs.
- [ ] Show traceability.
- [ ] Mention limits plainly without over-explaining implementation details.

After demo:

- [ ] Save the run log.
- [ ] Regenerate evidence pack if a new run was used.
- [ ] Update `docs/ROADMAP.md` if a Phase 3 item became complete.
