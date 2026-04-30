# Project Structure

PilotFlow keeps product runtime, CLI interfaces, and generated review tooling in separate layers. This prevents competition packaging scripts from becoming the product architecture.

## Layer Map

| Layer | Path | Owns | Should not own |
| --- | --- | --- | --- |
| Product core | `src/core/` | current JS planning, orchestration, confirmation, risk, events, run state | CLI profile details, generated review reports |
| Domain layer | `src/domain/` | TS deterministic planning, validation fallback, risk logic, risk card data, project brief, task description | Feishu command details, CLI parsing |
| Runtime helpers | `src/runtime/` | reusable execution primitives such as tool-step recording | product planning policy, CLI parsing |
| Tool registry | `src/tools/registry.ts`, `src/tools/idempotency.ts` | LLM-safe tool registry, live confirmation enforcement, tool idempotency | project planning policy, UI entrypoints |
| Feishu integration | `src/tools/feishu/`, `src/adapters/lark-cli/` | JS live executor, TS tool definitions, artifact normalization, command wrapping | product decisions, demo scripts |
| Runtime config and schemas | `src/config/`, `src/schemas/` | environment parsing, runtime options, JSON schemas | Feishu side effects |
| CLI interfaces | `src/interfaces/cli/` | manual trigger, listener wrapper, recorder view, setup, command facade, doctor | generated review pack logic |
| Review packs | `src/review-packs/` | readiness, submission, delivery, callback, permission, safety, and other generated Markdown materials | core product flow |
| Dev automation | `scripts/` | repo checks and grouped local test runners | product runtime behavior |
| Public docs | `docs/` | product, architecture, operator runbook, development, roadmap, demo guidance | private official document cache, raw secrets, raw logs |
| Local generated output | `tmp/` | run logs, generated reports, recorder HTML, local capture manifests | committed source |

## Command Policy

Use the small `pilot:*` facade for normal operation:

```bash
npm run pilot:check
npm run pilot:doctor
npm run pilot:demo
npm run pilot:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html
npm run pilot:package
npm run pilot:status
npm run pilot:audit
```

Use grouped validation commands for local maintenance:

```bash
npm test
npm run test:core
npm run test:interfaces
npm run test:review
```

Use `review:*` only when regenerating one specific review pack or debugging a pack in isolation. Use `npm run test:one -- <alias>` when isolating a specific module.

## Placement Rules

- New behavior for the current JS product path starts in `src/core/` and is surfaced through the orchestrator.
- New TypeScript rebuild behavior starts in `src/domain/`, `src/tools/`, `src/orchestrator/`, `src/gateway/`, or `src/agent/` according to `docs/rebuild/README.md`.
- New Feishu API behavior belongs in `src/tools/feishu/` or `src/adapters/lark-cli/`, then gets called by the orchestrator or registry.
- New human-operated runtime entry points belong in `src/interfaces/cli/`.
- New generated review or competition material belongs in `src/review-packs/`.
- New repo-wide maintenance automation belongs in `scripts/`; do not turn `package.json` into a long command registry.
- New public explanation belongs in `docs/`; raw official document caches, screenshots, recordings, secrets, and private logs stay outside the repository or under ignored local folders.

## Current Product Boundary

PilotFlow can run a real Feishu project-launch loop through a manual trigger and confirmation gate. It can create or send Doc, Base rows, Task, cards, pinned entry, final summary, and trace output.

The Hermes-style TypeScript kernel rebuild has completed Day 0 through Day 2: strict TS foundation, domain modules, ToolRegistry, tool idempotency, and 9 Feishu tool definitions are in place. The old JS runtime is still intentionally retained until the TS orchestrator and CLI path pass the same live and dry-run checks.

PilotFlow is not yet a fully unattended long-running Feishu bot. Card callback listener wiring exists locally, but real `card.action.trigger` delivery still needs Open Platform callback configuration verification. The stable fallback is text confirmation.
