# Project Brief

## Problem

Team work often starts from an IM conversation, then moves through document drafting, discussion, revisions, and finally a formal presentation. The current workflow requires repeated manual work and frequent context switching across applications.

## Solution

PilotFlow uses an AI Agent as the primary workflow driver. The user gives natural language instructions from IM. The Agent understands intent, creates a plan, invokes Feishu tools, generates documents, turns the content into presentation material, and archives the final result.

## Design Principles

- Agent-first: the Agent plans and executes the core workflow.
- GUI-second: the GUI displays progress, confirmation points, and manual adjustment controls.
- Feishu-native: use Feishu CLI and OpenAPI for real IM, Doc, Slides, Whiteboard, Drive, and Wiki operations.
- Multi-device by default: desktop and mobile clients share task state and content state.
- Modular scenes: each scene can be demoed independently and composed into larger flows.

## Scene Modules

- Scene A: IM intent entry.
- Scene B: task planning and decomposition.
- Scene C: document or whiteboard generation and editing.
- Scene D: slides or canvas generation, rehearsal, and revision.
- Scene E: multi-device collaboration and consistency.
- Scene F: summary, delivery, and archive.

## Demo Requirements

- Show real-time two-way sync between mobile and desktop.
- Trigger the main workflow from Feishu IM using natural language.
- Show Agent-driven planning and tool execution.
- Operate IM, document, and slides or free canvas in one demo.
- Include at least one multi-scene composed workflow.

