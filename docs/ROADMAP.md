# PilotFlow Roadmap

This roadmap tracks what still needs to happen after the current validated prototype. It is intentionally forward-looking: completed history belongs in progress records and generated evidence, not in the public roadmap.

## Product Direction

PilotFlow is a Feishu-native project operations officer. It should help a team move from group discussion to confirmed plan, project artifacts, structured state, visible risks, and delivery summary without forcing the team into a separate project-management system.

Core loop:

```mermaid
flowchart LR
    A["Feishu group intent"] --> B["Project execution plan"]
    B --> C["Human confirmation"]
    C --> D["Feishu tool execution"]
    D --> E["Project state"]
    E --> F["Risk decision"]
    F --> G["Delivery summary"]
    G --> H["Flight Recorder"]
```

## Current Status

| Area | Status | Boundary |
| --- | --- | --- |
| Manual project launch loop | Useful prototype | The older JS path has real Feishu proof; it is not a production bot. |
| Feishu-native surfaces | Partially live validated | IM, Cards, Doc, Base, Task, pinned entry, risk card, and summary are real; TS mention gateway exists locally, but announcement and callback are not complete. |
| Human confirmation | Stable fallback | Text confirmation works; real card button confirmation remains pending. |
| Traceability | Implemented | JSONL run log, Flight Recorder, and review packs make runs inspectable. |
| Review packaging | Implemented but auxiliary | Useful for competition evidence; it must not become the product center. |
| Product cleanup | Mostly implemented | Runtime entrypoints, review tooling, command facade, and public demo docs are separated. |
| TypeScript kernel rebuild | Dry-run ready, live pending | Day 0 through Day 7 are implemented; `pilot:run` live parity is not yet proven. |
| Hermes-style evolution | Review loop only | Retrospective, eval, and preview worker exist; memory, compression, approval cards, and real worker orchestration remain future work. |

For the authoritative maturity boundary, read [`PRODUCT_REALITY_CHECK.md`](PRODUCT_REALITY_CHECK.md).

## Phase 0: Foundation

- [x] Public repository and workspace created.
- [x] Official Feishu reference material collected outside the repo.
- [x] Product positioning narrowed to "AI project operations officer".
- [x] Activity tenant profile and core Feishu API capabilities validated.
- [x] Product README and documentation set established.

Exit condition: the project has a real Feishu development environment and a clear public product story.

## Phase 1: Real Feishu Loop

- [x] Add dry-run and live execution modes.
- [x] Add explicit profile and runtime configuration.
- [x] Validate plan schema before confirmation and side effects.
- [x] Add live preflight for required chat/Base targets.
- [x] Create Feishu Doc, Base records, Task, and IM summary from one confirmed run.
- [x] Normalize artifacts into run output and JSONL logs.
- [x] Add duplicate-run guard and short Feishu idempotency keys.
- [x] Add Flight Recorder static view.

Exit condition: a confirmed local command can create real Feishu artifacts and produce an inspectable run trace.

## Phase 2: Feishu-Native MVP

- [x] Execution-plan card with action protocol.
- [x] Risk detection and risk-decision card.
- [x] Project entry message and pinned-entry fallback.
- [x] Base owner/deadline/risk/source/url state fields.
- [x] Task assignee mapping through explicit `open_id` map.
- [x] Optional Contacts lookup for owner labels.
- [x] Bounded card listener and callback-trigger bridge.
- [x] Native group announcement attempt with pinned-entry fallback.
- [x] Local TS IM mention gateway bridge with pending-run continuation for approved card callbacks and same-chat text confirmation.
- [ ] Verify a real Feishu card button click reaches the listener and triggers the orchestrator.
- [ ] Capture a polished 6 to 8 minute happy-path walkthrough.
- [ ] Capture a focused failure-path walkthrough or screenshot set.
- [ ] Capture Open Platform permission and callback configuration screenshots.

Exit condition: PilotFlow can be demonstrated as a Feishu-native project operations assistant without relying on unstated assumptions.

## Phase 3: Productization Cleanup

