# Development Guide

This guide explains how to run, validate, commit, and synchronize PilotFlow.

## Environment

Required:

- Node.js `>=20`
- Global `lark-cli >=1.0.21`
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
npm run test:callback
```

In live mode, `--send-plan-card` sends the flight plan card to the configured test group, then waits unless the confirmation phrase is also provided. Sending a live card is visible in Feishu, so use it only against the test group.

The flight plan card now includes four action values: `confirm_takeoff`, `edit_plan`, `doc_only`, and `cancel`. `src/core/orchestrator/card-callback-handler.js` parses Feishu-style callback payloads and returns the next PilotFlow decision. PilotFlow has a bounded listener bridge; the latest live listener connected to Feishu but received no `card.action.trigger` event in the validation window, so platform callback configuration remains the next verification target.

Listen for Feishu card callback events with a bounded local process:

```bash
npm run listen:cards -- --dry-run --max-events 1 --timeout 30s
```

`src/core/events/card-event-listener.js` wraps `lark-cli event +subscribe --event-types card.action.trigger`, parses callback payloads, and can trigger the orchestrator through `src/core/events/callback-run-trigger.js` when a flight-plan card is approved. The listener writes its own JSONL event log and supports `--max-events` / `--timeout` so test runs do not leave long-running processes behind. Code-level listener wiring is implemented; Open Platform card callback delivery still needs to be verified for the app.

Preview the project entry-message fallback:

```bash
npm run demo:manual -- --send-entry-message
npm run demo:manual -- --pin-entry-message
```

In live mode, `--send-entry-message` sends a stable project entrance after Doc/Base/Task artifacts are created. `--pin-entry-message` implies the entry message and then pins it with `im.pins.create`. This is the current Feishu-native stable-entry path while group announcement update is blocked or not yet wired.

Try the group announcement upgrade with fallback:

```bash
npm run demo:manual -- --update-announcement
```

`--update-announcement` attempts `PATCH /open-apis/im/v1/chats/:chat_id/announcement` through `lark-cli api` as bot identity, after sending the project entry message. In the current test group, the API returns `232097 Unable to operate docx type chat announcement`; PilotFlow records this as a failed announcement artifact and continues with the pinned entry message fallback.

Preview the risk decision card:

```bash
npm run demo:manual -- --send-risk-card
npm run test:risk
```

The risk detector runs in every project-init run. `--send-risk-card` adds an optional card send after Doc/Base/Task artifacts are created; without the flag, the run still records `risk.detected` and skips the risk-card step.

Preview Task assignee mapping:

```bash
npm run demo:manual -- --owner-open-id-map-json '{"Product Owner":"ou_xxx"}'
npm run demo:manual -- --auto-lookup-owner-contact
npm run test:contact
npm run test:assignee
```

The planner keeps human-readable owner labels. When `--owner-open-id-map-json` or `PILOTFLOW_OWNER_OPEN_ID_MAP_JSON` maps the first task owner label to a Feishu `open_id`, `task.create` receives `--assignee`. If no explicit mapping exists, `--auto-lookup-owner-contact` or `PILOTFLOW_AUTO_LOOKUP_OWNER_CONTACT=1` performs a read-only Contacts search and assigns only exact or unambiguous results. If lookup is blocked, ambiguous, or still dry-run only, PilotFlow keeps the text owner fallback.

Validate planner fallback behavior:

```bash
npm run test:plan
npm run test:orchestrator
```

Plan validation runs before confirmation, preflight, duplicate guard, or Feishu tools. Invalid planner output returns `needs_clarification`, records `plan.validation_failed`, and should contain no `tool.called` event.

Render a local Flight Recorder view from a JSONL run log:

```bash
npm run flight:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html
```

The generated HTML is local-only by default and lives under ignored `tmp/`.

Generate a Markdown demo evidence pack from the same JSONL run log:

```bash
npm run demo:evidence -- --input tmp/runs/latest-manual-run.jsonl --output tmp/demo-evidence/DEMO_EVIDENCE.md
```

The evidence pack summarizes the scenario, evidence checklist, Feishu artifacts, tool calls, fallback notes, and demo talking points. It is intended for presentation backup and review, not for committing raw private run logs.

Generate a local demo evaluation pack:

```bash
npm run test:eval
npm run demo:eval -- --output tmp/demo-eval/DEMO_EVAL.md
```

The eval pack covers missing owner/scope, vague deadline, invalid planner schema, duplicate live run protection, and optional tool failure fallback. It does not trigger live Feishu writes.

Generate a recording and screenshot capture pack:

```bash
npm run test:capture
npm run demo:capture -- --output tmp/demo-capture/CAPTURE_PACK.md
```

The capture pack checks the latest run log, Flight Recorder, Evidence Pack, and Eval Pack paths, then produces a concrete recording order and screenshot checklist. It is a capture plan, not proof that screenshots or videos already exist.

Generate a failure-path demo pack:

```bash
npm run test:failure
npm run demo:failure -- --output tmp/demo-failure/FAILURE_DEMO.md
```

The failure pack turns the current callback listener log, live announcement fallback run, and demo evaluation report into a reviewer-facing appendix. It covers callback timeout, announcement fallback, invalid planner output, duplicate-run protection, and unclear-requirement risks.

Generate a demo readiness pack:

```bash
npm run test:readiness
npm run demo:readiness -- --output tmp/demo-readiness/DEMO_READINESS.md
```

The readiness pack checks whether the current evidence files and demo docs are ready, then keeps happy-path recording, failure-path recording, permission screenshots, and callback configuration proof as explicit manual capture work.
It now includes the Permission Appendix Pack and Callback Verification Pack in the required machine-ready evidence set, so regenerate those first after any scope or callback listener attempt.

Generate a permission appendix pack:

```bash
npm run test:permissions
npm run demo:permissions -- --collect-version --collect-auth --collect-event-dry-run --output tmp/demo-permissions/PERMISSION_APPENDIX.md
```

The permission pack sanitizes local CLI evidence, checks scope groups, validates the bot event-subscribe dry-run for `card.action.trigger`, and lists screenshots still needed from Open Platform. It must not be used to claim real callback delivery until a callback event is captured.

Generate a callback verification pack:

```bash
npm run test:callback-pack
npm run demo:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION.md
```

The callback verification pack checks the latest flight-plan card send log, bounded listener log, and permission appendix. It reports whether PilotFlow is `callback_verified`, still `blocked_on_platform_callback_event`, or missing listener/card evidence.

Generate a judge review pack:

```bash
npm run test:judge
npm run demo:judge -- --output tmp/demo-judge/JUDGE_REVIEW.md
```

The judge pack connects README, Roadmap, Demo Playbook, Q&A, Readiness Pack, Permission Appendix, Callback Verification Pack, Evidence Pack, and Failure-Path Pack into a single reviewer-facing entry document. It is a local generated artifact and should keep pending callback delivery, announcement fallback, and manual recording work explicit.

Generate a demo submission pack:

```bash
npm run test:submission
npm run demo:submission -- --output tmp/demo-submission/SUBMISSION_PACK.md
```

The submission pack checks the current readiness, judge, callback, capture, permission, and failure packs, then optionally reads a local `--capture-manifest` JSON for videos and screenshots. Without a manifest it should report `machine_ready_manual_capture_pending`.
Use `--write-capture-template tmp/demo-submission/capture-manifest.template.json` to generate the fillable manifest shape before recording. When capture paths exist, the generated report records file size, SHA-256, and optional reviewer metadata without committing the raw media.

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
| `PILOTFLOW_PIN_ENTRY_MESSAGE` | `true` or `1` to send and pin the project entry message |
| `PILOTFLOW_UPDATE_ANNOUNCEMENT` | `true` or `1` to try group announcement update and keep pinned entry fallback on failure |
| `PILOTFLOW_SEND_RISK_CARD` | `true` or `1` to send the risk decision card after state rows are created |
| `PILOTFLOW_DEDUPE_KEY` | optional stable project key for live duplicate-run protection |
| `PILOTFLOW_ALLOW_DUPLICATE_RUN` | `true` or `1` to intentionally bypass duplicate-run protection |
| `PILOTFLOW_DISABLE_DUPLICATE_GUARD` | `true` or `1` to disable the local guard |
| `PILOTFLOW_DUPLICATE_GUARD_PATH` | local guard file path, default `tmp/run-guard/project-init-runs.json` |
| `PILOTFLOW_TEST_CHAT_ID` | group chat ID for final summary |
| `PILOTFLOW_BASE_TOKEN` | Base token for state rows |
| `PILOTFLOW_BASE_TABLE_ID` | Base table ID or name |
| `PILOTFLOW_TASKLIST_ID` | optional tasklist GUID or AppLink |
| `PILOTFLOW_OWNER_OPEN_ID_MAP_JSON` | JSON object mapping owner labels to Feishu `open_id` values |
| `PILOTFLOW_AUTO_LOOKUP_OWNER_CONTACT` | `true` or `1` to search Feishu Contacts when no explicit owner map matches |
| `PILOTFLOW_TASK_ASSIGNEE_OPEN_ID` | optional default assignee `open_id` for the first created Task |
| `PILOTFLOW_CONFIRMATION_TEXT` | must equal `确认起飞` for live writes |
| `PILOTFLOW_LISTENER_MAX_EVENTS` | optional max event count for `listen:cards` |
| `PILOTFLOW_LISTENER_TIMEOUT` | optional listener timeout such as `30s` or `2m` |

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
- `src/demo/demo-evidence.js`
- `src/demo/demo-eval.js`
- `src/demo/demo-capture-pack.js`
- `src/demo/demo-failure-pack.js`
- `src/demo/demo-readiness-pack.js`
- `src/demo/demo-permission-pack.js`
- `src/demo/demo-callback-verification-pack.js`
- `src/demo/demo-judge-pack.js`
- `src/demo/demo-submission-pack.js`
- `src/demo/card-listener.js`
- `src/demo/manual-trigger.js`
- `src/demo/setup-feishu-targets.js`
- `src/core/events/card-event-listener.js`
- `src/core/events/callback-run-trigger.js`
- `src/core/planner/project-init-planner.js`
- `src/core/planner/plan-validator.js`
- `src/core/orchestrator/run-orchestrator.js`
- `src/core/orchestrator/card-callback-handler.js`
- `src/core/orchestrator/contact-owner-resolver.js`
- `src/core/orchestrator/duplicate-run-guard.js`
- `src/core/orchestrator/entry-message-builder.js`
- `src/core/orchestrator/flight-plan-card.js`
- `src/core/orchestrator/project-state-builder.js`
- `src/core/orchestrator/risk-decision-card.js`
- `src/core/orchestrator/risk-detector.js`
- `src/core/orchestrator/summary-builder.js`
- `src/core/recorder/jsonl-recorder.js`
- `src/tools/feishu/artifact-normalizer.js`
- `src/tools/feishu/feishu-tool-executor.js`
- `src/adapters/lark-cli/command-runner.js`
- `src/schemas/*.schema.json`

Implemented to date:

- `dry-run` / `live` runtime mode
- explicit `pilotflow-contest` profile support
- plan schema validation fallback that stops before Feishu side effects and returns `needs_clarification`
- live-capable `doc.create`, `base.write`, `task.create`, and `im.send` command paths
- short Feishu write idempotency keys, avoiding message field validation failures caused by UUID-length run IDs
- text confirmation fallback with `确认起飞`
- step status events in JSONL run logs
- live preflight that blocks partial side effects when Base or chat targets are missing
- Feishu artifact normalization for Doc, Base records, Task, IM message, and run log
- confirmed live run against the activity-tenant test group and Base
- live extraction of Doc URL, Base record IDs, Task URL, IM message ID, and run log artifact
- Feishu-native project flight plan card builder
- optional `--send-plan-card` flow that can post the card and wait for text confirmation
- callback action protocol and parser for flight-plan actions: confirm, edit, doc-only, cancel
- bounded card event listener for `card.action.trigger`, with JSONL listener logs and `--max-events` / `--timeout`
- callback-trigger bridge that can start the orchestrator from an approved flight-plan card callback
- optional `--send-entry-message` fallback for a stable project entrance when group announcement is not available
- optional `--pin-entry-message` flow that sends the project entry and pins it through `im.pins.create`
- optional `--update-announcement` flow that attempts group announcement update and records API failure without aborting the main run
- duplicate live-run guard with stable dedupe key, local ignored guard file, and explicit bypass
- shared Project State template with owner/deadline/risk/source/url fallback fields
- Task description text fallback for owner when Feishu assignee mapping is not ready
- optional owner-label to open_id mapping for the first Feishu Task assignee
- optional read-only Feishu Contacts lookup for first-task owner assignment, with explicit-map priority and ambiguity fallback
- static Flight Recorder HTML view over JSONL run logs
- Markdown Demo Evidence Pack generator over JSONL run logs
- local Demo Evaluation Pack for missing owner, vague deadline, invalid plan, duplicate run, and optional tool failure
- local Demo Capture Pack for recording order, screenshot checklist, evidence anchors, and demo boundaries
- local Failure-Path Demo Pack for callback timeout, announcement fallback, invalid plan, duplicate run, and requirement-risk appendix
- local Demo Readiness Pack for evidence/docs gatekeeping before manual recording and screenshot capture
- local Permission Appendix Pack for sanitized CLI evidence, scope coverage, screenshot checklist, and callback configuration boundaries
- local Callback Verification Pack for card payload readiness, bounded listener evidence, and real callback event status
- local Judge Review Pack for reviewer-facing product story, evidence sources, boundaries, commands, and next actions
- local Demo Submission Pack for final machine-evidence and manual-capture status
- risk detection over planner risks, missing project facts, non-concrete deadlines, and owner text fallbacks
- optional `--send-risk-card` flow that sends or dry-runs a Feishu-native risk decision card
- callback action protocol and parser for risk decisions: assign owner, adjust deadline, accept risk, defer
- Base risk rows now use the same detected risk set shown in the run output and risk card
- artifact-aware final IM summary with Doc URL, Base record IDs, Task URL, and next-step prompt
- demo snapshot fixtures for success and guarded failure paths

Next implementation targets:

- Open Platform card callback delivery verification for `card.action.trigger`
- demo hardening and recording using the live rich Base, risk card, pinned entry, and announcement fallback path

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| README/docs only | `git diff --check` |
| Planner logic | `npm run check`, `npm run demo:manual` |
| Plan validation fallback | `npm run test:plan`, `npm run test:orchestrator`, inspect `plan.validation_failed` |
| Card callback action protocol | `npm run test:callback`, inspect `pilotflow_action` values in card JSONL |
| Card callback listener | `npm run test:listener`, `npm run test:trigger`, `npm run listen:cards -- --dry-run --max-events 1 --timeout 30s` |
| Orchestrator logic | `npm run check`, `npm run demo:manual`, inspect JSONL |
| Artifact normalization | `npm run test:artifacts`, `npm run demo:manual`, inspect final artifacts |
| Flight plan card | `npm run test:card`, `npm run demo:manual -- --send-plan-card --no-auto-confirm` |
| Duplicate-run guard | `npm run test:guard`, live missing-config check, inspect guard events in JSONL |
| Entry message fallback | `npm run test:entry`, `npm run demo:manual -- --send-entry-message`, inspect entry artifact |
| Pinned entry message | `npm run test:artifacts`, `npm run demo:manual -- --pin-entry-message`, inspect `pinned_message` artifact |
| Group announcement fallback | `npm run test:entry`, `npm run test:summary`, `npm run demo:manual -- --update-announcement`, inspect `announcement` artifact |
| Flight Recorder view | `npm run test:flight`, `npm run flight:recorder -- --input <run.jsonl>`, inspect generated HTML |
| Demo evidence pack | `npm run test:evidence`, `npm run demo:evidence -- --input <run.jsonl>`, inspect generated Markdown |
| Demo evaluation pack | `npm run test:eval`, `npm run demo:eval`, inspect generated Markdown |
| Demo capture pack | `npm run test:capture`, `npm run demo:capture`, inspect generated Markdown |
| Failure-path demo pack | `npm run test:failure`, `npm run demo:failure`, inspect generated Markdown |
| Demo readiness pack | `npm run test:readiness`, `npm run demo:readiness`, inspect generated Markdown |
| Permission appendix pack | `npm run test:permissions`, `npm run demo:permissions -- --collect-version --collect-auth --collect-event-dry-run`, inspect generated Markdown |
| Callback verification pack | `npm run test:callback-pack`, `npm run demo:callback-verification`, inspect generated Markdown |
| Judge review pack | `npm run test:judge`, `npm run demo:judge`, inspect generated Markdown |
| Demo submission pack | `npm run test:submission`, `npm run demo:submission`, inspect generated Markdown |
| Risk detection/card | `npm run test:risk`, `npm run demo:manual -- --send-risk-card`, inspect `risk.detected` and card artifact |
| Task assignee mapping | `npm run test:assignee`, `npm run test:config`, `npm run demo:manual -- --owner-open-id-map-json '{"Product Owner":"ou_xxx"}'`, inspect `--assignee` |
| Contact owner lookup | `npm run test:contact`, `npm run demo:manual -- --auto-lookup-owner-contact`, inspect `contact.search` and `owner.lookup_completed` |
| Project state rows | `npm run test:state`, `npm run setup:feishu -- --dry-run`, inspect Base fields |
| Summary text | `npm run test:summary`, `npm run demo:manual`, inspect final IM tool input |
| Feishu tool wrapper | dry-run command, then live test against `pilotflow-contest` |
| Live Feishu write | dry-run first, live command second, record returned IDs |

## Secret Handling

- Do not commit `.env`, local secrets, tokens, App Secrets, screenshots with tokens, or copied auth responses.
- Do not write secrets into `docs/`.
- Store local-only secrets under `C:\Users\Ding\.config\local-secrets` if needed.
- If a secret has appeared in chat or logs, rotate it before production or public demos.
