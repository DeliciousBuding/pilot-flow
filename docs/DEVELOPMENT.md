# Development Guide

This guide is for contributors changing PilotFlow code. Operational commands and troubleshooting live in [`OPERATOR_RUNBOOK.md`](OPERATOR_RUNBOOK.md).

## Setup

Required:

- Node.js `>=20`
- global `lark-cli >=1.0.21`
- Feishu activity tenant profile `pilotflow-contest`

Install dependencies:

```bash
npm install
```

Validate the workspace:

```bash
npm run pilot:check
npm test
```

## Repository Layers

| Layer | Path | Responsibility |
| --- | --- | --- |
| Product core | `src/core/` | current JS planner, orchestration, confirmation, risk, event handling, run state |
| Domain layer | `src/domain/` | TS deterministic planner, validation fallback, risk logic, risk card data, brief markdown, task description |
| Runtime helpers | `src/runtime/` | reusable execution primitives such as tool-step recording and optional fallback handling |
| Tool registry | `src/tools/registry.ts`, `src/tools/idempotency.ts` | LLM-safe registry, confirmation enforcement, preflight, recorder redaction, idempotency |
| Feishu integration | `src/tools/feishu/`, `src/adapters/lark-cli/` | JS live executor, TS Feishu tool definitions, artifact normalization, lark-cli wrapping |
| Runtime config and schemas | `src/config/`, `src/schemas/` | environment parsing and structured plan schemas |
| CLI interfaces | `src/interfaces/cli/` | direct runnable entry points and local doctor |
| Review packs | `src/review-packs/` | generated review, readiness, submission, delivery, callback, permission, and safety reports |
| Maintenance scripts | `scripts/` | repo checks and grouped local test runners |

Detailed placement rules are in [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md).

## Command Surface

Keep `package.json` readable. Long or repeatable automation belongs in `scripts/`.

| Command | Purpose |
| --- | --- |
| `npm run pilot:check` | Syntax-check JavaScript and run TypeScript `tsc --noEmit` |
| `npm test` | Run legacy JS tests and compiled TypeScript tests |
| `npm run test:legacy` | Run legacy JS test files |
| `npm run test:ts` | Compile TS and run compiled TypeScript tests |
| `npm run test:core` | Run core/config/event/tool tests |
| `npm run test:interfaces` | Run CLI interface tests |
| `npm run test:review` | Run evidence-pack tests |
| `npm run test:one -- <alias>` | Run one focused test alias |
| `npm run pilot:doctor` | Check local runtime requirements without printing secrets |
| `npm run pilot:demo` | Run the manual dry-run demo |
| `npm run pilot:package` | Regenerate the core machine-review package |
| `npm run pilot:status` | Regenerate delivery status |
| `npm run pilot:audit` | Run safety audit |

## Maintained Test Aliases

The source of truth for focused test aliases is [`scripts/run-tests.js`](../scripts/run-tests.js). Common aliases:

```bash
npm run test:one -- plan
npm run test:one -- brief
npm run test:one -- tool-steps
npm run test:one -- doctor
npm run test:one -- orchestrator
npm run test:one -- callback
npm run test:one -- listener
npm run test:one -- trigger
npm run test:one -- risk
npm run test:one -- evidence
npm run test:one -- submission
npm run test:one -- safety-audit
```

## Core Implementation Notes

Implemented runtime capabilities:

- `dry-run` and `live` runtime mode
- explicit `pilotflow-contest` profile support
- plan schema validation fallback before confirmation or tool calls
- live-capable `doc.create`, `base.write`, `task.create`, and `im.send`
- short Feishu write idempotency keys
- text confirmation fallback with `确认执行`
- live preflight for Base and chat targets
- Feishu artifact normalization for Doc, Base, Task, cards, pinned messages, announcements, IM, and local run logs
- duplicate live-run guard with explicit bypass
- shared Project State template with owner/deadline/risk/source/url fields
- optional owner label to `open_id` mapping and read-only Contacts lookup
- Flight Recorder HTML rendering over JSONL run logs
- generated review packs under `src/review-packs/`
- deterministic prototype planner provider boundary in `src/core/planner/project-init-planner.js`
- TypeScript domain modules in `src/domain/` for deterministic planning, plan validation fallback, risk detection, risk card data, brief markdown, and task description
- TypeScript `ToolRegistry` in `src/tools/registry.ts` with LLM-safe tool names, JSON-string argument parsing, live preflight, live confirmation enforcement, recorder redaction, and self-registering Feishu tools
- tool-step recording and optional fallback in `src/runtime/tool-step-runner.js`

