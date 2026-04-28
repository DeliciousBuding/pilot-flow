# Development Guide

This guide explains how to run, validate, commit, and synchronize PilotFlow.

## Environment

Required:

- Node.js `>=20`
- Global `lark-cli >=1.0.20`
- Feishu activity tenant profile: `pilotflow-contest`

Check versions:

```powershell
node --version
npm --version
lark-cli --version
lark-cli profile list
lark-cli auth status --verify
```

## Feishu Profiles

| Profile | Purpose |
| --- | --- |
| `pilotflow-contest` | Activity tenant API development and demo |
| `cli_a935d47f8138dcd2` | Personal progress document sync |

For project API tests, use the active `pilotflow-contest` profile.

For personal progress sync, always specify:

```powershell
lark-cli docs +update --api-version v2 --profile cli_a935d47f8138dcd2 --doc "<progress-doc>" --as user --command overwrite --doc-format markdown --content "@PERSONAL_PROGRESS.md"
```

## Commands

Install dependencies:

```bash
npm install
```

Run syntax checks:

```bash
npm run check
```

Run the manual dry-run demo:

```bash
npm run demo:manual
```

Expected output:

- a `project_init` plan
- status `completed`
- run log path `tmp/runs/latest-manual-run.jsonl`

Preview Feishu target setup:

```bash
npm run setup:feishu -- --dry-run
```

The current `Project State` table template uses text fallback fields:

```text
type, title, owner, due_date, status, risk_level, source_run, source_message, url
```

Existing older demo tables with only `type/title/status/source_run` should be replaced by a fresh `setup:feishu` table before the next confirmed live run.

Show runtime options:

```bash
npm run demo:manual -- --help
```

Preview live mode without side effects:

```bash
npm run demo:manual -- --live
```

Expected output: `waiting_confirmation`. Live writes require the exact fallback confirmation phrase:

```bash
npm run demo:manual -- --live --confirm "确认起飞"
```

Preview the Feishu-native flight plan card without continuing into side effects:

```bash
npm run demo:manual -- --send-plan-card --no-auto-confirm
```

In live mode, `--send-plan-card` sends the flight plan card to the configured test group, then waits unless the confirmation phrase is also provided. Sending a live card is visible in Feishu, so use it only against the test group.

Preview the project entry-message fallback:

```bash
npm run demo:manual -- --send-entry-message
```

In live mode, `--send-entry-message` sends a stable project entrance after Doc/Base/Task artifacts are created. It is the current fallback when group announcement update is blocked or not yet wired.

Render a local Flight Recorder view from a JSONL run log:

```bash
npm run flight:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html
```

The generated HTML is local-only by default and lives under ignored `tmp/`.

Live project-init runs are guarded against accidental duplicates. If you intentionally need to repeat a visible Feishu write, pass an explicit key or bypass flag:

```bash
npm run demo:manual -- --live --confirm "确认起飞" --dedupe-key "pilotflow-demo-20260428"
npm run demo:manual -- --live --confirm "确认起飞" --allow-duplicate-run
```

Before running the confirmed live command, provide the target Feishu resources through flags or environment variables:

| Variable | Meaning |
| --- | --- |
| `PILOTFLOW_FEISHU_MODE` | `dry-run` or `live` |
| `PILOTFLOW_LARK_PROFILE` | lark-cli profile, default `pilotflow-contest` |
| `PILOTFLOW_SEND_PLAN_CARD` | `true` or `1` to send the flight plan card before confirmation |
| `PILOTFLOW_SEND_ENTRY_MESSAGE` | `true` or `1` to send the project entry-message fallback after artifacts are created |
| `PILOTFLOW_DEDUPE_KEY` | optional stable project key for live duplicate-run protection |
| `PILOTFLOW_ALLOW_DUPLICATE_RUN` | `true` or `1` to intentionally bypass duplicate-run protection |
| `PILOTFLOW_DISABLE_DUPLICATE_GUARD` | `true` or `1` to disable the local guard |
| `PILOTFLOW_DUPLICATE_GUARD_PATH` | local guard file path, default `tmp/run-guard/project-init-runs.json` |
| `PILOTFLOW_TEST_CHAT_ID` | group chat ID for final summary |
| `PILOTFLOW_BASE_TOKEN` | Base token for state rows |
| `PILOTFLOW_BASE_TABLE_ID` | Base table ID or name |
| `PILOTFLOW_TASKLIST_ID` | optional tasklist GUID or AppLink |
| `PILOTFLOW_CONFIRMATION_TEXT` | must equal `确认起飞` for live writes |

