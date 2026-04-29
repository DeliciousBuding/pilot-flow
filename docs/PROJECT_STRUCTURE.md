# Project Structure

PilotFlow keeps product runtime, demo operation, and generated review tooling in separate layers. This prevents competition packaging scripts from becoming the product architecture.

## Layer Map

| Layer | Path | Owns | Should not own |
| --- | --- | --- | --- |
| Product core | `src/core/` | planning, orchestration, confirmation, risk, events, run state | CLI profile details, generated review reports |
| Feishu integration | `src/tools/feishu/`, `src/adapters/lark-cli/` | Feishu tool execution, artifact normalization, command wrapping | product decisions, demo scripts |
| Runtime config and schemas | `src/config/`, `src/schemas/` | environment parsing, runtime options, JSON schemas | Feishu side effects |
| Demo runtime | `src/demo/manual-trigger.js`, `src/demo/card-listener.js`, `src/demo/flight-recorder-view.js`, `src/demo/setup-feishu-targets.js`, `src/demo/pilot-cli.js` | runnable entry points, listener wrapper, recorder view, setup, command facade | generated review pack logic |
| Evidence packs | `src/demo/packs/` | readiness, submission, delivery, callback, permission, safety, and other generated Markdown materials | core product flow |
| Dev automation | `scripts/` | repo checks and grouped local test runners | product runtime behavior |
| Public docs | `docs/` | product, architecture, development, roadmap, demo guidance | private official document cache, raw secrets, raw logs |
| Local generated output | `tmp/` | run logs, generated reports, recorder HTML, local capture manifests | committed source |

## Command Policy

Use the small `pilot:*` facade for normal operation:

```bash
npm run pilot:check
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
npm run test:packs
```

Use `demo:*` only when regenerating one specific evidence pack or debugging a pack in isolation. Use fine-grained `test:*` commands only when isolating a specific module.

## Placement Rules

- New product behavior starts in `src/core/` and is surfaced through the orchestrator.
- New Feishu API behavior belongs in `src/tools/feishu/` or `src/adapters/lark-cli/`, then gets called by core.
- New demo operation entry points can live in `src/demo/` only if they are directly runnable by a human.
- New generated review or competition material belongs in `src/demo/packs/`.
- New repo-wide maintenance automation belongs in `scripts/`; do not turn `package.json` into a long command registry.
- New public explanation belongs in `docs/`; raw official document caches, screenshots, recordings, secrets, and private logs stay outside the repository or under ignored local folders.

## Current Product Boundary

PilotFlow can run a real Feishu project-launch loop through a manual trigger and confirmation gate. It can create or send Doc, Base rows, Task, cards, pinned entry, final summary, and trace output.

PilotFlow is not yet a fully unattended long-running Feishu bot. Card callback listener wiring exists locally, but real `card.action.trigger` delivery still needs Open Platform callback configuration verification. The stable fallback is text confirmation.
