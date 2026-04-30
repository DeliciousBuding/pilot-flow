# PilotFlow Productization Refactor Plan

> **For agentic workers:** execute this plan task-by-task. Use checkbox syntax for progress. Do not preserve obsolete tracked files just because they once helped a demo; merge useful content, then delete the stale file.

**Goal:** turn PilotFlow from a competition-driven prototype repo into a clean product-shaped codebase with a small product core, explicit Feishu integration boundary, separate review/evidence tooling, and honest public docs.

**Architecture:** keep the current validated Feishu loop, but separate product runtime from competition evidence generation. The product spine should be easy to explain as `intent -> plan -> confirm -> execute -> record -> report`; demo capture and judge-pack tooling should become auxiliary tooling, not the center of the repository.

**Tech Stack:** Node.js ESM, `lark-cli`, local JSONL run logs, Markdown docs, no heavy framework until the product cockpit needs one.

---

## Current Diagnosis

PilotFlow is not a lost cause. The core is still small enough to recover, tests pass, and the Feishu integration boundary is visible. The project is messy because competition hardening added many generated-material tools and documents faster than the product architecture was simplified.

| Area | Current symptom | Product risk |
| --- | --- | --- |
| Product core | `run-orchestrator.js` coordinates planning, validation, risk, task assignment, Feishu writes, entry messages, announcement fallback, pinning, and summary | one file becomes the hidden product brain |
| Demo tooling | `src/demo/packs/` has many large pack generators | repo looks like a judging-material generator instead of a product |
| Commands | public `pilot:*` facade exists, but many `demo:*` commands remain first-class in `package.json` | command surface feels noisy |
| Docs | README, product spec, roadmap, demo docs, and generated pack docs repeat status and boundaries | stale claims become likely |
| Dates and evidence | several defaults still point at `20260429` generated evidence paths | future runs can silently depend on old material |
| Naming | `src/demo/` contains CLI facade, listener, setup, recorder, manual trigger, and review packs | "demo" name hides product runtime pieces |

## Productization Principles

- Product first: README and `docs/PRODUCT_SPEC.md` explain the product, not the build history.
- One main path: the core product path is `IM/manual trigger -> plan -> confirmation -> Feishu artifacts -> trace -> summary`.
- Delete over archive: obsolete tracked files should be removed after useful content is merged.
- Auxiliary means auxiliary: review packs, capture checklists, and judge packs should not define the architecture.
- No fake maturity: keep "validated prototype", "local prototype", "pending", and "later" separate.
- Small files with clear ownership: split files when they mix decisions, orchestration, rendering, and side effects.
- Every cleanup slice must pass `npm run pilot:check`, `npm test`, `npm run pilot:audit`, and `git diff --check`.

## Target Repository Shape

```text
pilot-flow/
├─ src/
│  ├─ domain/                 # product concepts: plan, risk, state rows, summaries
│  ├─ runtime/                # run orchestration, confirmation gate, duplicate guard, recorder
│  ├─ integrations/feishu/    # lark-cli adapter, Feishu tool executor, artifact normalization
│  ├─ interfaces/cli/         # human-run command entry points
│  └─ review-packs/           # optional competition/reviewer material generators
├─ scripts/                   # repo maintenance scripts only
├─ docs/
│  ├─ README.md               # docs index
│  ├─ PRODUCT_SPEC.md         # product promise, maturity, trust model
│  ├─ ARCHITECTURE.md         # target architecture and boundaries
│  ├─ OPERATOR_RUNBOOK.md     # how to run and troubleshoot
│  ├─ DEVELOPMENT.md          # contribution and validation
│  ├─ ROADMAP.md              # living product roadmap
│  └─ demo/                   # only human-facing demo playbook and capture guide
└─ tmp/                       # ignored generated outputs
```

This target does not require one giant move. It should happen through small commits so behavior stays stable.

## Delete / Merge Policy

Use this rule for every tracked file:

| Decision | Criteria | Action |
| --- | --- | --- |
| Keep | product source, tested behavior, current public docs, or necessary runbook | keep and clarify ownership |
| Merge then delete | useful content exists but file repeats another doc | move content to the owning doc, then delete the old file |
| Move | file is valid but in the wrong architectural layer | move with import/script updates and tests |
| Delete | obsolete generated guide, date-specific stale evidence pointer, duplicate status page, or unused fixture | delete; do not create an archive copy in repo |
| Keep outside repo | raw official docs, screenshots, recordings, local run logs, private capture manifests | keep under workspace/materials or ignored `tmp/`, not tracked |

## Phase 0: Freeze Product Claims

