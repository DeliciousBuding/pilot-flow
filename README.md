# PilotFlow

PilotFlow is a Feishu-native AI collaboration pilot for the Feishu AI Campus Challenge.

It works like a project manager inside a Feishu group chat: it helps teams move from scattered discussion to executable tasks, traceable project state, and concrete deliverables.

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
  -> Lightweight cockpit and flight recorder
```

## Must-have Coverage

- Multi-device sync between mobile and desktop.
- Modular Agent scenes that can run independently or be composed.
- Natural language interaction by text or voice.
- Clear coverage of IM, Cards, Docs, Base, and Tasks.
- At least one combined multi-scene demonstration.

## Current Status

Initialized on 2026-04-25.

Next steps:

- Validate receiving and replying to Feishu IM events.
- Validate sending and updating message cards.
- Validate creating Docs and writing project brief content.
- Validate writing Base records and creating Tasks.
- Validate updating group announcements.
- Implement the first end-to-end Feishu-native proof of concept.

