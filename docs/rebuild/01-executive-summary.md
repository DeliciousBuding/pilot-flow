# 01 - Executive Summary

## Background

PilotFlow is a Feishu AI competition project for IM-based office collaboration. The current repository has already proven the main Feishu loop, but the runtime shape is still closer to a scriptable prototype than an Agent product kernel.

The next step is a Hermes-style rebuild:

```text
Feishu Gateway
  -> Session / Queue
  -> Agent Loop
  -> Tool Registry
  -> Feishu Tools
  -> Recorder / Safety / Error Classifier
```

This is intentionally more ambitious than a small cleanup. Agent-assisted development makes a deeper rebuild realistic, but the rebuild still needs hard boundaries so it does not become a generic clone of Hermes.

## Goals

1. Rebuild PilotFlow in strict TypeScript.
2. Introduce a real minimal Agent loop with OpenAI-compatible tool calling.
3. Move Feishu IM/card/webhook handling into a first-class gateway layer.
4. Replace scattered tool execution with a Hermes-style tool registry.
5. Add shared error classification, retry, timeout, redaction, and hermetic tests.
6. Preserve the proven deterministic project-init flow as a safe default path.
7. Keep all Feishu side effects behind code-level confirmation and preflight gates.

## Non-Goals

- Do not import or vendor Hermes Python code.
- Do not recreate Hermes' multi-platform gateway.
- Do not add a credential pool in the first rebuild.
- Do not add a skills marketplace or plugin system in the first rebuild.
- Do not weaken Feishu-native product direction into a generic chatbot framework.
- Do not preserve old public command or directory names if they fight the new architecture. Breaking migration is allowed once, but docs and commands must be updated in the same change.

## Scope Clarification

Earlier drafts said "do not implement LLM integration" while later asking for an LLM call to succeed. That contradiction is resolved:

| Layer | This rebuild |
| --- | --- |
| LLM client | Implement real OpenAI-compatible chat/tool-call client |
| LLM planner | Implement minimal Agent loop; keep deterministic project-init available |
| Provider pool | Defer |
| Multi-model failover | Defer after single-provider reliability |
| Live Feishu side effects | Allowed only after confirmation gate and preflight |

## Constraints

| Constraint | Rule |
| --- | --- |
| TypeScript | `strict: true` from day one |
| Runtime dependencies | Keep minimal; TypeScript can be a dev dependency |
| Feishu tooling | Continue using `lark-cli` for existing Feishu operations unless a gateway endpoint requires direct HTTP |
| Safety | No secret printing, no unconfirmed writes, no unbounded command execution |
| Validation | Every phase must keep JS/TS checks and tests green |

## Hermes Patterns To Borrow

| Hermes pattern | PilotFlow adaptation |
| --- | --- |
| Error classifier | API/LLM/lark-cli error taxonomy with retry/fallback hints |
| Tool registry | Stable schema and handler registry for deterministic and Agent-driven execution |
| Feishu gateway | Mention gating, card callback routing, dedupe, per-chat queue |
| Hermetic tests | Secret-env scrubbing, isolated tmp, deterministic TZ/LANG |
| Context compression | Initially tool-output summarization; full context compression later |

## Product Boundary

The product remains PilotFlow: a Feishu-native project operations officer. Hermes is a reference for runtime discipline, not the product identity.