**Goal:** stop the repo from claiming more than it can demonstrate.

- [ ] Review `README.md`, `docs/PRODUCT_SPEC.md`, `docs/PROJECT_BRIEF.md`, and `docs/ROADMAP.md` for duplicated product status.
- [ ] Make `docs/PRODUCT_SPEC.md` the source of truth for maturity, target users, surfaces, non-goals, and trust model.
- [ ] Make `docs/ROADMAP.md` the source of truth for unfinished work only; remove long historical implementation notes that are already reflected in docs or code.
- [ ] Search for stale relative time and stale dated evidence paths:
  ```bash
  rg -n "今天|昨天|刚刚|最近|today|yesterday|recently|20260429|2026-04-29" README.md docs src
  ```
- [ ] Replace hard-coded old evidence defaults with generic current defaults or explicit operator-provided paths.
- [ ] Validate:
  ```bash
  npm run pilot:check
  npm test
  npm run pilot:audit
  git diff --check
  ```
- [ ] Commit: `docs: freeze product claims`

## Phase 1: Reduce Documentation Surface

**Goal:** make docs feel like a product handbook, not a pile of generated appendix pages.

- [ ] Keep these top-level docs as canonical:
  - `docs/README.md`
  - `docs/PRODUCT_SPEC.md`
  - `docs/PROJECT_BRIEF.md`
  - `docs/ARCHITECTURE.md`
  - `docs/OPERATOR_RUNBOOK.md`
  - `docs/DEVELOPMENT.md`
  - `docs/PROJECT_STRUCTURE.md`
  - `docs/ROADMAP.md`
  - `docs/VISUAL_DESIGN.md`
  - `docs/DOCUMENTATION_PLAN.md`
- [ ] Collapse `docs/demo/` into fewer human-facing docs:
  - keep `docs/demo/README.md`
  - keep or merge into `docs/demo/DEMO_PLAYBOOK.md`
  - keep or merge into `docs/demo/CAPTURE_GUIDE.md`
  - keep or merge into `docs/demo/FAILURE_PATHS.md`
  - merge small single-purpose generator guides into `docs/demo/README.md` or `docs/OPERATOR_RUNBOOK.md`
- [ ] Candidate delete-after-merge files:
  - `docs/demo/EVALUATION.md`
  - `docs/demo/FAILURE_DEMO.md`
  - `docs/demo/READINESS.md`
  - `docs/demo/PERMISSIONS.md`
  - `docs/demo/CALLBACK_VERIFICATION.md`
  - `docs/demo/JUDGE_REVIEW.md`
  - `docs/demo/SUBMISSION.md`
  - `docs/demo/DELIVERY_INDEX.md`
  - `docs/demo/SAFETY_AUDIT.md`
- [ ] Update `docs/README.md` so deleted docs are no longer indexed.
- [ ] Update `README.md` docs table so it links only to product docs and the compact demo kit.
- [ ] Validate and commit: `docs: consolidate demo documentation`.

## Phase 2: Rename Runtime Layers Without Behavior Change

**Goal:** make paths match product architecture.

- [ ] Create `src/interfaces/cli/`.
- [ ] Move:
  - `src/demo/pilot-cli.js` -> `src/interfaces/cli/pilot-cli.js`
  - `src/demo/manual-trigger.js` -> `src/interfaces/cli/manual-trigger.js`
  - `src/demo/card-listener.js` -> `src/interfaces/cli/card-listener.js`
  - `src/demo/setup-feishu-targets.js` -> `src/interfaces/cli/setup-feishu-targets.js`
- [ ] Move `src/demo/flight-recorder-view.js` only if it remains a CLI renderer; otherwise split later into runtime parser plus CLI renderer.
- [ ] Keep `src/demo/fixtures/` temporarily, or move to `src/interfaces/cli/fixtures/` if only CLI uses them.
- [ ] Update `package.json` scripts to point to new paths.
- [ ] Update imports and tests.
- [ ] Update `docs/PROJECT_STRUCTURE.md`, `docs/DEVELOPMENT.md`, and `docs/OPERATOR_RUNBOOK.md`.
- [ ] Validate and commit: `refactor: move CLI interfaces out of demo`.

## Phase 3: Move Review Packs Out Of Product Runtime

**Goal:** make generated review material clearly optional.

- [ ] Create `src/review-packs/`.
- [ ] Move `src/demo/packs/*.js` and tests to `src/review-packs/`.
- [ ] Replace public `demo:*` scripts with either:
  - a single `review:*` facade, or
  - keep only private advanced scripts documented in the operator runbook.
