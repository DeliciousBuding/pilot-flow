# Demo Readiness Pack

The Demo Readiness Pack is the pre-recording gate for PilotFlow. It checks whether the current evidence files and demo docs are present, then separates machine-ready evidence from manual capture work.

The purpose is to avoid an unclear demo state. A generated readiness report should answer three questions:

| Question | Readiness answer |
| --- | --- |
| Are the live-run evidence files ready? | Run log, Flight Recorder, Evidence Pack, Evaluation Pack, Capture Pack, Failure-Path Pack, Permission Appendix Pack, and Callback Verification Pack |
| Are the public demo docs ready? | Playbook, Q&A, fallback notes, evaluation guide, capture guide, failure demo guide, permission appendix guide, and callback verification guide |
| What still needs human capture? | Happy-path video, failure-path video or screenshots, permission screenshots, callback configuration proof |

## Generate The Pack

```bash
npm run test:readiness
npm run demo:readiness -- --output tmp/demo-readiness/DEMO_READINESS.md
```

The generated file is local-only by default and lives under ignored `tmp/`.

## Default Evidence Inputs

| Evidence | Default path |
| --- | --- |
| Live JSONL run log | `tmp/runs/announcement-upgrade-live-20260429-fixed.jsonl` |
| Flight Recorder HTML | `tmp/flight-recorder/announcement-upgrade-live-20260429-fixed.html` |
| Demo Evidence Pack | `tmp/demo-evidence/DEMO_EVIDENCE_20260429.md` |
| Demo Evaluation Pack | `tmp/demo-eval/DEMO_EVAL_20260429.md` |
| Demo Capture Pack | `tmp/demo-capture/CAPTURE_PACK_20260429.md` |
| Failure-Path Demo Pack | `tmp/demo-failure/FAILURE_DEMO_20260429.md` |
| Permission Appendix Pack | `tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md` |
| Callback Verification Pack | `tmp/demo-callback/CALLBACK_VERIFICATION_20260429.md` |

## Manual Capture Items

The readiness pack intentionally keeps these items as manual pending work:

| Item | Why manual |
| --- | --- |
| Happy-path walkthrough recording | Needs real Feishu UI and operator narration |
| Failure-path walkthrough recording or screenshots | Needs the reviewer-facing appendix to be shown cleanly |
| Open Platform permission screenshots | Must be captured from the console without exposing secrets |
| Callback configuration proof | Requires either configuration screenshots or a real `card.action.trigger` capture |

## Current Generated Evidence

Latest local output:

```text
tmp/demo-readiness/DEMO_READINESS_20260429.md
```

Expected status after current packs are generated:

```text
ready_for_manual_capture
```

This status means the evidence and docs are ready enough to record. It does not mean the recording or screenshots already exist.

After callback or permission evidence changes, regenerate in this order:

```bash
npm run demo:permissions -- --collect-version --collect-auth --collect-event-dry-run --output tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md
npm run demo:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION_20260429.md
npm run demo:readiness -- --output tmp/demo-readiness/DEMO_READINESS_20260429.md
npm run demo:judge -- --output tmp/demo-judge/JUDGE_REVIEW_20260429.md
```

## Scope Boundary

- This is a readiness gate, not a final submission package.
- It does not create or verify videos.
- It does not prove real card callback delivery.
- It does not claim group announcement works in the current test group.
- Raw screenshots and videos should stay outside the repo unless scrubbed and intentionally committed.
