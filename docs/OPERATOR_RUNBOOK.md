# Operator Runbook

This runbook is for people operating the PilotFlow prototype: local validation, dry-run checks, live Feishu runs, evidence regeneration, and known fallback handling.

For product scope, read [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md). For module boundaries, read [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md). For implementation details, read [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Required Environment

| Requirement | Expected value |
| --- | --- |
| Node.js | `>=20` |
| Feishu CLI | global `lark-cli >=1.0.23` |
| Demo profile | `pilotflow-contest` |
| Progress sync profile | `cli_a935d47f8138dcd2` |

Check the local toolchain:

```powershell
node --version
npm --version
lark-cli --version
lark-cli profile list
lark-cli auth status --verify
```

## Main Commands

| Need | Command |
| --- | --- |
| Syntax check every JS file | `npm run pilot:check` |
| Run all grouped tests | `npm test` |
| Run TypeScript tests only | `npm run test:ts` |
| Run core tests | `npm run test:core` |
| Run evidence-pack tests | `npm run test:review` |
| Run retrospective eval tests | `npm run test:evals` |
| Run one focused test | `npm run test:one -- <alias>` |
| Check local environment | `npm run pilot:doctor` |
| Run product project loop | `npm run pilot:run -- --dry-run` |
| Run TS Feishu event gateway | `npm run pilot:gateway -- --dry-run --max-events 1` |
| Run legacy manual demo loop | `npm run pilot:demo` |
| Run TS gateway/Agent smoke path | `npm run pilot:agent-smoke` |
| Run TS project-init bridge | `npm run pilot:project-init-ts` |
| Render Flight Recorder | `npm run pilot:recorder -- --input <run.jsonl> --output <html>` |
| Rebuild review package | `npm run pilot:package` |
| Rebuild delivery status | `npm run pilot:status` |
| Run safety audit | `npm run pilot:audit` |

Focused test aliases are maintained in [`scripts/run-tests.js`](../scripts/run-tests.js). Examples:

```bash
npm run test:one -- plan
npm run test:one -- risk
npm run test:one -- doctor
npm run test:one -- submission
npm run test:one -- retrospective
npm run test:one -- retrospective-eval
```

`pilot:doctor` checks Node.js, `lark-cli`, `.env` Git ignore status, and required environment variable names. It reports missing names only; it does not print secret values. Add `-- --verify-auth` only when you want a sanitized profile token-status check:

```bash
npm run pilot:doctor
npm run pilot:doctor -- --verify-auth
```

## Dry-Run Operation

Run the product-facing local loop:

```bash
npm run pilot:run -- --dry-run
npm run pilot:run -- --dry-run --input "目标: 建立答辩项目空间 成员: 产品, 技术 交付物: Brief, Task 截止时间: 2026-05-03"
```

Expected result:

- a `project_init` plan
- status `completed`
- execution-plan card, project entry, pinned entry, and risk card enabled by default
- JSONL run log at `tmp/runs/latest-manual-run.jsonl` unless `--output` is supplied
- live mode is never inferred from the environment for this product entry; pass `--live` explicitly

Preview Feishu target setup:

```bash
npm run pilot:setup -- --dry-run
```

The current `Project State` table template is:

```text
type, title, owner, due_date, status, risk_level, source_run, source_message, url
```

## Live Feishu Operation

Live writes require explicit confirmation:

```bash
npm run pilot:run -- --live --confirm "确认执行"
```

Useful live flags:

| Flag | Purpose |
| --- | --- |
| `--send-plan-card` | Send the project execution-plan card before confirmation |
| `--send-entry-message` | Send a stable project entry after artifacts are created |
| `--pin-entry-message` | Pin the project entry message in the group |
| `--update-announcement` | Try native group announcement update and fall back to pinned entry on failure |
| `--send-risk-card` | Send the risk decision card after state rows are created |
| `--owner-open-id-map-json <json>` | Map planner owner labels to Feishu `open_id` |
| `--auto-lookup-owner-contact` | Search Feishu Contacts when no explicit owner map matches |
| `--allow-duplicate-run` | Bypass duplicate-run protection intentionally |

Show all runtime options:

```bash
npm run pilot:project-init-ts -- --help
```

## TypeScript Agent Smoke

The TypeScript Agent kernel has a dry-run smoke command. It parses a Feishu-style NDJSON message event, applies mention filtering, creates a session, runs the Agent loop with a mock LLM, and executes Feishu tools through `ToolRegistry` in dry-run mode. It does not call a real model and does not write to Feishu.

```bash
npm run pilot:agent-smoke
npm run pilot:agent-smoke -- --input "@PilotFlow 建立答辩项目空间"
npm run pilot:agent-smoke -- --json
```

## TypeScript Event Gateway

The TypeScript gateway can subscribe to `im.message.receive_v1` and `card.action.trigger`, apply mention filtering, open a waiting-confirmation project-init run from a Feishu mention, persist the pending run locally, and resume it after an approved card callback. This is a local event bridge, not yet a fully validated tenant bot loop.

```bash
npm run pilot:gateway -- --dry-run --max-events 1
npm run pilot:gateway -- --live --chat-id <chat> --base-token <base> --base-table-id <table>
```

Current boundary:

- In `dry-run`, a mention can complete the deterministic project-init loop and write a JSONL trace.
- In `live`, the first mention should create the waiting-confirmation run and optional execution-plan card, then store the pending run under `tmp/state/pending-gateway-runs.json`.
- An approved `card.action.trigger` can resume the stored run through the same TS orchestrator path.
- Real tenant validation is still required before this path replaces the older JS live proof.

## TypeScript Project Init Bridge

The TypeScript project-init bridge runs the deterministic project planner through the split TS orchestrator, `ToolRegistry`, Feishu tool definitions, duplicate guard, and JSONL recorder. It is the migration path toward the future TS runtime, but `pilot:demo` remains the stable live demo path until TS live validation is complete.

```bash
npm run pilot:project-init-ts
npm run pilot:project-init-ts -- --dry-run --send-entry-message --send-risk-card
npm run pilot:project-init-ts -- --live --confirm "确认执行" --send-entry-message --send-risk-card
```

Live mode is guarded: without `--confirm "确认执行"` it waits before tool calls; with confirmation but missing live targets it fails preflight before Feishu writes.

## Runtime Variables

| Variable | Meaning |
| --- | --- |
| `PILOTFLOW_FEISHU_MODE` | `dry-run` or `live` |
| `PILOTFLOW_LARK_PROFILE` | lark-cli profile, default `pilotflow-contest` |
| `PILOTFLOW_TEST_CHAT_ID` | group chat ID for cards and summary |
| `PILOTFLOW_BASE_TOKEN` | Base token for state rows |
| `PILOTFLOW_BASE_TABLE_ID` | Base table ID or name |
| `PILOTFLOW_TASKLIST_ID` | optional tasklist GUID or AppLink |
| `PILOTFLOW_CONFIRMATION_TEXT` | primary live confirmation text is `确认执行`; the previous phrase is accepted only for compatibility |
| `PILOTFLOW_SEND_PLAN_CARD` | `true` or `1` to send the execution-plan card |
| `PILOTFLOW_SEND_ENTRY_MESSAGE` | `true` or `1` to send a project entry message |
| `PILOTFLOW_PIN_ENTRY_MESSAGE` | `true` or `1` to pin the project entry |
| `PILOTFLOW_UPDATE_ANNOUNCEMENT` | `true` or `1` to try announcement update |
| `PILOTFLOW_SEND_RISK_CARD` | `true` or `1` to send a risk decision card |
| `PILOTFLOW_DEDUPE_KEY` | optional stable key for duplicate-run protection |
| `PILOTFLOW_ALLOW_DUPLICATE_RUN` | `true` or `1` to bypass duplicate-run protection |
| `PILOTFLOW_DISABLE_DUPLICATE_GUARD` | `true` or `1` to disable duplicate-run protection |
| `PILOTFLOW_DUPLICATE_GUARD_PATH` | local guard file path, default `tmp/run-guard/project-init-runs.json` |
| `PILOTFLOW_OWNER_OPEN_ID_MAP_JSON` | JSON object mapping owner labels to Feishu `open_id` |
| `PILOTFLOW_AUTO_LOOKUP_OWNER_CONTACT` | `true` or `1` to search Feishu Contacts |
| `PILOTFLOW_TASK_ASSIGNEE_OPEN_ID` | optional default assignee `open_id` for the first created Task |
| `PILOTFLOW_LISTENER_MAX_EVENTS` | max event count for `pilot:listen:cards` |
| `PILOTFLOW_LISTENER_TIMEOUT` | listener timeout such as `30s` or `2m` |
| `PILOTFLOW_BOT_OPEN_ID` | optional bot `open_id` for TS mention filtering |
| `PILOTFLOW_BOT_USER_ID` | optional bot `user_id` for TS mention filtering |
| `PILOTFLOW_BOT_NAME` | optional bot display name for TS mention filtering |
| `PILOTFLOW_LLM_BASE_URL` | optional OpenAI-compatible base URL for the TS Agent loop |
| `PILOTFLOW_LLM_API_KEY` | local-only LLM API key; never commit |
| `PILOTFLOW_LLM_MODEL` | model name for the TS Agent loop |
| `PILOTFLOW_LLM_FALLBACK_MODELS` | comma-separated future fallback model list |
| `PILOTFLOW_LLM_MAX_TOKENS` | optional max token budget, default `4096` |
| `PILOTFLOW_LLM_TEMPERATURE` | optional model temperature, default `0.1` |

Do not commit `.env`; it is intentionally ignored.

## Evidence And Review Package

Use the facade for the normal review flow:

```bash
npm run pilot:package
npm run pilot:status
npm run pilot:audit
```

To package a specific run log, pass a shared input. The facade forwards it to the retrospective and retrospective-eval steps:

```bash
npm run pilot:package -- --input tmp/runs/pilot-run-smoke.jsonl
```

Individual pack commands remain available for targeted regeneration:

```bash
npm run review:evidence -- --input tmp/runs/latest-manual-run.jsonl --output tmp/demo-evidence/DEMO_EVIDENCE.md
npm run review:eval -- --output tmp/demo-eval/DEMO_EVAL.md
npm run review:capture -- --output tmp/demo-capture/CAPTURE_PACK.md
npm run review:failure -- --output tmp/demo-failure/FAILURE_DEMO.md
npm run review:readiness -- --output tmp/demo-readiness/DEMO_READINESS.md
npm run review:permissions -- --collect-version --collect-auth --collect-event-dry-run --output tmp/demo-permissions/PERMISSION_APPENDIX.md
npm run review:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION.md
npm run review:judge -- --output tmp/demo-judge/JUDGE_REVIEW.md
npm run review:submission -- --output tmp/demo-submission/SUBMISSION_PACK.md
npm run review:retrospective -- --output tmp/run-retrospective/RUN_RETROSPECTIVE.md
npm run review:retrospective-eval -- --output tmp/retrospective-eval/RETROSPECTIVE_EVAL.md
npm run review:delivery-index -- --output tmp/demo-delivery/DELIVERY_INDEX.md
npm run review:safety-audit -- --output tmp/demo-safety/SAFETY_AUDIT.md
```

The retrospective pack reads a JSONL run log and produces quality signals, improvement proposals, and evaluation seeds. The retrospective eval runner checks those signals against the current fallback and clarification cases. By default both read `tmp/runs/latest-live-run.jsonl` when present, otherwise `tmp/runs/latest-manual-run.jsonl`; pass `--input <run.jsonl>` when packaging a specific run. They are review-only: they do not change code, prompts, docs, or Feishu artifacts.

Generated reports and run logs stay under ignored `tmp/`.

## TypeScript Kernel Rebuild Status

The TypeScript rebuild is active. Day 0 through Day 7 are complete: strict TS foundation, domain modules, ToolRegistry, tool idempotency, 9 Feishu tool definitions, split TS orchestrator, OpenAI-compatible LLM client, retry/error classifier, Agent loop, session manager, Feishu gateway boundary, dry-run CLI smoke bridge, live-guarded project-init bridge, `pilot:run`, Retrospective Eval, and Review Worker preview contract are implemented and covered by tests. `pilot:run` is now the preferred product-facing dry-run entry over the TS path. For official live Feishu demos, keep the JS-backed `pilot:demo` available until `pilot:run` passes the same real target checks.

## Known Platform Edges

| Edge | Current behavior |
| --- | --- |
| Card callback delivery | Code-level listener and trigger bridge exist; a live listener attempt connected but did not receive a real `card.action.trigger` event |
| Group announcement | Native announcement update was attempted; the current test group returns `232097 Unable to operate docx type chat announcement` |
| Manual media | Submission/readiness review separate machine evidence from videos, screenshots, and callback configuration proof |

Stable fallback paths:

- text confirmation with `确认执行`
- pinned project entry message
- generated Flight Recorder and review packs

## Progress Document Sync

The local progress file is `D:\Code\LarkProject\PERSONAL_PROGRESS.md`.

Always fetch before overwriting the Feishu document:

```powershell
lark-cli docs +fetch --api-version v2 --profile cli_a935d47f8138dcd2 --doc "<progress-doc>" --as user --format json --doc-format markdown --scope outline --max-depth 2
lark-cli docs +update --api-version v2 --profile cli_a935d47f8138dcd2 --doc "<progress-doc>" --as user --command overwrite --doc-format markdown --content "@PERSONAL_PROGRESS.md"
```

Run the update from `D:\Code\LarkProject` because `--content @PERSONAL_PROGRESS.md` is relative to the current directory.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Live mode stops before side effects | Confirm `PILOTFLOW_TEST_CHAT_ID`, `PILOTFLOW_BASE_TOKEN`, and `PILOTFLOW_BASE_TABLE_ID` |
| Duplicate live run blocked | Use a new `PILOTFLOW_DEDUPE_KEY` or intentionally pass `--allow-duplicate-run` |
| Card sends but button does not trigger | Regenerate Callback Verification Pack and inspect Open Platform callback configuration |
| Announcement update fails | Keep pinned entry fallback; do not claim native announcement success for this group |
| Contact lookup cannot assign owner | Use explicit `PILOTFLOW_OWNER_OPEN_ID_MAP_JSON` or keep text owner fallback |
| Generated report mentions removed commands | Search for outdated command aliases or old review-pack paths, then update source generators |

## Safety Checks

Before sharing docs, screenshots, recordings, or generated reports:

```bash
npm run pilot:audit
```

Also search local source and docs for known secret patterns when credentials have been handled during the session. Secrets belong outside the repository, preferably under `C:\Users\Ding\.config\local-secrets`.