- [ ] Keep product commands small:
  ```json
  {
    "pilot:check": "...",
    "pilot:demo": "...",
    "pilot:listen": "...",
    "pilot:recorder": "...",
    "pilot:package": "...",
    "pilot:status": "...",
    "pilot:audit": "..."
  }
  ```
- [ ] Update `scripts/run-tests.js` groups from `packs` to `review`.
- [ ] Validate and commit: `refactor: isolate review pack tooling`.

## Phase 4: Split The Orchestrator

**Goal:** remove the main code smell without changing product behavior.

Current file: `src/core/orchestrator/run-orchestrator.js`.

Target responsibilities:

| New file | Responsibility |
| --- | --- |
| `src/runtime/project-init-runner.js` | high-level project-init sequence |
| `src/runtime/confirmation-gate.js` | confirmation request/approval/waiting state |
| `src/runtime/tool-step-runner.js` | common `callTool`, optional tool fallback, skipped step recording |
| `src/runtime/owner-lookup-step.js` | contact lookup orchestration |
| `src/domain/project-brief.js` | project brief markdown rendering |
| `src/domain/task-description.js` | task description rendering |
| `src/domain/project-state.js` | state row building exports moved from orchestrator namespace |

Steps:

- [ ] Add focused tests around current orchestrator behavior before moving code.
- [ ] Extract pure rendering helpers first: brief markdown and task description.
- [ ] Extract tool step runner next; keep recorder event names identical.
- [ ] Extract confirmation gate; keep live waiting behavior identical.
- [ ] Move project-init sequence into `src/runtime/project-init-runner.js`.
- [ ] Keep a compatibility export from the old path for one commit if needed, then remove it after imports are updated.
- [ ] Validate and commit in at least two commits, not one giant commit.

## Phase 5: Productize The Planner Boundary

**Goal:** stop the project from looking fixture-only.

- [ ] Rename `project-init-planner.js` or split it into:
  - fixture parser for local demo
  - planner interface
  - deterministic fallback planner
- [ ] Add an explicit `PlannerProvider` interface for future LLM-backed planning.
- [ ] Keep current deterministic parser as `DeterministicProjectInitPlanner`.
- [ ] Add tests showing:
  - fixture text still works
  - malformed planner output enters clarification
  - no Feishu side effects happen before validation
- [ ] Update docs to say the current planner is deterministic prototype logic, with LLM provider planned.
- [ ] Validate and commit: `refactor: clarify planner provider boundary`.

## Phase 6: Clean Commands And Environment

**Goal:** reduce the first impression of command sprawl and secret risk.

- [ ] Ensure `.env` stays ignored and never appears in `git ls-files`.
- [ ] Keep `.env.example` minimal and current.
- [ ] Move advanced review-pack commands behind a single command facade if feasible.
- [ ] Remove or hide old direct script aliases from README; leave them in runbook only if still needed.
- [ ] Add one command that prints product status:
  ```bash
  npm run pilot:doctor
  ```
  It should check Node version, `lark-cli`, profile presence, required env names, and ignored output folders without printing secrets.
- [ ] Validate and commit: `chore: simplify command and env surface`.

## Phase 7: Final Product Review

**Goal:** make the project safe to hand to Claude, reviewers, or a new developer.

- [ ] Run full validation:
  ```bash
  npm run pilot:check
  npm test
  npm run pilot:package
  npm run pilot:audit
  git diff --check
  ```
- [ ] Run stale surface scan:
  ```bash
  rg -n "20260429|old flat|legacy|deprecated|TODO|FIXME|屎山|刚刚|最近|today|recently" README.md docs src package.json
  ```
- [ ] Run secret scan for known local sensitive strings before pushing.
- [ ] Update `AGENTS.md` and `PERSONAL_PROGRESS.md` with the final productized structure.
- [ ] Sync the Feishu personal progress document if `PERSONAL_PROGRESS.md` changes.
- [ ] Commit and push: `chore: complete productization cleanup`.

## Suggested Claude Review Prompt

Use this after Phase 1 or Phase 3, not before. Reviewing too early will mostly complain about known clutter.

```text
Please review this repository as a productization and maintainability audit.

Focus on:
1. Whether product runtime, Feishu integration, CLI interfaces, and review/evidence tooling are cleanly separated.
2. Whether README/docs overclaim maturity or duplicate stale status.
3. Whether any tracked file should be deleted instead of preserved.
4. Whether command surface and environment variables are understandable for a new operator.
5. Whether the orchestrator still has too many responsibilities.

Do not suggest new product features unless they reduce complexity. Prefer deletion, merging, and boundary clarification over adding abstractions.
```

