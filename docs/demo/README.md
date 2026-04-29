# PilotFlow Demo Kit

This folder keeps the public demo materials for PilotFlow. It is written for reviewers, demo owners, and future contributors who need to understand how the product is shown, what has already been validated, and how fallback paths should be explained.

## Demo Goal

Show that PilotFlow can work inside a real Feishu group as an AI project operations officer:

```text
Group intent -> Flight plan -> Human confirmation -> Doc/Base/Task/Card/Entry -> Summary -> Evidence trace
```

The demo should make three things obvious:

| What to prove | How to show it |
| --- | --- |
| PilotFlow is Feishu-native | Use the real group, cards, Doc, Base, Task, pinned entry, and summary message |
| PilotFlow is controllable | Show the confirmation gate and explain fallback confirmation |
| PilotFlow is traceable | Open the run log evidence pack or Flight Recorder view |

## Files

| File | Purpose |
| --- | --- |
| [`DEMO_PLAYBOOK.md`](DEMO_PLAYBOOK.md) | 6 to 8 minute product demo script and operator checklist |
| [`DEMO_QA.md`](DEMO_QA.md) | Reviewer-facing Q&A for product, Feishu integration, safety, and roadmap |
| [`FAILURE_PATHS.md`](FAILURE_PATHS.md) | Known platform limits, fallback behavior, and how to explain them |
| [`EVALUATION.md`](EVALUATION.md) | Runnable demo-risk evaluation cases and generated-report workflow |
| [`CAPTURE_GUIDE.md`](CAPTURE_GUIDE.md) | Recording and screenshot capture checklist |
| [`FAILURE_DEMO.md`](FAILURE_DEMO.md) | Failure-path demo pack workflow and reviewer-facing boundaries |
| [`READINESS.md`](READINESS.md) | Pre-recording readiness gate for evidence, docs, and manual capture work |
| [`PERMISSIONS.md`](PERMISSIONS.md) | Permission and callback appendix generation workflow |
| [`CALLBACK_VERIFICATION.md`](CALLBACK_VERIFICATION.md) | Callback readiness report for card payload, listener, and real event delivery |
| [`JUDGE_REVIEW.md`](JUDGE_REVIEW.md) | Reviewer-facing entry pack that connects product story, evidence sources, boundaries, and next actions |
| [`SUBMISSION.md`](SUBMISSION.md) | Final local gate for machine evidence and manual capture manifest status |
| [`DELIVERY_INDEX.md`](DELIVERY_INDEX.md) | Local review-packaging start page that links public docs, generated evidence, traces, and manual capture state |
| [`SAFETY_AUDIT.md`](SAFETY_AUDIT.md) | Pattern-based safety gate for public docs, generated review packs, and trace material |

Generated local evidence artifacts are not committed by default. Create them from a JSONL run log:

```bash
npm run pilot:package
npm run pilot:status
npm run pilot:audit
```

For individual pack regeneration, use the advanced commands below. These scripts live in `src/demo/packs/` and are separated from the product demo runtime on purpose:

```bash
npm run flight:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html
npm run demo:evidence -- --input tmp/runs/latest-manual-run.jsonl --output tmp/demo-evidence/DEMO_EVIDENCE.md
npm run demo:eval -- --output tmp/demo-eval/DEMO_EVAL.md
npm run demo:capture -- --output tmp/demo-capture/CAPTURE_PACK.md
npm run demo:failure -- --output tmp/demo-failure/FAILURE_DEMO.md
npm run demo:readiness -- --output tmp/demo-readiness/DEMO_READINESS.md
npm run demo:permissions -- --collect-version --collect-auth --collect-event-dry-run --output tmp/demo-permissions/PERMISSION_APPENDIX.md
npm run demo:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION.md
npm run demo:judge -- --output tmp/demo-judge/JUDGE_REVIEW.md
npm run demo:submission -- --output tmp/demo-submission/SUBMISSION_PACK.md
npm run demo:delivery-index -- --output tmp/demo-delivery/DELIVERY_INDEX.md
npm run demo:safety-audit -- --output tmp/demo-safety/SAFETY_AUDIT.md
```

## Recommended Screens

| Screen | Use in demo |
| --- | --- |
| Feishu test group | Primary product surface: cards, entry pin, final summary |
| Feishu Doc | Shows generated project brief |
| Feishu Base | Shows structured tasks, risks, artifacts, owner/deadline/source fields |
| Feishu Task | Shows concrete action item and optional assignee mapping |
| Flight Recorder HTML | Shows tool calls, artifacts, failures, and fallback decisions |
| Evidence Pack Markdown | Backup narrative if network or UI switching is unreliable |
| Demo Evaluation Pack | Shows missing-owner, vague-deadline, invalid-plan, duplicate-run, and tool-failure cases |
| Demo Capture Pack | Checklist for recording the happy path, failure evidence, and permission appendix |
| Failure-Path Demo Pack | Reviewer-facing appendix for callback timeout, announcement fallback, invalid plan, duplicate run, and requirement-risk cases |
| Demo Readiness Pack | Pre-recording gate that separates ready evidence from manual videos and screenshots |
| Permission Appendix Pack | Sanitized CLI evidence, required screenshots, and callback configuration boundaries |
| Callback Verification Pack | Separates card payload readiness, listener connection, and real callback delivery |
| Judge Review Pack | Single reviewer entry point for product claims, evidence sources, commands, and boundaries |
| Demo Submission Pack | Final local status for machine evidence and required manual media |
| Demo Delivery Index | Local operator start page for all public docs, generated evidence, trace artifacts, and manual capture state |
| Demo Safety Audit Pack | Pattern-based check for secret-like values before review packaging |

## Current Demo Status

| Area | Status |
| --- | --- |
| Live one-command Feishu run | Validated |
| Project flight plan card send | Validated after short idempotency-key fix |
| Risk decision card live send | Validated |
| Rich Base state rows | Validated |
| Project entry pinned in group | Validated |
| Native group announcement | Attempted; current test group returns docx announcement API block |
| Card callback delivery | Listener connects; real callback event still needs Open Platform configuration verification |
| Demo evaluation cases | 5 local cases pass through `npm run test:eval` |
| Demo capture pack | 7 required captures generated from current evidence paths |
| Failure-path demo pack | 5 evidence-ready scenarios generated through `npm run demo:failure` |
| Demo readiness pack | Evidence and docs gate generated through `npm run demo:readiness`; now checks 8 evidence files and 8 docs, manual recording still pending |
| Permission appendix pack | Sanitized permission/callback appendix generated through `npm run demo:permissions`; screenshots still pending |
| Callback verification pack | Payload and listener evidence generated through `npm run demo:callback-verification`; real callback event still pending |
| Judge review pack | Reviewer entry pack generated through `npm run demo:judge`; depends on current local evidence packs |
| Demo submission pack | Machine evidence can be checked through `npm run demo:submission`; manual media remains external to Git |
| Demo delivery index | Material navigation can be generated through `npm run demo:delivery-index`; current status should stay `ready_for_manual_capture` until manual media is collected |
| Demo safety audit pack | Secret-like value scanning can be generated through `npm run demo:safety-audit`; run again after adding screenshots or callback proof |
