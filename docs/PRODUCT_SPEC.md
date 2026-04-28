# Product Spec

## One-Line Positioning

PilotFlow is the AI project operations officer inside Feishu group chats.

## User Promise

When a team discusses a project in Feishu, PilotFlow helps turn the conversation into:

- a confirmed project plan
- a structured brief
- visible tasks and risks
- a stable project entry point
- a delivery summary
- a trace of what happened

## Primary User

Teams that already coordinate in Feishu group chats and need lightweight project operations without adopting a heavy project-management tool.

## Product Principles

| Principle | Meaning |
| --- | --- |
| Agent as Pilot | The Agent drives planning, execution, and follow-up |
| Human in Control | Side effects require confirmation |
| Feishu Native | Use IM, Cards, Docs, Base, Tasks, and announcements first |
| Traceable | Every run records tool calls, artifacts, errors, and fallbacks |
| Practical | The MVP should solve a real workflow before adding agent theater |

## MVP Scenario

Demo input:

```text
Help us launch a project. Goal: PilotFlow MVP demo.
Members: product, integration, demo owner.
Deliverables: project brief, task board, risk list, final summary.
Deadline: this week.
```

Expected flow:

1. PilotFlow proposes a project flight plan.
2. User confirms the plan.
3. PilotFlow creates a Feishu Doc.
4. PilotFlow writes task/risk state to Base or Task.
5. PilotFlow publishes a stable project entry message and can pin it in the group.
6. PilotFlow sends a final summary to the group.
7. PilotFlow records the run in Flight Recorder.

## P0 Features

| Feature | Description | Status |
| --- | --- | --- |
| Manual trigger | Start from local command | implemented |
| Project plan JSON | Extract goal, members, deliverables, deadline, risks | implemented for fixture |
| Plan validation fallback | Stop unsafe runs when planner output is malformed | prototype implemented |
| Flight plan card | Show plan before write side effects | dry-run prototype implemented |
| Confirmation gate | Require approval before writes | dry-run auto-confirm, live text fallback implemented |
| Doc creation | Create project brief | live validated with returned Doc URL |
| Base write | Store project state | live validated with returned record IDs |
| Base owner/deadline fallback | Store owner, due date, risk level, source, and URL as text fields | dry-run prototype implemented |
| Task creation | Create first action item | live validated with returned Task URL; text owner fallback and optional open_id assignee mapping |
| Task assignee mapping | Map planner owner labels to Feishu `open_id` values for Task assignment | dry-run prototype implemented |
| Contact owner lookup | Resolve the first task owner through Feishu Contacts when no explicit map exists | read-path validated; optional prototype implemented |
| Project entry message | Stable project entrance fallback | dry-run prototype implemented |
| Pinned project entry | Pin the entry message before full group announcement support | dry-run prototype implemented |
| Risk detection | Enrich planner risks with derived operational risks | prototype implemented |
| Risk decision card | Present risk summary and decision actions in Feishu card format | dry-run prototype implemented |
| IM summary | Send final summary to group | live validated; artifact-aware text summary implemented |
| Run log | JSONL trace | implemented with step status and artifact events |
| Duplicate-run guard | Prevent accidental repeated live writes | local prototype implemented |
| Flight Recorder view | Render JSONL run logs as a local HTML cockpit | static prototype implemented |

## P1 Features

- IM event trigger.
- Interactive card confirmation.
- Card update after confirmation.
- Base template.
- Group announcement project entry beyond pinned-entry fallback.
- Risk decision persistence after card callbacks are wired.
- Flight Recorder cockpit.

## P2 Features

- Mobile confirmation polish.
- Whiteboard roadmap or Calendar scheduling.
- Slides outline generation.
- Worker artifact preview.
- Persistent project memory.
- Multi-group project spaces.

## Non-Goals for MVP

- Heavy H5 project management dashboard.
- Full multi-agent runtime.
- Code worker as the main product story.
- Automatic bulk writes without confirmation.
- Reading all historical group messages by default.
- Replacing Feishu native collaboration surfaces.

## Success Metrics

| Metric | MVP target |
| --- | --- |
| Demo completion | 6 to 8 minute run without manual backfill |
| Traceability | Every tool call appears in run log |
| Feishu-native proof | IM, Card, Doc, Base or Task are visible in Feishu |
| Human control | At least one confirmation before writes |
| Unsafe-plan prevention | Invalid planner output enters clarification before Feishu writes |
| Operational state | Base rows include fallback owner, due date, risk level, source run, source message, and URL fields |
| Native assignment | Task assignee can come from explicit `open_id` mapping or optional Feishu Contacts lookup |
| Risk handling | Detected risks appear consistently in run output, Base rows, and risk decision card |
| Duplicate safety | Repeating a live project-init run is blocked unless explicitly bypassed |
| Recovery | At least one fallback path is demonstrated |
