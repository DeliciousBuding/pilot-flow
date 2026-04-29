# Demo Evaluation

PilotFlow keeps a small demo evaluation pack for the risk and fallback cases that are most likely to appear in review. The goal is not broad automated QA yet; the goal is to prove that the demo path has visible behavior for common project-operation risks.

## Run The Evaluation

```bash
npm run test:one -- eval
npm run demo:eval -- --output tmp/demo-eval/DEMO_EVAL.md
```

The generated report is local-only by default and lives under ignored `tmp/`.

## Covered Cases

| Case | Expected behavior |
| --- | --- |
| Missing owner and deliverables | Detect high-risk missing ownership/scope and recommend owner or deadline confirmation |
| Vague deadline and text owner fallback | Keep the run usable while surfacing deadline precision and owner mapping risks |
| Invalid planner schema | Return a clarification plan before confirmation, duplicate guard, or Feishu tool side effects |
| Duplicate live run | Block repeated visible Feishu writes unless the operator explicitly bypasses the guard |
| Optional tool failure fallback | Record the optional tool failure and continue through the stable project-entry path |

## Current Generated Evidence

Latest local output:

```text
tmp/demo-eval/DEMO_EVAL_20260429.md
```

The current generated pack contains five passing cases and includes the announcement fallback error code:

```text
API error: [232097] Unable to operate docx type chat announcement.
```

## How To Use In Demo Prep

Use this pack before recording:

1. Run `npm run test:one -- eval`.
2. Generate `tmp/demo-eval/DEMO_EVAL.md`.
3. Confirm all cases pass.
4. Use the report as the failure-path appendix for the demo owner.

Use this pack during Q&A:

- If asked about missing owner or vague requirements, point to the risk detection cases.
- If asked about unsafe AI writes, point to invalid planner schema and duplicate-run cases.
- If asked about platform errors, point to optional tool failure fallback.

## Scope Boundary

This pack is intentionally narrow:

- It does not replace full product QA.
- It does not trigger live Feishu writes.
- It does not claim card callback delivery is verified.
- It focuses on explainable competition-demo risks.
