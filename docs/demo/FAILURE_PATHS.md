# Failure Paths And Fallbacks

PilotFlow should not hide platform limits or tool failures. A core product promise is that every important action is either completed, stopped before side effects, or recorded with a fallback.

## Fallback Map

| Situation | Current behavior | Demo explanation |
| --- | --- | --- |
| Card callback event does not arrive | Use text confirmation `确认起飞` | Confirmation is still explicit; card callback remains a platform configuration item |
| Group announcement API is blocked | Record failed announcement artifact and use pinned entry message | The project still has a stable Feishu-native group entry |
| Base/table config is missing | Stop before visible side effects | Prevents half-created project artifacts |
| Plan schema is invalid | Return `needs_clarification` before confirmation and tools | PilotFlow does not act on unsafe or incomplete plans |
| Duplicate live run is detected | Block unless explicitly bypassed | Prevents repeated Docs, Tasks, and group messages during demos |
| Owner cannot map to `open_id` | Keep text owner fallback in Base and Task description | The project remains usable while native assignment improves |
| Contacts lookup is blocked or ambiguous | Record lookup outcome and keep fallback owner | Permissions or ambiguity do not break the main flow |
| Live network is unavailable | Use the latest generated evidence pack and Flight Recorder | The demo can still show the completed run, artifacts, and fallback trace |

## Known Current Platform Edges

### Card Callback Delivery

Implemented:

- Flight plan card action values.
- Risk decision card action values.
- Local callback parser and handler.
- Bounded event listener.
- Callback-trigger bridge.

Observed live behavior:

- Listener connected to Feishu successfully.
- No `card.action.trigger` event was received in the validation window.

Current demo stance:

- Do not claim the real button callback is validated.
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

## Evidence To Keep

For each important demo run, keep local evidence under ignored `tmp/`:

```bash
npm run pilot:recorder -- --input tmp/runs/<run>.jsonl --output tmp/flight-recorder/<run>.html
npm run demo:evidence -- --input tmp/runs/<run>.jsonl --output tmp/demo-evidence/<run>.md
```

Recommended evidence items:

- Run ID.
- Feishu Doc URL.
- Base record IDs.
- Task URL.
- Risk card message ID.
- Pinned entry message ID.
- Final summary message ID.
- Announcement failure artifact, if present.
- Tool-call list and terminal status.

## No-Network Fallback

If the live Feishu environment is unavailable during a presentation, use the latest generated evidence package:

- Open the recorded Feishu screenshots or existing Feishu artifacts if they are already cached in the desktop app.
- Open `tmp/flight-recorder/<run>.html` to show the full run trace.
- Open `tmp/demo-evidence/<run>.md` to show the evidence checklist, artifact IDs, tool calls, and fallback notes.
- Explain that PilotFlow's demo does not depend on a hidden mock path: the evidence pack is generated from the JSONL log of a real live run.

## How To Explain Failure Paths

Use product language:

> PilotFlow treats tool failures as part of the project state. It records the error, chooses a safe fallback when possible, and tells the team what happened.

Avoid claiming:

- "Everything is fully automated."
- "All Feishu APIs are already production-ready."
- "Card buttons are validated end to end."
- "Group announcement works in all groups."