## Development Workflow

1. Read `AGENTS.md` and `PERSONAL_PROGRESS.md`.
2. Check repository state:

   ```powershell
   git status --short
   git branch -vv
   git remote -v
   ```

3. Make a small vertical change.
4. Run the smallest useful validation.
5. Update docs if behavior, architecture, or roadmap changed.
6. Commit.
7. Push to GitHub unless there is a clear blocker.
8. Update `PERSONAL_PROGRESS.md` for important project state.
9. Sync the progress doc with the main profile if needed.

## GitHub Sync Policy

Development should not sit only on the local machine. After each meaningful slice:

```powershell
git status --short
git add <files>
git commit -m "<clear message>"
git push origin main
```

If push fails, record the error and keep the local commit.

## Current Runtime Skeleton

Implemented:

- `src/config/runtime-config.js`
- `src/demo/flight-recorder-view.js`
- `src/demo/manual-trigger.js`
- `src/demo/setup-feishu-targets.js`
- `src/core/planner/project-init-planner.js`
- `src/core/orchestrator/run-orchestrator.js`
- `src/core/orchestrator/duplicate-run-guard.js`
- `src/core/orchestrator/entry-message-builder.js`
- `src/core/orchestrator/flight-plan-card.js`
- `src/core/orchestrator/project-state-builder.js`
- `src/core/orchestrator/summary-builder.js`
- `src/core/recorder/jsonl-recorder.js`
- `src/tools/feishu/artifact-normalizer.js`
- `src/tools/feishu/feishu-tool-executor.js`
- `src/adapters/lark-cli/command-runner.js`
- `src/schemas/*.schema.json`

Implemented in the current Phase 1 slice:

- `dry-run` / `live` runtime mode
- explicit `pilotflow-contest` profile support
- live-capable `doc.create`, `base.write`, `task.create`, and `im.send` command paths
- text confirmation fallback with `确认起飞`
- step status events in JSONL run logs
- live preflight that blocks partial side effects when Base or chat targets are missing
- Feishu artifact normalization for Doc, Base records, Task, IM message, and run log
- confirmed live run against the activity-tenant test group and Base
- live extraction of Doc URL, Base record IDs, Task URL, IM message ID, and run log artifact
- Feishu-native project flight plan card builder
- optional `--send-plan-card` flow that can post the card and wait for text confirmation
- optional `--send-entry-message` fallback for a stable project entrance when group announcement is not available
- duplicate live-run guard with stable dedupe key, local ignored guard file, and explicit bypass
- shared Project State template with owner/deadline/risk/source/url fallback fields
- Task description text fallback for owner when Feishu assignee mapping is not ready
- static Flight Recorder HTML view over JSONL run logs
- artifact-aware final IM summary with Doc URL, Base record IDs, Task URL, and next-step prompt
- demo snapshot fixtures for success and guarded failure paths

Next implementation targets:

- card callback confirmation
- group announcement update attempt

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| README/docs only | `git diff --check` |
| Planner logic | `npm run check`, `npm run demo:manual` |
| Orchestrator logic | `npm run check`, `npm run demo:manual`, inspect JSONL |
| Artifact normalization | `npm run test:artifacts`, `npm run demo:manual`, inspect final artifacts |
| Flight plan card | `npm run test:card`, `npm run demo:manual -- --send-plan-card --no-auto-confirm` |
| Duplicate-run guard | `npm run test:guard`, live missing-config check, inspect guard events in JSONL |
| Entry message fallback | `npm run test:entry`, `npm run demo:manual -- --send-entry-message`, inspect entry artifact |
| Flight Recorder view | `npm run test:flight`, `npm run flight:recorder -- --input <run.jsonl>`, inspect generated HTML |
| Project state rows | `npm run test:state`, `npm run setup:feishu -- --dry-run`, inspect Base fields |
| Summary text | `npm run test:summary`, `npm run demo:manual`, inspect final IM tool input |
| Feishu tool wrapper | dry-run command, then live test against `pilotflow-contest` |
| Live Feishu write | dry-run first, live command second, record returned IDs |

## Secret Handling

- Do not commit `.env`, local secrets, tokens, App Secrets, screenshots with tokens, or copied auth responses.
- Do not write secrets into `docs/`.
- Store local-only secrets under `C:\Users\Ding\.config\local-secrets` if needed.
- If a secret has appeared in chat or logs, rotate it before production or public demos.
