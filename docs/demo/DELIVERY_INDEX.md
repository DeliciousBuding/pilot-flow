# Demo Delivery Index

The Demo Delivery Index is the local start page for review packaging. It does not replace the README, Judge Review Pack, or Submission Pack. It points to them in a stable order and checks whether the required public docs and generated machine-evidence files are present.

Use it when the demo material starts to spread across README, docs, generated reports, Flight Recorder HTML, and local run logs.

## Generate

```bash
npm run test:one -- delivery-index
npm run demo:delivery-index -- --output tmp/demo-delivery/DELIVERY_INDEX.md
```

For the current dated evidence set:

```bash
npm run demo:delivery-index -- --output tmp/demo-delivery/DELIVERY_INDEX_20260429.md
```

## What It Checks

| Area | Examples |
| --- | --- |
| Public docs | README, docs index, demo kit, playbook, Q&A, submission guide |
| Machine evidence | Readiness, judge review, submission, callback, permission, capture, failure, evidence, eval packs |
| Trace artifacts | Flight Recorder HTML and live JSONL run log |
| Manual status | Capture count from Demo Submission Pack |

## Status Meanings

| Status | Meaning |
| --- | --- |
| `needs_regeneration` | One or more required public docs or generated evidence files are missing or stale |
| `ready_for_manual_capture` | Public docs and machine evidence are present; manual videos/screenshots still need collection |
| `ready_for_submission_review` | Public docs, machine evidence, and required manual capture manifest entries are ready |

## Use In Review Prep

Recommended order:

1. Open the generated Delivery Index.
2. Open README for product positioning.
3. Open Judge Review Pack for the reviewer-facing story.
4. Open Demo Playbook for the spoken walkthrough.
5. Open Demo Submission Pack to verify manual capture status.
6. Open Permission Appendix and Callback Verification Pack for platform evidence and boundaries.
7. Open Flight Recorder HTML for the trace view.
8. Open Failure-Path Demo Pack for fallback explanations.

## Boundary

- The generated index points to local ignored `tmp/` evidence and should not be treated as a public artifact by itself.
- Raw recordings and screenshots should stay outside Git unless scrubbed and intentionally published.
- Callback delivery remains pending until a real `card.action.trigger` event is captured.
