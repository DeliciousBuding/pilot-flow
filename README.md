# PilotFlow

PilotFlow is a Feishu-native AI project operations officer for the Feishu AI Campus Challenge.

It works like a project manager inside a Feishu group chat, but keeps human owners in control: it turns scattered discussion into confirmed plans, executable tasks, traceable project state, risk decisions, and concrete deliverables.

> 像一个项目经理一样，在飞书群里推动团队从讨论走向交付。

## Track

- Competition: Feishu AI Campus Challenge
- Track: AI Product Innovation
- Topic: IM-based office collaboration intelligent assistant
- Core idea: AI Agent is the pilot; GUI is the dashboard and co-pilot console.

## Product Goal

Build a multi-device collaborative assistant that connects:

- IM: the primary collaboration space and natural language entry point.
- Cards: clarification, confirmation, risk review, and progress updates.
- Docs: generated and iterated briefs, plans, minutes, and delivery documents.
- Group announcements: pinned project entry and current status summary.
- Base: visible task, risk, artifact, and confirmation state.
- Tasks: concrete execution items assigned to owners.
- Chat Tab or lightweight H5: optional cockpit and flight recorder, not the main workflow.

The MVP is not a generic chatbot, document generator, heavy project-management web app, or code agent. The first product loop is a Feishu-native project operations loop:

```text
Group chat
  -> Flight plan
  -> Human confirmation
  -> Feishu tool execution
  -> Project state
  -> Risk decision
  -> Delivery summary
```

## Feishu Integration

The project will integrate Feishu capabilities through the local `lark-cli` and Feishu OpenAPI.

Planned tool modules:

- `im`: receive instructions, send progress updates, ask for clarification.
- `card`: handle plan confirmation, risk decisions, and status updates.
- `doc`: create, read, and update structured documents.
- `announcement`: update the group-level project entry.
- `base`: maintain visible state boards for tasks, risks, artifacts, and confirmations.
- `task`: create and update concrete execution items.
- `drive` or `wiki`: archive deliverables and generate share links.
- `slides` or `whiteboard`: generate presentation or canvas outputs in later versions.
- `event`: subscribe to future Feishu events for IM-triggered automation.

## MVP Architecture

```text
Feishu IM
  -> Agent Planner
  -> Confirmation Cards
  -> Tool Orchestrator
  -> Feishu CLI / OpenAPI tools
  -> Docs / Group Announcement / Base / Tasks
  -> Risk decision / Delivery summary
  -> Lightweight cockpit and flight recorder
```

## Must-have Coverage

- Multi-device sync between mobile and desktop.
- Modular Agent scenes that can run independently or be composed.
- Natural language interaction by text or voice.
- Clear coverage of IM, Cards, Docs, Base, and Tasks.
- At least one combined multi-scene demonstration.

## Current Status

Initialized on 2026-04-25. The first runnable skeleton now supports a manual demo trigger, fixed project-init planning, Feishu tool dry-runs, and JSONL run recording.

## Development

Run the local checks:

```bash
npm run check
```

Run the dry-run manual demo:

```bash
npm run demo:manual
```

The demo reads `src/demo/fixtures/demo_input_project_init.txt` and writes an ignored local run log to `tmp/runs/latest-manual-run.jsonl`.

Next steps:

- Validate receiving and replying to Feishu IM events.
- Validate sending and updating message cards.
- Validate creating Docs and writing project brief content.
- Validate writing Base records and creating Tasks.
- Validate updating group announcements.
- Implement the first end-to-end Feishu-native proof of concept.

