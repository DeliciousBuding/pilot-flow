# Callback Verification Pack

The Callback Verification Pack turns the current card-callback status into a repeatable evidence report. It separates four signals that are easy to blur during a live demo:

- the flight-plan card was successfully sent;
- button payloads contain PilotFlow action values;
- the bounded listener connected;
- a real `card.action.trigger` event has or has not arrived.

## Generate

```bash
npm run test:one -- callback-pack
npm run demo:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION.md
```

For the current dated evidence set:

```bash
npm run demo:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION_20260429.md
```

## Inputs

| Input | Purpose |
| --- | --- |
| `tmp/runs/card-button-verify-send-20260429-fixed.jsonl` | Confirms the flight-plan card was sent and includes the expected button actions |
| `tmp/runs/card-button-listener-dryrun-20260429.jsonl` | Confirms the bounded listener connected and records whether callback events arrived |
| `tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md` | Confirms the event-subscribe dry-run and permission evidence boundary |

Generated reports stay under ignored `tmp/` by default. Do not publish raw listener logs because SDK stderr can contain transient connection URLs or tickets.

## Status Meanings

| Status | Meaning |
| --- | --- |
| `callback_verified` | Card payload, listener, and real callback event are all verified |
| `blocked_on_platform_callback_event` | Card payload and listener are ready, but no real callback event has arrived |
| `payload_ready_listener_pending` | Card payload is ready, but listener evidence is incomplete |
| `not_ready` | Card send or required action values are missing |

## Demo Boundary

Until this pack reports `callback_verified`, PilotFlow should keep saying:

- card payload and local callback handling are ready;
- the listener can connect;
- real button delivery remains pending on Open Platform callback configuration;
- text confirmation is the stable fallback for the demo.
