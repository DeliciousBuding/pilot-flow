# Product Reality Check

Last updated: 2026-04-30

This document is the hard boundary for PilotFlow product claims. It exists to stop the project from drifting into a polished-looking but unclear prototype. If another document sounds more optimistic than this page, this page wins and the other document should be corrected.

## Plain Answer

PilotFlow is useful, but it is not a high-completion product yet.

It is useful because it already proves a real Feishu-native project-launch loop: a confirmed run can create project documents, write structured state, create tasks, send cards/messages, pin an entry message, and record a replayable trace. That is a meaningful product spine.

It is not complete because the current product is still mostly operator-driven. The automatic IM-to-agent loop, real card button callback delivery, repeated team usage, persistent memory, worker approval cards, and deployment story are not done. The TypeScript runtime is architecturally healthier than the original JS prototype, but its `pilot:run` live path still needs the same real Feishu validation as the earlier JS path before the old path can be retired.

## Current Maturity

| Area | Reality | Product meaning |
| --- | --- | --- |
| Product direction | Solid | "AI project operations officer inside Feishu" is clearer than "generic agent" or "coding assistant". |
| Feishu API proof | Real but partial | IM, Card send, Doc, Base, Task, pinned entry, risk card, and final summary have been validated through live paths. |
| End-user flow | Prototype | A local operator command can run the loop; a normal user cannot yet just talk to a production bot and rely on it. |
| `pilot:run` TS path | Dry-run ready, live pending | Good product facade and safer defaults exist; real live validation is the next gate. |
| `pilot:gateway` TS path | Local bridge implemented | It can consume message/card events and resume stored confirmation runs locally, but real tenant validation is still pending. |
| Card callback | Not complete | Payload, parser, listener, and trigger bridge exist; real `card.action.trigger` delivery is still unproven. |
| Group announcement | Fallback only | Native announcement was attempted, but the current group returns a docx announcement API block; pinned entry is the reliable route. |
| LLM planning | Scaffolding | OpenAI-compatible client and Agent loop exist, but real planning success is not a product claim yet. |
| Hermes learning | Partially adopted | Tool registry, session queue, gateway, retry/error classification, hermetic tests, and traces are adopted; full self-evolving multi-agent operation is not. |
| Self-evolution | Review loop only | Run retrospective, eval, and preview worker can propose improvements; they do not safely modify behavior on their own. |
| Multi-agent | Contract seed only | Review Worker is preview-only; Doc/Data/Research/Script workers and approval cards remain future work. |
| Demo/submission readiness | Machine evidence strong, manual evidence pending | Review packs and safety audit exist; polished videos, screenshots, and callback configuration proof are still required. |

## What Works Now

- `npm run pilot:check`, `npm test`, `npm run pilot:audit`, and `npm run pilot:doctor` give useful local quality gates.
- `npm run pilot:run -- --dry-run` gives a product-facing dry-run of the TypeScript project-init path.
- The older JS live path has validated Feishu Doc, Base, Task, IM, cards, pinned entry, risk card, and JSONL trace behavior.
- `Flight Recorder` and generated review packs make runs inspectable instead of opaque.
- The repo structure is cleaner than the earlier sprint state: product CLI, review packs, runtime, gateway, tools, and docs are separated.

## What Is Not Done

- No reliable production-style Feishu group bot loop yet.
- No proven real card button callback execution path yet.
- No repeated team pilot with real users yet.
- No persistent project memory or context compression yet.
- No worker artifact approval card or useful non-code worker flow yet.
- No deployment, tenant administration, audit model, or product support story yet.
- No final capture package with all videos, screenshots, callback proof, and permission evidence yet.

## Hermes Lessons To Keep

PilotFlow should learn Hermes as runtime discipline, not as an excuse to add uncontrolled complexity.

| Hermes idea | Keep | Avoid |
| --- | --- | --- |
| Tool registry | One typed route for every tool, with confirmation and preflight | Random direct `lark-cli` calls from scattered modules |
| Agent loop | Small bounded loop with max iterations, typed tool calls, and clear failure events | Infinite autonomous agent behavior |
| Gateway/session | Per-chat queue, event dedupe, mention gate, normalized Feishu events | Treating each callback as an ad hoc script |
| Trace-first | Every run produces a useful log and replayable evidence | Demo-only behavior that cannot be inspected |
| Evaluation | Convert failures into fixtures and regression checks | More Markdown reports without product gates |
| Workers | Manager-worker contracts with preview artifacts and approval | Workers writing Feishu or code directly |
| Self-evolution | Proposal -> human approval -> test/template/workflow update | Hidden self-modification |

## Feishu-Native Priorities

The next real product work should stay inside Feishu:

1. Prove `pilot:run -- --live --confirm "确认执行"` against the real activity tenant targets.
2. Make real card button callback delivery work or document the exact Open Platform blocker with proof.
3. Turn the current local trigger into an allowlisted Feishu IM mention trigger.
4. Persist project state and memory in Feishu-native surfaces first: Base, Doc, Task, pinned entry, cards.
5. Add worker preview and approval cards only after the main Feishu loop is stable.

## Do Not Claim

- Do not claim PilotFlow is production-ready.
- Do not claim fully autonomous self-evolution.
- Do not claim mature multi-agent orchestration.
- Do not claim real card callback success until a real `card.action.trigger` event reaches the listener and starts the run.
- Do not claim native group announcement success for the current test group.
- Do not claim `pilot:run` live parity until a real live run creates the expected Feishu artifacts and trace.

## Current Verdict

PilotFlow is not a throwaway script and not useless. It has a real product spine and meaningful Feishu proof.

But the completion level is closer to a strong engineering prototype than a finished product. The correct next move is not to add more pack generators or broad agent ideas. The next move is to prove the TypeScript product path live, close the Feishu callback gap, and turn Hermes-style architecture into fewer, stricter runtime paths.
