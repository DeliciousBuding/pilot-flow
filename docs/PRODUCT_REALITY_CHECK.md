# Product Reality Check

Last updated: 2026-05-01

This document provides an honest, boundary-setting assessment of PilotFlow's current capabilities. It serves as the single source of truth for product maturity claims. If another document sounds more optimistic than this page, this page wins and the other document should be corrected.

## Plain Answer

PilotFlow already proves a real Feishu-native project-launch loop: a confirmed run can create project documents, write structured state, create tasks, send cards/messages, pin an entry message, and record a replayable trace. That is a meaningful product spine.

The areas still in progress include: the automatic IM-to-agent loop, real card button callback delivery, repeated team usage, persistent memory, worker approval cards, and deployment. The TypeScript runtime is architecturally healthier than the original JS prototype, and the product-facing `pilot:run` path has now passed one real live Feishu run. That is enough to treat it as the preferred operator path, but not enough to retire the older JS path before repeated parity checks and callback validation.

## Current Maturity

| Area | Reality | Product meaning |
| --- | --- | --- |
| Product direction | Solid | "AI project operations officer inside Feishu" is clearer than "generic agent" or "coding assistant". |
| Feishu API proof | Real but partial | IM, Card send, Doc, Base, Task, pinned entry, risk card, and final summary have been validated through live paths. |
| End-user flow | Operator-driven prototype | A local operator command can run the loop; normal user flow through a production bot is in progress. |
| `pilot:run` TS path | Single live run validated | Product facade and safer defaults exist; 2026-05-01 live run created Doc/Base/Task/cards/pinned entry/summary/trace. Repeated parity and callback checks are still needed. |
| `pilot:gateway` TS path | Local bridge implemented | It can consume message/card events and resume stored confirmation runs locally through card callbacks or a same-chat `确认执行`. On 2026-05-01 a gateway probe message was sent, but no IM event reached the listener within 30 seconds. |
| Card callback | Not complete | Payload, parser, listener, trigger bridge, and self-sent probe card exist. On 2026-05-01 the probe card was sent, but no `card.action.trigger` reached the listener within 30 seconds. |
| Group announcement | Fallback only | Native announcement was attempted, but the current group returns a docx announcement API block; pinned entry is the reliable route. |
| LLM planning | Scaffolding | OpenAI-compatible client and Agent loop exist, but real planning success is not a product claim yet. |
| Hermes learning | Partially adopted | Tool registry, session queue, gateway, retry/error classification, hermetic tests, and traces are adopted; full self-evolving multi-agent operation is not. |
| Self-evolution | Review loop only | Run retrospective, eval, and preview worker can propose improvements; they do not safely modify behavior on their own. |
| Multi-agent | Contract seed only | Review Worker is preview-only; Doc/Data/Research/Script workers and approval cards remain future work. |
| Demo/submission readiness | Machine evidence strong, manual evidence pending | Review packs and safety audit exist; polished videos, screenshots, and callback configuration proof are still required. |

## What Works Now

- `npm run pilot:check`, `npm test`, `npm run pilot:audit`, and `npm run pilot:doctor` give useful local quality gates.
- `npm run pilot:run -- --dry-run` gives a product-facing dry-run of the TypeScript project-init path.
- `npm run pilot:run -- --live --confirm "确认执行"` passed a real Feishu write run on 2026-05-01 with run ID `run-f7a6ad4e-1bb8-4e7d-90ed-88a70621175b`, creating a Doc, Base records, a Task, execution/risk cards, pinned entry, final IM summary, and a 55-line JSONL trace at `tmp/runs/latest-live-run.jsonl`.
- The older JS live path has also validated Feishu Doc, Base, Task, IM, cards, pinned entry, risk card, and JSONL trace behavior.
- The TS gateway can now keep a waiting-confirmation run in local state and resume it from the same chat with plain-text `确认执行` even before real card callback delivery is proven.
- `Flight Recorder` and generated review packs make runs inspectable instead of opaque.
- The repo structure is cleaner than the earlier sprint state: product CLI, review packs, runtime, gateway, tools, and docs are separated.

## What Is Not Done

- No reliable production-style Feishu group bot loop yet; the self-sent IM probe currently times out without an event.
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

1. Repeat `pilot:run -- --live --confirm "确认执行"` against real activity tenant targets and compare artifacts with older JS proof before deleting the legacy path.
2. Make real card button callback delivery work with the callback proof probe card, or document the exact Open Platform blocker with proof.
3. Turn the current local trigger into an allowlisted Feishu IM mention trigger.
4. Persist project state and memory in Feishu-native surfaces first: Base, Doc, Task, pinned entry, cards.
5. Add worker preview and approval cards only after the main Feishu loop is stable.

## Do Not Claim

- Do not claim PilotFlow is production-ready.
- Do not claim fully autonomous self-evolution.
- Do not claim mature multi-agent orchestration.
- Do not claim real card callback success until a real `card.action.trigger` event reaches the listener and starts the run.
- Do not claim native group announcement success for the current test group.
- Do not claim `pilot:run` is production-ready or can replace the JS path permanently until repeated live runs and callback-driven continuation are validated.

## Current Verdict

PilotFlow has a real product spine and meaningful Feishu proof. The completion level is that of a strong engineering prototype with a clear path forward. The highest-priority next steps are repeating TypeScript product-path live checks, closing the Feishu callback gap, and turning Hermes-style architecture into fewer, stricter runtime paths, not adding more pack generators or broad agent ideas.
