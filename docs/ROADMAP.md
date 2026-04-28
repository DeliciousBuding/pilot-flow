# PilotFlow Roadmap

This roadmap is the product and engineering plan for turning PilotFlow from a validated prototype into a Feishu-native MVP.

## Product Direction

PilotFlow is a project operations officer inside Feishu group chats. It should help a team move from discussion to delivery without forcing everyone into a separate project-management system.

Main loop:

```mermaid
flowchart LR
    A["Group discussion"] --> B["Project flight plan"]
    B --> C["Human confirmation"]
    C --> D["Feishu tool execution"]
    D --> E["Project state"]
    E --> F["Risk decision"]
    F --> G["Delivery summary"]
```

## Phase 0: Foundation and API Flight Test

Status: mostly complete.

- [x] Create workspace and public GitHub repository.
- [x] Collect Feishu official reference docs outside the repo.
- [x] Define positioning as "AI project operations officer".
- [x] Create executable roadmap checklist.
- [x] Upgrade `lark-cli` to `1.0.20`.
- [x] Create activity tenant profile `pilotflow-contest`.
- [x] Validate Feishu group creation.
- [x] Validate group IM send.
- [x] Validate static card send.
- [x] Validate Doc create.
- [x] Validate Task create.
- [x] Validate Base create/write.
- [x] Validate JSONL run logging.

Exit condition:

- [x] P0 Feishu capabilities are validated enough to start product integration.

## Phase 1: 72-Hour MVP Loop

Goal: connect the current dry-run skeleton to real Feishu tools while keeping a manual trigger.

Target loop:

```text
Manual trigger -> JSON plan -> confirmation -> Doc -> Base/Task -> IM summary -> JSONL run log
```

Work items:

- [x] Add runtime mode: `dry-run` vs `live`.
- [x] Add explicit profile support for `pilotflow-contest`.
- [x] Implement live-capable `doc.create` command path in the orchestrator.
- [x] Implement live-capable `base.write` command path for tasks, risks, artifacts, confirmations.
- [x] Implement live-capable `task.create` command path for action items.
- [x] Implement live-capable `im.send` command path for final summary.
- [x] Add confirmation text fallback: "确认起飞".
- [x] Add step status updates in run logs.
- [x] Add live preflight so missing Base/chat targets fail before side effects.
- [x] Normalize Doc/Base/Task/IM artifacts into final run output and JSONL logs.
- [x] Run confirmed live mode against the target test group and Base.
- [x] Validate live artifact IDs and URLs against real `lark-cli` responses.
- [ ] Add fallback plan when plan schema validation fails.
- [ ] Add `demo_success_run.json`.
- [ ] Add `demo_partial_failure_run.json`.

Exit condition:

- [x] One local command creates a real Feishu Doc, writes state, creates at least one Task or Base record, sends a summary to the test group, and records every step.

## Phase 2: Standard Feishu-Native MVP

Goal: turn the minimum loop into a product-shaped Feishu-native experience.

Target loop:

```text
IM + Cards + Doc + Group Announcement + Base + Task + Risk + Flight Recorder
```

Work items:

- [ ] Design and send a project flight plan card.
- [ ] Support card buttons for confirm, edit, doc-only, cancel.
- [ ] Implement text confirmation fallback when card callback is blocked.
- [ ] Create a Base template with fields:
  - `type`
  - `title`
  - `owner`
  - `due_date`
  - `status`
  - `risk_level`
  - `source_run`
  - `source_message`
  - `url`
- [ ] Create real task records with owner/deadline when mappings are available.
- [ ] Add owner mapping fallback to text fields.
- [ ] Try group announcement update.
- [ ] Fall back to a project entry message if announcement update fails.
- [ ] Build a lightweight Flight Recorder view.
- [ ] Add risk detection:
  - missing owner
  - deadline conflict
  - overloaded owner
  - missing deliverable

Exit condition:

- [ ] A 6 to 8 minute demo can run in the real test group and show IM, card, Doc, Base/Task, project entry, risk handling, summary, and run trace.

## Phase 3: Demo Hardening

Goal: make the MVP stable enough for live evaluation.

- [ ] Create a happy-path recording.
- [ ] Create a partial-failure recording.
- [ ] Capture API permission screenshots.
- [ ] Capture tool call and run log screenshots.
- [ ] Prepare demo script.
- [ ] Prepare Q&A answers.
- [ ] Prepare no-network fallback explanation.
- [ ] Keep a pre-generated Feishu Doc/Base/Task set for backup.

Exit condition:

- [ ] Demo can be delivered live or by recording without relying on unstated assumptions.

## Phase 4: Strong MVP Enhancements

Only start after Phase 2 is stable.

- [ ] Mobile confirmation flow.
- [ ] Desktop Flight Recorder cockpit.
- [ ] Risk decision card.
- [ ] Whiteboard or Calendar, choose one:
  - Whiteboard: project roadmap visualization.
  - Calendar: milestone schedule suggestion or event creation.
- [ ] Worker artifact preview:
  - document worker
  - table cleanup worker
  - script automation worker

Rules:

- Worker artifacts must not write to Feishu directly.
- PilotFlow publishes worker output only after human confirmation.
- Worker is a supporting route, not the core product packaging.

## Phase 5: Productization

Longer-term direction after competition MVP.

- [ ] Event-driven group trigger.
- [ ] Multi-group project space management.
- [ ] Persistent project memory.
- [ ] Permission and audit model.
- [ ] Eval cases for planning, confirmation, retry, idempotency, and fallback.
- [ ] Deployment package.
- [ ] Public docs site or GitHub Pages.

## Immediate Next Actions

1. Add live execution mode to the current tool executor.
2. Use `pilotflow-contest` profile by default for project API tests.
3. Fill target env values for chat, Base, table, and optional tasklist.
4. Run `npm run demo:manual -- --live --confirm "确认起飞"` against real Feishu targets.
5. Validate created Doc, Base rows, Task, and IM message links in the run result.
6. Keep README and docs updated with each implementation step.
7. Commit and push every completed vertical slice to GitHub.

## Long-Term Roadmap

### Week 1: Real Feishu Loop

- [x] Replace dry-run tool outputs with live mode behind an explicit flag.
- [x] Use environment variables for test chat, Base, table, and profile.
- [x] Make `npm run demo:manual -- --live` create real artifacts.
- [ ] Add idempotency or duplicate-run guard for every write.
- [ ] Add screenshots or recordings only after the flow is stable.

### Week 2: Product-Shaped MVP

- [ ] Add card confirmation or text fallback.
- [ ] Add Base template setup command.
- [ ] Add Task mapping and owner fallback.
- [ ] Add group announcement or entry-message fallback.
- [ ] Add risk decision summary.
- [ ] Add Flight Recorder viewer.

### Week 3: Demo and Evaluation

- [ ] Prepare a complete 6 to 8 minute demo.
- [ ] Add eval cases for missing owner, deadline conflict, duplicate writes, and tool failure.
- [ ] Add failure-path demo.
- [ ] Harden docs and README for judges and GitHub visitors.
- [ ] Push all repo updates promptly.

### Week 4+: Expansion

- [ ] IM event subscription and allowlisted group trigger.
- [ ] Multi-project spaces.
- [ ] Whiteboard or Calendar enhancement.
- [ ] Worker artifact sandbox route.
- [ ] Deployment and public docs site.
