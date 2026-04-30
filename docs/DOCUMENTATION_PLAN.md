# Documentation Plan

PilotFlow documentation should evolve with the product. The README is the front door; detailed decisions belong in `docs/`.

## Documentation Structure

| File | Owner intent | Update trigger |
| --- | --- | --- |
| `README.md` | Public project homepage | positioning, quickstart, status, demo changes |
| `docs/PROJECT_BRIEF.md` | Competition and product brief | product positioning changes |
| `docs/PRODUCT_SPEC.md` | Product scope and user value | feature boundary changes |
| `docs/ARCHITECTURE.md` | System design | state, tool, adapter, storage changes |
| `docs/OPERATOR_RUNBOOK.md` | Local operation and troubleshooting | command, profile, live run, evidence, fallback changes |
| `docs/DEVELOPMENT.md` | Contributor workflow | module boundary, validation policy, Git workflow changes |
| `docs/VISUAL_DESIGN.md` | UX and visual standards | card, cockpit, demo UI changes |
| `docs/ROADMAP.md` | Long-term plan | completed phases or priority shifts |
| `docs/AGENT_EVOLUTION.md` | Self-evolution, memory, evaluation, and worker orchestration | Agent runtime, worker, or learning-loop direction changes |
| `docs/adr/` | Architecture decisions | irreversible or debated decisions |
| `docs/api-validation/` | Feishu capability tests | new API validation tests |
| `docs/demo/` | Demo scripts and Q&A | demo flow changes |

## Documentation Quality Bar

Every major doc should answer:

1. What problem is this solving?
2. Who is the reader?
3. What should the reader do next?
4. What is already implemented?
5. What is planned but not done?
6. What are the safety or permission constraints?

## README Maintenance Rules

- Keep the first screen clear enough for a judge or GitHub visitor.
- Treat README as product packaging and project front door, not an internal development log.
- Do not include meta text like "the user asked for README style X" or "this README was inspired by template Y" in the product-facing README.
- Put README references and maintenance constraints in this file, operator workflow in `OPERATOR_RUNBOOK.md`, and contributor workflow in `DEVELOPMENT.md`.
- Do not overclaim production readiness.
- Keep diagrams in Mermaid so they are reviewable in Git.
- Link to deeper docs instead of making the README unbounded.
- Add screenshots only after the UI is real.
- Keep bilingual positioning near the top.
- Maintain a visible table of contents.
- Keep badges useful and truthful.
- Keep a Star History section once the repository is public.
- Use tables for feature status, surface mapping, docs index, and roadmap summaries.
- Update README in the same PR/commit as meaningful product or developer-experience changes.

## README Reference Set

PilotFlow README should keep borrowing structure from high-quality public READMEs, but these references are documentation-governance notes and should not dominate the product-facing README:

- `othneildrew/Best-README-Template` for badges, table of contents, getting started, roadmap, contributing, license, acknowledgments.
- `guodongxiaren/README` for Chinese GFM conventions, tables, badges, emoji, anchors, and Star History.
- Mature product repos such as Supabase, LangChain, and Next.js for positioning clarity and documentation navigation.

## Decision Records

Create `docs/adr/YYYY-MM-DD-title.md` when deciding things like:

- Feishu surface priority.
- State storage choice.
- Event subscription strategy.
- Card callback fallback.
- Worker sandbox boundary.
- Deployment model.

ADR template:

```markdown
# ADR: Title

## Status

Proposed / Accepted / Replaced

## Context

## Decision

## Consequences

## Alternatives Considered
```

## API Validation Records

The detailed API validation logs live outside the repo. Only distilled, non-secret, durable conclusions should be copied into this public repository.

## Public vs Local Docs

Public repo docs may include:

- product positioning
- architecture
- development instructions
- non-sensitive roadmap
- demo script without private tokens

Local workspace docs may include:

- official Feishu reference caches
- competition material review
- raw API validation logs with resource IDs
- private progress notes

Never commit:

- App Secrets
- access tokens
- auth response payloads
- personal secrets
- private screenshots with tokens