Known product boundary:

- PilotFlow can run a real Feishu project-launch loop through manual trigger and confirmation gate.
- It is not yet a fully unattended long-running Feishu bot.
- Card callback listener wiring exists, but real `card.action.trigger` delivery still needs Open Platform configuration verification.
- Group announcement update is attempted but falls back to pinned entry in the current test group.

## Development Workflow

1. Read `D:\Code\LarkProject\AGENTS.md` and `D:\Code\LarkProject\PERSONAL_PROGRESS.md`.
2. Check repository state:

   ```powershell
   git status --short
   git branch -vv
   git remote -v
   ```

3. Make a small vertical change.
4. Run the smallest useful validation from the matrix below.
5. Update README/docs if behavior, architecture, command surface, or roadmap changed.
6. Commit.
7. Push to GitHub unless there is a clear blocker.
8. Update `PERSONAL_PROGRESS.md` for important project state.
9. Sync the progress doc when `PERSONAL_PROGRESS.md` changes.

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| README/docs only | `git diff --check` |
| Broad refactor | `npm run pilot:check`, `npm test`, `npm run pilot:status`, `npm run pilot:audit` |
| TypeScript domain or tools | `npm run ts:check`, `npm run test:ts`, `npm test` |
| CLI/environment surface | `npm run test:one -- doctor`, `npm run pilot:doctor` |
| Planner logic | `npm run pilot:check`, `npm run test:one -- plan`, `npm run pilot:demo` |
| Orchestrator logic | `npm run pilot:check`, `npm run test:one -- orchestrator`, `npm run pilot:demo` |
| Domain renderer | `npm run test:one -- brief tasktext` |
| Tool-step runner | `npm run test:one -- tool-steps`, `npm run test:one -- orchestrator` |
| Card callback protocol | `npm run test:one -- callback`, inspect `pilotflow_action` values |
| Card listener bridge | `npm run test:one -- listener`, `npm run test:one -- trigger`, `npm run pilot:listen -- --dry-run --max-events 1 --timeout 30s` |
| Artifact normalization | `npm run test:one -- artifacts`, `npm run pilot:demo`, inspect final artifacts |
| Execution plan card | `npm run test:one -- card`, `npm run pilot:demo -- --send-plan-card --no-auto-confirm` |
| Duplicate-run guard | `npm run test:one -- guard`, inspect guard events in JSONL |
| Entry or announcement fallback | `npm run test:one -- entry`, `npm run test:one -- summary`, run the matching dry-run flag |
| Flight Recorder view | `npm run test:one -- flight`, render a local HTML file |
| Evidence pack | `npm run test:one -- evidence`, regenerate the pack |
| Evaluation pack | `npm run test:one -- eval`, regenerate the pack |
| Capture pack | `npm run test:one -- capture`, regenerate the pack |
| Failure-path pack | `npm run test:one -- failure`, regenerate the pack |
| Readiness pack | `npm run test:one -- readiness`, regenerate the pack |
| Permission appendix | `npm run test:one -- permissions`, regenerate the pack |
| Callback verification pack | `npm run test:one -- callback-pack`, regenerate the pack |
| Judge review pack | `npm run test:one -- judge`, regenerate the pack |
| Submission pack | `npm run test:one -- submission`, regenerate the pack |
| Delivery index | `npm run test:one -- delivery-index`, `npm run pilot:status` |
| Safety audit pack | `npm run test:one -- safety-audit`, `npm run pilot:audit` |
| Risk detection/card | `npm run test:one -- risk`, `npm run pilot:demo -- --send-risk-card` |
| Task assignee mapping | `npm run test:one -- assignee`, `npm run test:one -- config` |
| Contact owner lookup | `npm run test:one -- contact`, `npm run pilot:demo -- --auto-lookup-owner-contact` |
| Project state rows | `npm run test:one -- state`, `npm run pilot:setup -- --dry-run` |
| Summary text | `npm run test:one -- summary`, `npm run pilot:demo` |
| Live Feishu write | dry-run first, live command second, record returned IDs |

## GitHub Sync Policy

After each meaningful slice:

```powershell
git status --short
git add <files>
git commit -m "<clear message>"
git push origin main
```

If push fails, record the error and keep the local commit.

## Secret Handling

- Do not commit `.env`, local secrets, tokens, App Secrets, screenshots with tokens, or copied auth responses.
- Do not write secrets into `docs/`.
- Store local-only secrets under `C:\Users\Ding\.config\local-secrets` if needed.
- If a secret has appeared in chat or logs, rotate it before production or public demos.
