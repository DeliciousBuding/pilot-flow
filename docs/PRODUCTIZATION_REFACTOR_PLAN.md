# PilotFlow Productization Refactor Plan

This document tracks the cleanup that turns PilotFlow from a competition sprint repository into a product-shaped repository. It uses checkboxes because it is meant to be executed and reviewed.

## Goal

PilotFlow should have a clear product spine:

```text
intent -> plan -> confirm -> execute through Feishu -> record -> report
```

Generated review material, capture checklists, and judge-facing reports are useful, but they must stay auxiliary. They should not define the runtime architecture or the first impression of the repository.

## Principles

- Product first: README and `docs/PRODUCT_SPEC.md` explain the product, user value, maturity, and trust model.
- Strong cleanup: merge useful content, then delete redundant tracked files.
- Small public surface: normal operation goes through `pilot:*`; generated review material goes through `review:*` or `pilot:*` facades.
- Honest maturity: separate validated behavior, local prototype behavior, pending platform proof, and later roadmap.
- Clear ownership: product runtime, Feishu integration, CLI interfaces, review packs, and docs live in separate layers.
- Every meaningful slice must pass validation before commit.

## Target Structure

This structure describes the cleaned JS prototype. The active Hermes-style TypeScript rebuild extends it with `src/tools/registry.ts`, `src/tools/idempotency.ts`, and future `src/orchestrator/`, `src/gateway/feishu/`, and `src/agent/` modules. Do not use this document to delete JS runtime files; use `docs/rebuild/14-delete-list.md` and only after the TS path passes.

```text
pilot-flow/
├─ src/
│  ├─ core/              # planner, orchestration, risk, events, run state
│  ├─ domain/            # product domain logic and renderers
│  ├─ runtime/           # reusable run helpers
│  ├─ tools/feishu/      # Feishu tool executor and artifact normalization
│  ├─ adapters/lark-cli/ # command runner boundary
│  ├─ interfaces/cli/    # human-run command entry points
│  └─ review-packs/      # optional reviewer material generators
├─ scripts/              # repo maintenance scripts
├─ docs/                 # public product and operator docs
└─ tmp/                  # ignored generated outputs
```

## Progress

### Phase 0: Freeze Product Claims

- [x] Review README, Product Spec, Project Brief, and Roadmap for duplicated status.
- [x] Make Roadmap forward-looking instead of a long history log.
- [x] Remove stale evidence defaults from public docs.
- [x] Keep product claims bounded to validated prototype behavior.

### Phase 1: Reduce Documentation Surface

- [x] Keep top-level product docs canonical.
- [x] Collapse `docs/demo/` into:
  - `docs/demo/README.md`
  - `docs/demo/DEMO_PLAYBOOK.md`
  - `docs/demo/CAPTURE_GUIDE.md`
  - `docs/demo/FAILURE_PATHS.md`
- [x] Merge useful Q&A, readiness, permission, callback, submission, delivery, and safety guidance into the compact demo kit or operator runbook.
- [x] Delete redundant tracked demo appendix docs.
- [x] Update README and docs index.

### Phase 2: Separate CLI Interfaces

- [x] Create `src/interfaces/cli/`.
- [x] Move manual trigger, card listener, Flight Recorder renderer, Feishu setup, fixtures, and command facade into CLI interfaces.
- [x] Update runtime config and callback trigger default fixture paths.
- [x] Update package scripts and docs.

### Phase 3: Isolate Review Packs

- [x] Create `src/review-packs/`.
- [x] Move review pack generators and tests out of the product runtime path.
- [x] Replace direct public `demo:*` review commands with `review:*`.
- [x] Rename grouped pack tests to `test:review`.
- [x] Update review-pack defaults to generic latest-output paths.

### Phase 4: Split The Orchestrator

- [x] Add focused pure tests for project brief and task description rendering.
- [x] Extract `src/domain/project-brief.js`.
- [x] Extract `src/domain/task-description.js`.
- [x] Extract `src/runtime/tool-step-runner.js` for tool call recording, optional fallback, and skipped steps.
- [x] Keep orchestrator behavior covered by existing regression tests.
- [ ] Consider a later split for confirmation gate, owner lookup step, and high-level project-init runner if `run-orchestrator.js` grows again.

### Phase 5: Productize Planner Boundary

- [x] Mark the existing parser as deterministic prototype planning.
- [x] Add `DeterministicProjectInitPlanner`.
- [x] Add a minimal provider factory for future LLM-backed planning.
- [x] Keep malformed planner output covered by validation fallback tests.
- [x] Update architecture docs.

### Phase 6: Clean Commands And Environment

- [x] Keep `.env` ignored.
- [x] Simplify `.env.example` to PilotFlow runtime variables only.
- [x] Add `pilot:doctor`.
- [x] Ensure `pilot:doctor` checks Node.js, `lark-cli`, `.env` ignore status, required env names, and optional auth status without printing secret values.
- [x] Keep advanced generated-material commands behind `review:*` and document them in the runbook.

### Phase 7: Final Product Review

- [x] Run core validation used for the Day 2 handoff:
  ```bash
  npm run pilot:check
  npm test
  npm run pilot:audit
  git diff --check
  ```
- [ ] Run full operator validation before public submission:
  ```bash
  npm run pilot:doctor
  npm run pilot:demo
  npm run pilot:package
  npm run pilot:status
  ```
- [x] Run stale-surface and secret scans for the Day 2 docs sync.
- [x] Update workspace `AGENTS.md` and `PERSONAL_PROGRESS.md`.
- [ ] Sync the Feishu personal progress document if `PERSONAL_PROGRESS.md` changes.
- [ ] Commit and push.

## Review Prompt

Use this after the cleanup branch is validated:

```text
Please review this repository as a productization and maintainability audit.

Focus on:
1. Whether product runtime, Feishu integration, CLI interfaces, and review tooling are cleanly separated.
2. Whether README/docs overclaim maturity or duplicate stale status.
3. Whether any tracked file should be merged or deleted.
4. Whether command surface and environment variables are understandable for a new operator.
5. Whether the orchestrator still has too many responsibilities.

Do not suggest new product features unless they reduce complexity. Prefer deletion, merging, and boundary clarification over adding abstractions.
```
