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

Before running the confirmed live command, provide the target Feishu resources through flags or environment variables:

| Variable | Meaning |
| --- | --- |
| `PILOTFLOW_FEISHU_MODE` | `dry-run` or `live` |
| `PILOTFLOW_LARK_PROFILE` | lark-cli profile, default `pilotflow-contest` |
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
- `src/demo/manual-trigger.js`
- `src/core/planner/project-init-planner.js`
- `src/core/orchestrator/run-orchestrator.js`
- `src/core/recorder/jsonl-recorder.js`
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

Next implementation targets:

- `demo_success_run.json`
- `demo_partial_failure_run.json`
- richer final IM summary that includes artifact links and IDs
- card confirmation

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| README/docs only | `git diff --check` |
| Planner logic | `npm run check`, `npm run demo:manual` |
| Orchestrator logic | `npm run check`, `npm run demo:manual`, inspect JSONL |
| Artifact normalization | `npm run test:artifacts`, `npm run demo:manual`, inspect final artifacts |
| Feishu tool wrapper | dry-run command, then live test against `pilotflow-contest` |
| Live Feishu write | dry-run first, live command second, record returned IDs |

## Secret Handling

- Do not commit `.env`, local secrets, tokens, App Secrets, screenshots with tokens, or copied auth responses.
- Do not write secrets into `docs/`.
- Store local-only secrets under `C:\Users\Ding\.config\local-secrets` if needed.
- If a secret has appeared in chat or logs, rotate it before production or public demos.
