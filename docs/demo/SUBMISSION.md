# Demo Submission Pack

The Demo Submission Pack is the final local gate before review packaging. It separates machine-generated evidence from manual recordings and screenshots, so the team can see whether PilotFlow is ready for submission review or still waiting on human-captured media.

When a capture manifest points to existing files, the pack records file size and SHA-256 hashes. This keeps media traceable without committing raw videos or screenshots.

## Generate

```bash
npm run test:submission
npm run demo:submission -- --output tmp/demo-submission/SUBMISSION_PACK.md
```

Generate a fillable capture manifest template:

```bash
npm run demo:submission -- --write-capture-template tmp/demo-submission/capture-manifest.template.json --output tmp/demo-submission/SUBMISSION_PACK.md
```

For the current dated evidence set:

```bash
npm run demo:submission -- --output tmp/demo-submission/SUBMISSION_PACK_20260429.md
```

## Machine Evidence

By default, the pack checks these local generated artifacts:

| Evidence | Default path |
| --- | --- |
| Demo Readiness Pack | `tmp/demo-readiness/DEMO_READINESS_20260429.md` |
| Judge Review Pack | `tmp/demo-judge/JUDGE_REVIEW_20260429.md` |
| Callback Verification Pack | `tmp/demo-callback/CALLBACK_VERIFICATION_20260429.md` |
| Demo Capture Pack | `tmp/demo-capture/CAPTURE_PACK_20260429.md` |
| Permission Appendix Pack | `tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md` |
| Failure-Path Demo Pack | `tmp/demo-failure/FAILURE_DEMO_20260429.md` |

## Manual Capture Manifest

After recording videos or collecting screenshots, fill a local JSON manifest outside Git or under ignored `tmp/`:

```json
{
  "captures": [
    {
      "label": "Happy-path walkthrough recording",
      "status": "ready",
      "path": "D:/Code/LarkProject/materials/captures/happy-path.mp4",
      "redacted": true
    }
  ]
}
```

Run:

```bash
npm run demo:submission -- --capture-manifest tmp/demo-submission/capture-manifest.json --output tmp/demo-submission/SUBMISSION_PACK.md
```

Rules:

- `status` must be `ready`.
- `path` must point to an existing local file.
- `redacted` must be `true` after reviewing secrets and private fields.
- The generated report records file size and SHA-256 so the reviewed capture version can be identified later.

Required capture labels:

| Capture | Required |
| --- | --- |
| Happy-path walkthrough recording | yes |
| Failure-path walkthrough recording or screenshots | yes |
| Open Platform permission screenshots | yes |
| Callback configuration proof | yes |

## Status Meanings

| Status | Meaning |
| --- | --- |
| `needs_regeneration` | One or more machine evidence files are missing or stale |
| `machine_ready_manual_capture_pending` | Machine evidence is ready; manual videos/screenshots are not fully collected |
| `ready_for_submission_review` | Machine evidence and required manual captures are ready for final human review |

## Safety Boundary

- Do not commit raw videos or screenshots unless they have been scrubbed and intentionally published.
- Do not include App Secret, access tokens, verification tokens, encrypt keys, request URLs, or private contact fields in screenshots.
- Keep callback delivery marked as pending unless the callback verification report captures a real `card.action.trigger` event.
