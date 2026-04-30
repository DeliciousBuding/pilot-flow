# Project Brief

## Positioning

PilotFlow is a Feishu-native AI project operations officer.

It does not replace the human project owner. It helps a team turn group-chat discussion into confirmed plans, executable tasks, traceable state, risk decisions, and delivery summaries inside Feishu.

## Problem

Team work often starts from an IM conversation, but the important project signals are scattered across messages: goals, commitments, owners, deadlines, risks, and materials. Current workflows require repeated manual work and frequent context switching across chat, documents, task lists, spreadsheets, announcements, and presentation materials.

## Solution

PilotFlow uses an AI Agent as the primary workflow driver. The user gives natural language instructions from IM. The Agent understands intent, creates a flight plan, asks for missing information, requests human confirmation, invokes Feishu tools, writes project artifacts, tracks risk, and sends a delivery summary back to the group.

## Product Narrative

PilotFlow should be presented as a Feishu-native operating layer for lightweight project work:

```text
Discussion -> Flight Plan -> Confirmation -> Feishu Artifacts -> Trace -> Delivery Summary
```

The product is mature in its workflow design even while the implementation remains an MVP prototype. The public story should emphasize:

- the team works where it already works: Feishu IM, Cards, Docs, Base, and Tasks
- the Agent drives the project run, but humans keep approval over side effects
- every run leaves evidence: plan, artifacts, fallbacks, and trace
- pending platform edges are explicit, especially real card callback delivery and announcement fallback behavior

## Product Scope

| Layer | In scope for MVP | Out of scope for MVP |
| --- | --- | --- |
| Entry | Manual trigger and Feishu group workflow | Fully autonomous bot across all group history |
| Planning | Project-init flight plan with risks and deliverables | General-purpose enterprise planning suite |
| Execution | Doc, Base, Task, IM, cards, pinned entry, announcement fallback | Heavy standalone project-management dashboard |
| Control | Confirmation gate, preflight checks, duplicate-run guard | Silent bulk writes without human approval |
| Evidence | JSONL run log, Flight Recorder, generated review packs | Production observability platform |

## Design Principles

- Agent-first: the Agent plans and executes the core workflow.
- GUI-second: the GUI displays progress, confirmation points, and manual adjustment controls.
- Feishu-native: use Feishu CLI and OpenAPI for real IM, Cards, Docs, group announcements, Base, Tasks, and later Slides, Whiteboard, Drive, and Wiki operations.
- Multi-device by default: desktop and mobile clients share task state and content state.
- Modular scenes: each scene can be demoed independently and composed into larger flows.
- Human-confirmed side effects: writing to project assets, creating tasks, updating announcements, and publishing risky changes must pass through a confirmation gate.
- Traceable by default: every run records steps, tool calls, artifacts, confirmations, failures, and fallbacks.

## Scene Modules

- Scene A: IM intent entry.
- Scene B: task planning and decomposition.
- Scene C: confirmation cards and human approval.
- Scene D: Doc, Base, Task, and group announcement execution.
- Scene E: risk decision and flight recorder.
- Scene F: summary, delivery, archive, and optional presentation material.

## Demo Requirements

- Show real-time two-way sync between mobile and desktop.
- Trigger the main workflow from Feishu IM using natural language.
- Show Agent-driven planning and tool execution.
- Operate IM, Cards, Doc, Base or Task, and a project entry point in one demo.
- Include at least one multi-scene composed workflow.
- Keep Slides, Whiteboard, Calendar, Minutes, and Worker artifacts as later enhancements unless the core loop is already stable.

