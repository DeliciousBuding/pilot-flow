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
5. PilotFlow publishes a stable project entry message or group announcement.
6. PilotFlow sends a final summary to the group.
7. PilotFlow records the run in Flight Recorder.

## P0 Features

| Feature | Description | Status |
| --- | --- | --- |
| Manual trigger | Start from local command | implemented |
| Project plan JSON | Extract goal, members, deliverables, deadline, risks | implemented for fixture |
| Flight plan card | Show plan before write side effects | dry-run prototype implemented |
| Confirmation gate | Require approval before writes | dry-run auto-confirm, live text fallback implemented |
| Doc creation | Create project brief | live validated with returned Doc URL |
| Base write | Store project state | live validated with returned record IDs |
| Task creation | Create first action item | live validated with returned Task URL |
| Project entry message | Stable project entrance fallback | dry-run prototype implemented |
| IM summary | Send final summary to group | live validated; artifact-aware text summary implemented |
| Run log | JSONL trace | implemented with step status and artifact events |
| Duplicate-run guard | Prevent accidental repeated live writes | local prototype implemented |

## P1 Features

- IM event trigger.
- Interactive card confirmation.
- Card update after confirmation.
- Base template.
- Task owner/deadline mapping.
- Group announcement project entry.
- Risk detection and decision card.
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
| Duplicate safety | Repeating a live project-init run is blocked unless explicitly bypassed |
| Recovery | At least one fallback path is demonstrated |
