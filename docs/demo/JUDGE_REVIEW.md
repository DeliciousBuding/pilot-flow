# Judge Review Pack

The Judge Review Pack is a reviewer-facing entry document that summarizes PilotFlow's product promise, demo path, evidence sources, validated capabilities, known boundaries, reproduction commands, and next actions.

It is designed for final review preparation: one document should tell a judge where to start, what is already proven, what still needs manual capture, and which claims should not be overextended.

## Generate

```bash
npm run test:one -- judge
npm run demo:judge -- --output tmp/demo-judge/JUDGE_REVIEW.md
```

For the current dated evidence set:

```bash
npm run demo:judge -- --output tmp/demo-judge/JUDGE_REVIEW_20260429.md
```

## Inputs

| Input | Purpose |
| --- | --- |
| `README.md` | Public product entrance and current state |
| `docs/ROADMAP.md` | Phase status and next actions |
| `docs/demo/DEMO_PLAYBOOK.md` | 6 to 8 minute demo story |
| `docs/demo/DEMO_QA.md` | Reviewer-facing product and technical answers |
| `tmp/demo-readiness/DEMO_READINESS_20260429.md` | Evidence/docs readiness gate |
| `tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md` | Sanitized permission and callback appendix |
| `tmp/demo-evidence/DEMO_EVIDENCE_20260429.md` | Happy-path live artifact evidence |
| `tmp/demo-failure/FAILURE_DEMO_20260429.md` | Failure-path appendix |

Generated files under `tmp/` remain local and ignored by Git unless they are scrubbed and intentionally promoted into public docs.

## Output Sections

| Section | What it answers |
| --- | --- |
| One-Line Product | What PilotFlow is |
| Reviewer Path | The recommended reading and demo order |
| Capability Snapshot | Which Feishu-native surfaces are validated, prototyped, or pending |
| Evidence Sources | Whether required source materials exist and contain expected anchors |
| Proof Points | The strongest claims that can be made in the current 2026-04-29 prototype |
| Known Boundaries | What must remain clearly described as pending or limited |
| Reproduction Commands | Commands for local validation and evidence regeneration |
| Next Actions | Manual recording, screenshot, and callback validation tasks |

## Review Boundary

The pack intentionally keeps three boundaries explicit:

- Card callback delivery is not claimed as end-to-end verified until a real `card.action.trigger` event is captured.
- Group announcement is treated as an attempted native upgrade that currently falls back to pinned entry because the test group returns a docx announcement API block.
- Recordings and screenshots are manual artifacts and should stay out of the repository unless scrubbed for public use.
