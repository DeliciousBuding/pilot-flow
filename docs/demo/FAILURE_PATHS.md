# Failure Paths And Fallbacks

PilotFlow should not hide platform limits or tool failures. A core product promise is that every important action is completed, stopped before side effects, or recorded with a fallback.

## Fallback Map

| Situation | Current behavior | Demo explanation |
| --- | --- | --- |
| Card callback event does not arrive | Use text confirmation `确认执行` | Confirmation is still explicit; card callback remains a platform configuration item |
| Group announcement API is blocked | Record failed announcement artifact and use pinned entry message | The project still has a stable Feishu-native group entry |
| Base/table config is missing | Stop before visible side effects | Prevents half-created project artifacts |
| Plan schema is invalid | Return `needs_clarification` before confirmation and tools | PilotFlow does not act on unsafe or incomplete plans |
| Duplicate live run is detected | Block unless explicitly bypassed | Prevents repeated Docs, Tasks, and group messages during demos |
| Owner cannot map to `open_id` | Keep text owner fallback in Base and Task description | The project remains usable while native assignment improves |
| Contacts lookup is blocked or ambiguous | Record lookup outcome and keep fallback owner | Permissions or ambiguity do not break the main flow |
| Live network is unavailable | Use generated review packs and Flight Recorder | The demo can still show completed artifacts and fallback trace from a real run |

## Known Current Platform Edges

### Card Callback Delivery

Implemented:

- Execution-plan card action values.
- Risk-decision card action values.
- Local callback parser and handler.
- Bounded event listener.
- Callback-trigger bridge.

Observed live behavior:

- Listener connected to Feishu successfully.
- No real `card.action.trigger` event has been captured yet.

Current demo stance:

- Do not claim end-to-end card callback delivery is validated.
- Show the card and explain text confirmation as the stable fallback.
- Treat callback delivery as an Open Platform configuration verification item.

### Group Announcement API

Observed live behavior:

```text
232097 Unable to operate docx type chat announcement
```

Current product behavior:

- Try the native announcement update only when requested.
- Record the failure as an optional artifact.
- Continue the run with a pinned project entry message.

Current demo stance:

- The stable product entry is pinned message.
- The announcement path is a documented upgrade path, not the primary demo dependency.

## Failure-Path Evidence

The generated failure-path and evaluation reports should cover:

| Scenario | Evidence to show |
| --- | --- |
| Callback event did not arrive | Listener evidence and callback-verification status |
| Announcement API blocked | Announcement error and pinned-entry continuation |
| Invalid planner schema | Clarification result before confirmation or Feishu writes |
| Duplicate live run blocked | Duplicate-run guard result |
| Missing owner or vague deadline | Risk detection and risk-decision card explanation |

Regenerate local evidence through the operator runbook commands, then use the generated report as an appendix during Q&A.

## Reviewer Q&A Language

Use product language:

> PilotFlow treats tool failures as part of the project state. It records the condition, chooses a safe fallback when possible, and tells the team what happened.

Avoid claiming:

- Everything is fully automated.
- All Feishu APIs are already production-ready.
- Card buttons are validated end to end.
- Group announcement works in all groups.
- Multi-agent worker automation is part of the current main loop.

## No-Network Fallback

If the live Feishu environment is unavailable during a presentation:

- Open scrubbed recordings or screenshots if they are already prepared.
- Open the Flight Recorder HTML to show the full run trace.
- Open generated review packs to show artifact IDs, tool calls, status, and fallback notes.
- Explain that these materials are generated from JSONL logs of real runs, not from a hidden mock path.
