# Demo Safety Audit Pack

The Demo Safety Audit Pack is a pattern-based gate before publishing review material, screenshots, or recordings. It scans public docs, source files, and generated review packs for secret-like values and private identifiers.

Use it after generating the Delivery Index and before packaging material for judges.

## Generate

```bash
npm run test:safety-audit
npm run demo:safety-audit -- --output tmp/demo-safety/SAFETY_AUDIT.md
```

For the current dated evidence set:

```bash
npm run demo:safety-audit -- --output tmp/demo-safety/SAFETY_AUDIT_20260429.md
```

## What It Scans

| Area | Examples |
| --- | --- |
| Public surface | README, `package.json`, `docs/`, `src/` |
| Generated review material | Readiness, judge, submission, delivery index, permission, callback, capture, failure, evidence, eval packs |
| Trace view | Flight Recorder HTML |

## Findings

The audit flags patterns such as:

- OpenAI-compatible `sk-...` keys.
- Bearer tokens.
- Named secret values like `app_secret`, `access_token`, `refresh_token`, `verification_token`, `encrypt_key`, and `api_key`.
- Feishu `open_id` values that look personal rather than placeholders.

## Status Meanings

| Status | Meaning |
| --- | --- |
| `passed` | Required targets were scanned and no secret-like findings were detected |
| `review_findings_present` | Non-high findings need human review before publishing |
| `blocked_secret_findings` | High-severity secret-like findings must be removed before sharing |
| `missing_required_targets` | Required public docs or source paths are missing |

## Boundary

- This is not a formal security audit.
- It does not inspect raw videos or screenshots.
- A clean report does not replace human review of Open Platform screenshots and recordings.
- Keep raw media and unsanitized logs outside Git unless intentionally scrubbed and published.
