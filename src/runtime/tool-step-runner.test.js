import assert from "node:assert/strict";
import { ToolStepRunner } from "./tool-step-runner.js";

function createRecorder() {
  const events = [];
  return {
    events,
    async record(event) {
      events.push(event);
    }
  };
}

{
  const recorder = createRecorder();
  const runner = new ToolStepRunner({
    recorder,
    tools: {
      async execute() {
        return { status: "created", message_id: "om_123" };
      }
    }
  });

  const artifacts = await runner.callTool("run-1", 1, "step-summary", "im.send", { text: "hello" });
  assert.equal(artifacts[0].type, "message");
  assert.equal(recorder.events.some((event) => event.event === "tool.called"), true);
  assert.equal(recorder.events.at(-1).status, "succeeded");
}

{
  const recorder = createRecorder();
  const runner = new ToolStepRunner({
    recorder,
    tools: {
      async execute() {
        throw new Error("announcement blocked");
      }
    }
  });

  const artifacts = await runner.callOptionalTool("run-2", 2, "step-announcement", "announcement.update", {
    title: "Announcement"
  });
  assert.equal(artifacts[0].status, "failed");
  assert.equal(artifacts[0].type, "announcement");
  assert.equal(recorder.events.some((event) => event.event === "optional_tool.fallback"), true);
}

console.log("tool step runner tests passed");
