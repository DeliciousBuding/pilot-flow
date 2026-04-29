import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDemoFailurePack, renderDemoFailureMarkdown } from "./demo-failure-pack.js";

const tempDir = await mkdtemp(join(tmpdir(), "pilotflow-failure-pack-"));

try {
  const listenerLog = join(tempDir, "listener.jsonl");
  const liveRunLog = join(tempDir, "live.jsonl");
  const evalPack = join(tempDir, "eval.md");

  await writeFile(
    listenerLog,
    [
      JSON.stringify({ run_id: "card-listener-test", listener_event: { message: "Connected." } }),
      JSON.stringify({ event: "listener.listener_timeout", listener_event: { event_count: 0 } })
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    liveRunLog,
    [
      JSON.stringify({
        event: "tool.failed",
        tool: "announcement.update",
        error: { message: "API error: [232097] Unable to operate docx type chat announcement." }
      }),
      JSON.stringify({
        event: "optional_tool.fallback",
        tool: "announcement.update",
        fallback: "continue_with_existing_project_entry_path"
      }),
      JSON.stringify({ event: "run.completed" })
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    evalPack,
    `# Demo Evaluation Pack

### Missing owner and deliverables

- Status: \`pass\`
- Highest risk level: high
- Recommended action: confirm_owner_or_deadline
- Detected risk IDs: derived-missing-members, derived-missing-deliverables, derived-missing-deadline

### Vague deadline and text owner fallback

- Status: \`pass\`
- Deadline input: next Friday
- Detected risk IDs: derived-missing-deadline, derived-owner-text-fallback
- Owner fallback risk owner: Feishu Integration Owner

### Invalid planner schema

- Status: \`pass\`
- Validation ok: false
- Validation paths: members
- Fallback status prompt: PilotFlow needs a valid project plan before creating Doc, Base, Task, or IM artifacts.

### Duplicate live run

- Status: \`pass\`
- Guard result: DUPLICATE_RUN_BLOCKED
- Dedupe key format: project_init:8f47450d83f098670b3cca99
- Existing run: run-demo-eval-1
- Existing artifact count: 1
`,
    "utf8"
  );

  const pack = await buildDemoFailurePack({
    listenerLog,
    liveRunLog,
    evalPack,
    output: join(tempDir, "FAILURE_DEMO_TEST.md")
  });

  assert.equal(pack.scenarios.length, 5);
  assert.equal(pack.scenarios.every((item) => item.evidenceStatus === "ready"), true);
  assert.equal(pack.scenarios.some((item) => item.title === "Card callback event did not arrive"), true);
  assert.equal(pack.scenarios.some((item) => item.title === "Group announcement API blocked"), true);

  const markdown = renderDemoFailureMarkdown(pack);
  assert.match(markdown, /Failure-Path Demo Pack/);
  assert.match(markdown, /card\.action\.trigger/);
  assert.match(markdown, /232097/);
  assert.match(markdown, /DUPLICATE_RUN_BLOCKED/);
  assert.match(markdown, /not a replacement for real recording/);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("demo failure pack tests passed");
