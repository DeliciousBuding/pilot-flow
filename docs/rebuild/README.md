# PilotFlow Hermes-Style Agent Kernel Rebuild

> Created: 2026-04-30
> Status: Day 0 through Day 4 implemented; CLI migration and live gateway wiring remain next
> Intent: rebuild PilotFlow around an Agent kernel instead of continuing to pile features onto the current script-shaped prototype.

This folder is the rebuild blueprint for turning PilotFlow into a Feishu-native Agent product kernel.

The decision is now intentionally stronger than the previous cleanup plan: PilotFlow should borrow heavily from Hermes' engineering model where it fits, including an Agent loop, tool registry, error classifier, session manager, Feishu gateway, safety layer, and hermetic tests. The goal is not to copy Hermes' multi-platform framework. The goal is to extract the parts that make an Agent runtime durable.

## Decision Frame

| Area | Decision | Notes |
| --- | --- | --- |
| Rebuild style | Breaking TypeScript rebuild | The current prototype has no production users; one clean migration is acceptable. |
| Product kernel | Agent-first | Deterministic project-init remains available, but the target runtime is message -> session -> agent loop -> tools. |
| Hermes reuse | Pattern transfer | Borrow architecture patterns, not Python code or multi-platform complexity. |
| Feishu integration | First-class gateway | Feishu IM/card/webhook handling becomes a product entry surface, not demo glue. |
| LLM integration | Real minimal OpenAI-compatible loop | Add a usable provider, tool calling, retry, and error classification. Keep side effects behind confirmation. |
| TypeScript | Strict from day one | `strict: true`; local escape hatches must be explicit. |
| Public commands | May break once | Rename command internals once, then update README, docs, package scripts, AGENTS, and progress records in the same migration. |

## Execution Status

| Day | Status | Commit / evidence |
| --- | --- | --- |
| Day 0 | Done | `docs/rebuild/CONTRACT_NOTES.md` records lark-cli docs/event contracts, webhook boundary, and LLM mock gate |
| Day 1 | Done | `94f741e` added strict TS foundation, core types, shared utilities, safety, infrastructure, runtime config, and TS tests |
| Day 2 | Done | `4353182` added TS domain modules, ToolRegistry, tool idempotency, and 9 Feishu tool definitions |
| Day 3 | Done | TS `src/orchestrator/` split added with confirmation gate, deterministic tool sequence, atomic duplicate guard, cards/messages/state/resolver helpers, callback bridge, and 59 TS tests while keeping the JS prototype runnable |
| Day 4 | Done | TS `src/llm/`, `src/agent/`, and `src/gateway/feishu/` added: OpenAI-compatible client, error classifier, retry, Agent loop, session manager, lark-cli NDJSON event parsing, mention gate, dedupe, per-chat queue, card/message handlers, webhook signature/token helpers, and 29 additional TS tests. Review fixes include stable card action dedupe, Agent live batch preflight, webhook fail-closed token checks, session history caps, retry integration, and public env alias alignment. Real public webhook delivery and JS CLI migration remain deferred. |

## Hermes Evidence Snapshot

Local reference repository:

```text
D:\Code\Projects\hermes-agent
HEAD: 21e695fcb6e379018687db7445a578aba981f67d
Commit: 21e695fc fix: clean up defensive shims and finish CI stabilization from #17660 (#17801)
```

Verified local files used as design references:

| Hermes file | Local line count | PilotFlow use |
| --- | ---: | --- |
| `agent/error_classifier.py` | 876 | LLM/API error taxonomy and recovery hints |
| `tools/registry.py` | 465 | tool registration, availability checks, stable schema surface |
| `gateway/platforms/feishu.py` | 4126 | Feishu identity, mention gating, callback routing, dedupe, per-chat queue |
| `tests/conftest.py` | 495 | hermetic test environment and secret-env scrubbing |
| `agent/context_compressor.py` | 1228 | output summarization and future context management |
| `agent/credential_pool.py` | 1424 | later provider/key rotation, not part of the first rebuild |

These numbers are local snapshot facts, not permanent upstream claims.

## Document Index

| File | Purpose |
| --- | --- |
| [01-executive-summary.md](01-executive-summary.md) | Scope, non-goals, and why this is now an Agent-kernel rebuild |
| [02-current-state-audit.md](02-current-state-audit.md) | Current-state risks that justify the rebuild |
| [03-hermes-study.md](03-hermes-study.md) | Hermes patterns to borrow, defer, or reject |
| [04-target-architecture.md](04-target-architecture.md) | Target directory structure and dependency rules |
| [05-type-definitions.md](05-type-definitions.md) | Type contracts for plan, artifact, recorder, tools, session, Feishu, config |
| [06-module-specs.md](06-module-specs.md) | Module-level responsibilities and APIs |
| [07-tool-registry.md](07-tool-registry.md) | Registry design and Feishu tool command rules |
| [08-agent-loop.md](08-agent-loop.md) | Agent loop and session model |
| [09-llm-integration.md](09-llm-integration.md) | OpenAI-compatible LLM provider, retry, and error classification |
| [10-error-handling.md](10-error-handling.md) | Shared error hierarchy and recovery policy |
| [11-safety-layer.md](11-safety-layer.md) | Preflight, write guard, and redaction |
| [12-testing-strategy.md](12-testing-strategy.md) | Hermetic test strategy |
| [13-day-by-day-plan.md](13-day-by-day-plan.md) | Execution plan |
| [14-delete-list.md](14-delete-list.md) | Old code removal and rename plan |
| [15-feishu-integration.md](15-feishu-integration.md) | Feishu gateway and callback reference |

## Execution Rule

Do not implement from one file alone. Before coding, read:

1. `01-executive-summary.md`
2. `04-target-architecture.md`
3. `07-tool-registry.md`
4. `08-agent-loop.md`
5. `13-day-by-day-plan.md`
6. `14-delete-list.md`

Then execute in commits that keep `npm test`, `npm run pilot:check`, and the new TypeScript checks green.
