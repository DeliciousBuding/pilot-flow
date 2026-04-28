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
lark-cli docs +update --profile cli_a935d47f8138dcd2 --doc "<progress-doc>" --as user --mode overwrite --markdown "@PERSONAL_PROGRESS.md"
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

- `src/demo/manual-trigger.js`
- `src/core/planner/project-init-planner.js`
- `src/core/orchestrator/run-orchestrator.js`
- `src/core/recorder/jsonl-recorder.js`
- `src/tools/feishu/feishu-tool-executor.js`
- `src/adapters/lark-cli/command-runner.js`
- `src/schemas/*.schema.json`

Next implementation targets:

- live Feishu execution mode
- profile-aware command runner
- real `doc.create`
- real `base.write`
- real `task.create`
- real `im.send`
- confirmation fallback
- step status updates

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| README/docs only | `git diff --check` |
| Planner logic | `npm run check`, `npm run demo:manual` |
| Orchestrator logic | `npm run check`, `npm run demo:manual`, inspect JSONL |
| Feishu tool wrapper | dry-run command, then live test against `pilotflow-contest` |
| Live Feishu write | dry-run first, live command second, record returned IDs |

## Secret Handling

- Do not commit `.env`, local secrets, tokens, App Secrets, screenshots with tokens, or copied auth responses.
- Do not write secrets into `docs/`.
- Store local-only secrets under `C:\Users\Ding\.config\local-secrets` if needed.
- If a secret has appeared in chat or logs, rotate it before production or public demos.
