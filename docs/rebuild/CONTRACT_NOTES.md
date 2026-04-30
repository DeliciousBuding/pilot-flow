# PilotFlow Rebuild Contract Notes

> Created: 2026-04-30
> Scope: Day 0 contract verification before the TypeScript Agent kernel rebuild.

These notes pin the external contracts that the rebuild may depend on. They are intentionally narrow: implementation should prefer verified local CLI contracts and defer uncertain webhook details behind optional transports.

## Local Runtime

| Contract | Observed value | Decision |
| --- | --- | --- |
| Node.js | `v24.14.0` | OK for `fetch`, `AbortSignal.timeout`, `node:test`, and strict TypeScript compilation. |
| npm | `11.9.0` | OK for local dev dependency installation. |
| `lark-cli` | `1.0.21` | Use global PATH `lark-cli`; do not call `D:\Code\Tools\Feishu` as runtime. |

## `lark-cli docs +create`

Verified command:

```powershell
lark-cli docs +create --api-version v2 --help
```

Observed v2 contract:

- `--content string` supports inline content, `@file`, and `-` for stdin.
- `--doc-format string` supports `xml|markdown`, default `xml`.
- `--as string` supports user/bot identity selection.
- `--parent-token` and `--parent-position` are available for placement.

Implementation decision:

- Live document bodies must use `--content @file` or `--content -`, not long argv strings.
- The first tool implementation may use Markdown with an H1 title; title extraction must be covered by a tool test or documented as a known CLI behavior before relying on it in live demos.

## `lark-cli event +subscribe`

Verified command:

```powershell
lark-cli event +subscribe --help
lark-cli event +subscribe --profile pilotflow-contest --as bot --event-types card.action.trigger --dry-run
```

Observed contract:

- Outputs WebSocket events as NDJSON by default.
- `--event-types` accepts comma-separated event types.
- `--filter` accepts a regex over event type.
- `--output-dir` can route events to files; stdout is default.
- `--route` can route regex-matched event streams to directories.
- `--force` is unsafe because multiple subscribers may receive split event subsets.
- Product event listening must run as bot identity. A user identity is not valid for `event +subscribe` in this project.

Implementation decision:

- `src/gateway/feishu/event-source.ts` is the product abstraction.
- `src/gateway/feishu/lark-cli-source.ts` is the first implementation.
- `lark-cli-source.ts` must default to `--as bot` and fail preflight if configured otherwise.
- `src/gateway/feishu/webhook-server.ts` stays optional until public callback delivery is proven.
- Do not use `--force` in normal product code.

## Feishu Event Security

Local official-doc cache confirms:

- Long connection mode wraps authentication into connection setup; pushed events are plaintext and do not require per-event decrypt/signature handling.
- Developer-server mode can use signature verification and Verification Token verification.
- Signature verification uses `X-Lark-Request-Timestamp`, `X-Lark-Request-Nonce`, `encrypt_key`, and raw body with SHA-256; it is not HMAC.
- If Encrypt Key encryption is enabled, event body must be decrypted before reading event details or Verification Token.

Implementation decision:

- First gateway milestone uses long connection through `lark-cli event +subscribe`.
- Treat webhook snippets in rebuild docs as pseudocode until real callback fixtures are captured.
- Webhook mode must fail closed when `PILOTFLOW_VERIFICATION_TOKEN` or `PILOTFLOW_ENCRYPT_KEY` is missing.
- Webhook tests may use explicit fixture bypasses, but production startup must not silently accept tokenless mode.
- Encrypted webhook payload handling is out of Day 1/Day 4 scope unless implemented from the official decrypt contract.
- Before webhook implementation is promoted beyond a stub, save raw fixtures for `card.action.trigger`, including `event_id`, action value path, operator/open_id path, token path, encryption setting, and replay/idempotency key.

## LLM Provider Contract

Implementation decision:

- Day 1 does not call a real model.
- Day 4 validates OpenAI-compatible chat-completions with mock `fetch`.
- Day 4 tests must include golden request/response fixtures for `tools`, assistant `tool_calls`, JSON-string arguments, invalid JSON arguments, and unknown tool names.
- Tool-calling must use provider-safe function names such as `doc_create`; registry maps them back to internal names such as `doc.create`.
- All live side effects remain behind `confirmationRequired` and confirmation gate; prompts are not a safety boundary.

## Migration Gate

- Keep the current JS prototype runnable until the TypeScript path passes `npx tsc --noEmit`, `npm test`, and the relevant `pilot:*` checks.
- Do not delete JS runtime files in Day 1.
- New TypeScript code may coexist under `src/**/*.ts` and `tests/**/*.ts` until the migration cutover.
- Before Day 5 deletion, the TypeScript path must preserve the public facades for `pilot:check`, `pilot:demo`, `pilot:doctor`, `pilot:listen`, and representative `review:*` smoke checks.
