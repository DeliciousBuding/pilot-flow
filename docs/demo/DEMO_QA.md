# PilotFlow Demo Q&A

## Product Positioning

### What is PilotFlow?

PilotFlow is a Feishu-native AI project operations officer. It lives in group collaboration, extracts project intent, asks for confirmation, executes through Feishu tools, and records the full process.

### Is this just a chatbot?

No. A chatbot usually answers and stops. PilotFlow is designed to move work forward: it creates a plan, waits for approval, writes project state, creates artifacts, sends summaries, and keeps an audit trail.

### Is this only useful for programmers?

No. The current worker-artifact idea can include code or scripts later, but the core product is general project operations: documents, tasks, risks, status, summaries, and team coordination. A non-programmer should still get value because the main surface is Feishu.

### Why call it a project operations officer?

Because the product role is not just "assistant." It monitors project facts, asks for decisions, writes records, and keeps the group moving toward delivery.

## Feishu Integration

### Why build inside Feishu instead of a separate dashboard?

Because real team decisions already happen in Feishu. PilotFlow should reduce context switching by using IM, cards, Docs, Base, Tasks, pinned messages, and later Whiteboard or Calendar.

### What Feishu surfaces are validated?

Current validated surfaces include group IM, message cards, Docs, Base records, Tasks, pinned entry messages, and JSONL/Flight Recorder evidence. Group announcement was attempted but blocked by the current test group's docx announcement type.

### Why use a pinned entry message if group announcement exists?

The pinned entry is the stable fallback. In the current test group, the native announcement API returns `232097 Unable to operate docx type chat announcement`. PilotFlow records that failure and keeps the project discoverable through a pinned group entry.

### Why is card callback still listed as pending?

The code-level callback action protocol, parser, bounded listener, and trigger bridge are implemented. The live listener can connect, but the real button click event still depends on Open Platform callback configuration. Text confirmation remains the stable fallback until delivery is verified.

## Safety And Control

### How do humans stay in control?

PilotFlow uses a confirmation gate before visible side effects. The current stable path is text confirmation with `确认起飞`; card-button confirmation is the intended mobile-friendly path after callback delivery is verified.

### What happens when a tool fails?

The run records the failure and either stops safely or uses a documented fallback. For example, announcement failure becomes a failed optional artifact, while the pinned entry message keeps the demo usable.

### How does PilotFlow avoid duplicate writes?

Live runs use a duplicate-run guard and short Feishu idempotency keys. Intentional repeated writes require an explicit bypass or a new dedupe key.

### Where is the audit trail?

Each run writes a JSONL log. The Flight Recorder HTML and Evidence Pack Markdown convert that log into readable evidence: plan, steps, tool calls, artifacts, errors, and fallback decisions.

## Architecture

### Why not start with multi-agent collaboration?

The current product goal is a reliable Feishu-native loop. A single agent with state machine, confirmation gate, tool router, and flight recorder is easier to demonstrate, test, and explain. Multi-agent workers remain a later enhancement for document, table, script, or research artifacts.

### Is the GUI the main product?

No. The main product surface is Feishu. A future GUI or Chat Tab should work as a cockpit for status, review, and precision operations, not as the only place where work happens.

### How does PilotFlow decide what to create?

The planner converts project intent into a structured flight plan. The orchestrator validates the plan, detects risks, waits for confirmation, routes tool calls, and records the result.

## Roadmap

### What is next?

The immediate next steps are demo recording, permission/evidence capture, real card callback configuration verification, and polishing the demo fallback story.

### What comes after the standard MVP?

Likely Phase 4 options include mobile confirmation, a stronger cockpit view, Whiteboard or Calendar integration, and worker artifact preview for document/table/script automation.

### What should not be over-claimed now?

Do not claim production readiness, fully verified card callback delivery, native group announcement success in the current group, or general multi-agent automation. The current strength is a validated Feishu-native project launch loop with explicit known limits.
