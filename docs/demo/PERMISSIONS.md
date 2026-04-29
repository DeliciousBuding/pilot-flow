# Permission Appendix Pack

The Permission Appendix Pack prepares the evidence needed for permission screenshots and card-callback configuration review. It is designed for demo owners and reviewers who need to understand what is already proven by CLI output and what still requires manual screenshots.

It deliberately keeps secrets out of the report. App secrets, access tokens, verification tokens, encrypt keys, webhook URLs, private contact details, and raw auth responses should not be committed or shown in public materials.

## Generate The Pack

```bash
npm run test:permissions
npm run demo:permissions -- --collect-version --collect-auth --collect-event-dry-run --output tmp/demo-permissions/PERMISSION_APPENDIX.md
```

The generated report is local-only by default and lives under ignored `tmp/`.

## What It Checks

| Area | Evidence |
| --- | --- |
| lark-cli runtime | Sanitized CLI version |
| User authorization | Sanitized auth status, identity, token status, and scope count |
| Scope coverage | IM, Docs, Base, Task, Contacts, and event subscription scope groups |
| Event dry-run | Bot `event +subscribe` dry-run for `card.action.trigger` |
| Listener evidence | Existing bounded listener log and callback-delivery boundary |

## Screenshot Checklist

| Screenshot | Why it matters |
| --- | --- |
| App basic information | Shows the right app and tenant context |
| Permission scopes | Shows required API capabilities are configured |
| Bot in test group | Shows the app is present where the demo runs |
| Card callback or event configuration | Shows the current callback setup or missing configuration |
| Bounded listener result | Shows listener behavior without overstating callback delivery |

## Current Generated Evidence

Latest local output:

```text
tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md
```

Expected current boundary:

```text
event subscribe dry-run ready
bounded listener connected but no real callback event captured
```

## Scope Boundary

- This pack is an appendix generator, not a screenshot capture tool.
- A valid dry-run command proves command readiness, not end-to-end card callback delivery.
- Keep real callback delivery marked pending until a real `card.action.trigger` event is captured.
- Keep group announcement described as attempted with pinned-entry fallback for the current test group.
