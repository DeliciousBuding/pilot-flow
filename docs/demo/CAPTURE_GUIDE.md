# Demo Capture Guide

This guide turns the current PilotFlow evidence into a recording, screenshot, submission, and safety checklist. It is written for the person preparing review material, not for runtime development.

## Generate Local Review Material

Use the public facade first:

```bash
npm run pilot:package
npm run pilot:status
npm run pilot:audit
```

Generated files stay under ignored `tmp/`. Raw videos and screenshots should also stay outside Git unless they are scrubbed and intentionally promoted.

## Required Captures

| Capture | Surface | Purpose |
| --- | --- | --- |
| Happy-path walkthrough | Feishu group | Show execution-plan card, risk card, pinned entry, and final summary in the main collaboration space |
| Generated project brief | Feishu Doc | Show the project narrative artifact |
| Structured project state | Feishu Base | Show owner, due date, risk level, source run, source message, and URL fields |
| Native task artifact | Feishu Task | Show at least one action item became a Feishu-native task |
| Traceability view | Flight Recorder HTML | Show plan, artifacts, tool calls, timeline, and fallback records |
| Failure-path evidence | Generated review packs | Show invalid plan, duplicate-run guard, unclear requirement risk, callback boundary, and announcement fallback |
| Permission and callback proof | Open Platform console / sanitized CLI output | Show required scopes and callback configuration without exposing secrets |

## Capture Manifest

After collecting manual media, record local paths in a manifest under ignored `tmp/` or another private folder. The submission pack can report file size and SHA-256 without committing the raw files.

```json
{
  "captures": [
    {
      "label": "Happy-path walkthrough recording",
      "status": "ready",
      "path": "D:/Code/LarkProject/materials/captures/happy-path.mp4",
      "redacted": true,
      "reviewed_at": "2026-04-30T00:00:00.000Z",
      "reviewer": "team role"
    }
  ]
}
```

Required manifest labels:

| Capture | Required |
| --- | --- |
| Happy-path walkthrough recording | yes |
| Failure-path walkthrough recording or screenshots | yes |
| Open Platform permission screenshots | yes |
| Callback configuration proof | yes |

## Recording Rules

- Start from the Feishu group, not from terminal output.
- Hide app secrets, access tokens, private contact fields, verification tokens, encrypt keys, request URLs, and anything in `.env`.
- Do not claim card-button callback delivery is verified until a real `card.action.trigger` event is captured.
- Do not claim group announcement works in the current group; explain pinned entry as the stable fallback.
- Run the safety audit after adding new local evidence and before sharing material.

## Review Status Meanings

| Status | Meaning |
| --- | --- |
| `needs_regeneration` | One or more machine evidence files are missing or stale |
| `machine_ready_manual_capture_pending` | Machine evidence is ready; manual videos/screenshots are not fully collected |
| `ready_for_manual_capture` | Docs and generated evidence are ready enough to record |
| `ready_for_submission_review` | Machine evidence and required manual captures are ready for final human review |

## Safety Boundary

The safety audit is a pattern-based gate, not a formal security audit. A clean report does not replace human review of screenshots, recordings, or Open Platform console pages.
