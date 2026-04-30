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

## Ideal Customer Profile

| Segment | Situation | PilotFlow value |
| --- | --- | --- |
| Student competition teams | Work is fast, cross-functional, and presentation-driven | Turns group discussion into a visible plan, task state, risk list, and demo evidence |
| Product or operations groups | Decisions happen in IM but execution state lives elsewhere | Keeps Feishu-native artifacts aligned without forcing a separate PM tool |
| Prototype and hackathon teams | Scope and owners change quickly | Creates a repeatable project-launch loop with traceable automation |
| AI-native teams | Agents need to do real collaboration work, not just answer questions | Adds confirmation gates, idempotency, and run logs around tool execution |

## Product Principles

| Principle | Meaning |
| --- | --- |
| Agent as Pilot | The Agent drives planning, execution, and follow-up |
| Human in Control | Side effects require confirmation |
| Feishu Native | Use IM, Cards, Docs, Base, Tasks, and announcements first |
| Traceable | Every run records tool calls, artifacts, errors, and fallbacks |
| Practical | The MVP should solve a real workflow before adding agent theater |

## Product Maturity Model

PilotFlow should be described by its maturity level, not as a finished enterprise platform.

| Level | Meaning | Current state |
| --- | --- | --- |
| Concept | Product positioning and target workflow are defined | complete |
| Validated prototype | Real Feishu APIs can create visible artifacts | current |
| Demo-ready MVP | Main path is stable enough for evaluation with captured proof | in progress |
| Team pilot | Real group trigger, callback confirmation, and repeated team use | planned |
| Productized service | Deployment, tenancy, audit, permissions, and support model | later |

## Product Surface Map

| Surface | User-facing role | Current boundary |
| --- | --- | --- |
| Feishu IM | Main entry point and final summary channel | validated through manual/live runs; automatic group trigger is later |
| Message Cards | Execution plan confirmation and risk decisions | live send and local action protocol ready; real callback delivery pending |
| Feishu Docs | Project brief and delivery document | live creation validated |
| Feishu Base | Project state, risk rows, artifacts, source links | live rich table validated |
| Feishu Task | Concrete first action item with optional assignee mapping | live creation validated; owner lookup remains guarded |
| Pinned entry / announcement | Stable project entrance | pinned entry live validated; native announcement can fall back when API blocks docx announcements |
| Flight Recorder | Trace viewer for explainability and review | static local prototype |

## Trust Model

| Trust requirement | Product rule |
| --- | --- |
| Human control | Live writes pass through a confirmation gate |
| No silent success | Tool errors and fallback paths are recorded |
| Duplicate safety | Repeated visible Feishu writes are blocked unless explicitly bypassed |
| Explainability | Plans, state transitions, artifacts, and tool calls are captured |
| Honest packaging | README and docs separate validated, prototype, pending, and later capabilities |

## MVP Scenario

Demo input:

```text
Help us launch a project. Goal: PilotFlow MVP demo.
Members: product, integration, demo owner.
Deliverables: project brief, task board, risk list, final summary.
Deadline: 2026-05-03.
```

Expected flow:

1. PilotFlow proposes a project execution plan.
2. User confirms the plan.
3. PilotFlow creates a Feishu Doc.
4. PilotFlow writes task/risk state to Base or Task.
5. PilotFlow publishes a stable project entry message, tries to upgrade it to a group announcement, and can pin it in the group when announcement is blocked.
6. PilotFlow sends a final summary to the group.
7. PilotFlow records the run in Flight Recorder.

## P0 Features

| Feature | Description | Status |
| --- | --- | --- |
| Manual trigger | Start from local command | implemented |
| Project plan JSON | Extract goal, members, deliverables, deadline, risks | implemented for fixture |
| Plan validation fallback | Stop unsafe runs when planner output is malformed | prototype implemented |
| Execution plan card | Show plan before write side effects | live send validated with confirm/edit/doc-only/cancel actions |
| Confirmation gate | Require approval before writes | dry-run auto-confirm, live text fallback implemented |
| Card callback readiness | Parse card action callbacks into PilotFlow decisions and trigger approved runs | local handler, bounded listener, and trigger bridge implemented; live listener connected but callback delivery pending |
| Doc creation | Create project brief | live validated with returned Doc URL |
| Base write | Store project state | live validated with returned record IDs |
| Base owner/deadline fallback | Store owner, due date, risk level, source, and URL as text fields | live Project State table validated |
| Task creation | Create first action item | live validated with returned Task URL; text owner fallback and optional open_id assignee mapping |
| Task assignee mapping | Map planner owner labels to Feishu `open_id` values for Task assignment | dry-run prototype implemented |
| Contact owner lookup | Resolve the first task owner through Feishu Contacts when no explicit map exists | read-path validated; optional prototype implemented |
| Project entry message | Stable project entrance fallback | live validated |
| Pinned project entry | Pin the entry message before full group announcement support | live validated |
| Group announcement fallback | Attempt native group announcement update and continue when the API is blocked | live attempted; current test group returns docx announcement API block |
| Risk detection | Enrich planner risks with derived operational risks | prototype implemented |
| Risk decision card | Present risk summary and decision actions in Feishu card format | live send validated |
| IM summary | Send final summary to group | live validated; artifact-aware text summary implemented |
| Run log | JSONL trace | implemented with step status and artifact events |
| Duplicate-run guard | Prevent accidental repeated live writes | local prototype implemented |
| Flight Recorder view | Render JSONL run logs as a local HTML cockpit | static prototype implemented |

## P1 Features

- IM event trigger.
- Live interactive card confirmation from a real Feishu button click.
- Card update after confirmation.
- Base template.
- Open Platform card callback delivery verification.
- Announcement fallback polish for docx-type group announcements.
- Risk decision persistence after card callbacks are wired.
- Flight Recorder cockpit.

## P2 Features

- Mobile confirmation polish.
- Whiteboard roadmap or Calendar scheduling.
- Slides outline generation.
- Worker artifact preview.
- Persistent project memory.
- Multi-group project spaces.
- Run retrospective and improvement proposal loop.
- Controlled manager-worker orchestration for documents, tables, research, scripts, and review.

## Non-Goals for MVP

- Heavy H5 project management dashboard.
- Full multi-agent runtime.
- Code worker as the main product story.
- Hidden self-modification or unreviewed prompt/tool changes.
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