- [x] Write the productization refactor plan.
- [x] Freeze public product claims in README, Product Spec, and Roadmap.
- [x] Consolidate `docs/demo/` into a compact demo kit.
- [x] Move product CLI entrypoints out of `src/demo/`.
- [x] Move review/evidence generators into `src/review-packs/`.
- [x] Replace public `demo:*` commands with `pilot:*` and `review:*` commands.
- [x] Split `run-orchestrator.js` into smaller runtime and domain modules.
- [x] Add `pilot:doctor` for local environment checks.
- [x] Re-run full validation and update workspace progress records.

Exit condition: product runtime, review packaging, and documentation are visibly separated.

## Phase 3B: Hermes-Style TypeScript Kernel Rebuild

- [x] Day 0: external contracts checked and recorded in `docs/rebuild/CONTRACT_NOTES.md`.
- [x] Day 1: strict TS foundation, shared utilities, safety layer, infrastructure, runtime config, and TS test bridge.
- [x] Day 2: TS domain modules, ToolRegistry, tool idempotency, and 9 Feishu tool definitions.
- [x] Day 3: split the orchestrator into confirmation gate, tool sequence, duplicate guard, cards, project state, entry, summary, and resolver modules.
- [x] Day 4: add Feishu gateway, session queue, Agent loop, and mock-tested LLM provider.
- [x] Day 5: bridge TS gateway/agent into CLI dry-run smoke paths and keep live migration guarded.
- [x] Day 6: bridge TS runtime into a live-guarded project-init path; old JS runtime removal remains gated by real live validation.
- [x] Day 7: add `pilot:run` product facade, retrospective eval runner, and preview-only Review Worker contract.

Exit condition: TypeScript path can run the same dry-run and live-guarded project launch loop as the current JS prototype, then pass real Feishu live validation before old runtime removal.

## Phase 4: Strong MVP Enhancements

- [ ] Mobile-friendly confirmation once callback delivery is verified.
- [ ] Desktop or Chat Tab cockpit for run status, artifacts, risks, and retry decisions.
- [x] Run Retrospective Pack generated from Flight Recorder traces.
- [x] Add initial Retrospective Eval runner for optional fallback, missing owner, TBD deadline, planner validation fallback, and tool failure trace.
- [ ] Promote retrospective eval cases into a broader fixture suite with real run snapshots.
- [ ] Add project memory schema for team preferences, recurring owners, project templates, and platform limits.
- [ ] Add bounded context compression for old tool outputs and long group sessions.
- [ ] Choose one additional Feishu-native surface:
  - Whiteboard for roadmap visualization.
  - Calendar for milestone scheduling.
- [x] Add first preview-only Review Worker contract.
- [ ] Worker artifact preview for document, table, script, or research outputs.
- [ ] Human approval cards before publishing worker artifacts into Feishu.

Exit condition: PilotFlow feels useful beyond the first project-launch flow while keeping human control intact.

## Phase 5: Product-Ready Direction

- [ ] Event-driven group trigger with allowlisted groups.
- [ ] Multi-project space management.
- [ ] Persistent project memory.
- [x] Typed `WorkerRequest` and `WorkerResult` contract for the first Review Worker.
- [ ] Manager-worker orchestration across multiple worker types.
- [ ] Feishu worker progress cards and artifact approval cards.
- [ ] Self-evolution loop: trace -> evaluation -> improvement proposal -> approved workflow/template/test update.
- [ ] Permission and audit model.
- [ ] Evaluation cases for planning, confirmation, retry, idempotency, and fallback.
- [ ] Deployment package.
- [ ] Public docs site or GitHub Pages.

## Immediate Next Actions

1. Configure real live targets, then validate `npm run pilot:run -- --live --confirm "确认执行"` against the activity tenant.
2. Compare the `pilot:run` live artifacts with the older JS live proof; do not remove the JS path until parity is proven.
3. Verify Open Platform card callback delivery with a real `card.action.trigger` event, or document the exact platform/config blocker with screenshots and logs.
4. Validate the new `pilot:gateway` path against the real tenant, then convert it into an allowlisted IM mention trigger after callback proof is understood.
5. Promote Retrospective Eval cases into snapshot-backed fixtures from real successful and degraded runs.
6. Capture happy-path and failure-path media outside Git, then rerun `pilot:status` until the package is no longer `needs_regeneration`.
7. Only after the main Feishu loop is stable, design the first artifact approval card for worker previews.
8. Run `pilot:doctor`, `pilot:check`, tests, review package generation, status, and safety audit before any public handoff.
