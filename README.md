# Agent Pilot IM Office Assistant

Agent-Pilot is a Feishu-first AI office assistant for the Feishu AI Campus Challenge. It turns IM conversations into structured documents, presentation materials, and deliverable archives through an Agent-driven workflow.

## Track

- Competition: Feishu AI Campus Challenge
- Track: AI Product Innovation
- Topic: IM-based office collaboration intelligent assistant
- Core idea: AI Agent is the pilot; GUI is the dashboard and co-pilot console.

## Product Goal

Build a multi-device collaborative office assistant that connects:

- IM: natural language task entry from group or direct chats.
- Docs or whiteboards: generated and iterated working documents.
- Slides or canvas: presentation material generation, rehearsal, and revision.
- Delivery: summary, archive, share link, or exported file.

## Feishu Integration

The project will integrate Feishu capabilities through the local `lark-cli` and Feishu OpenAPI.

Planned tool modules:

- `im`: receive instructions, send progress updates, ask for clarification.
- `doc`: create, read, and update structured documents.
- `slides` or `whiteboard`: generate presentation or canvas outputs.
- `drive` or `wiki`: archive deliverables and generate share links.
- `event`: subscribe to future Feishu events for IM-triggered automation.

## MVP Architecture

```text
Feishu IM
  -> Agent Planner
  -> Tool Orchestrator
  -> Feishu CLI / OpenAPI tools
  -> Synced desktop and mobile dashboard
  -> Docs / Slides / Whiteboard / Archive
```

## Must-have Coverage

- Multi-device sync between mobile and desktop.
- Modular Agent scenes that can run independently or be composed.
- Natural language interaction by text or voice.
- Clear coverage of IM, Docs, and Slides or free canvas.
- At least one combined multi-scene demonstration.

## Current Status

Initialized on 2026-04-25.

Next steps:

- Confirm public GitHub repository name.
- Create remote GitHub repository.
- Define MVP technical stack.
- Implement the first Feishu CLI proof of concept.
