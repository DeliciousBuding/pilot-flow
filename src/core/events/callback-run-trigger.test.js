import { strict as assert } from "node:assert";
import { triggerRunFromCallback } from "./callback-run-trigger.js";

class MemoryRecorder {
  constructor() {
    this.events = [];
  }

  async record(event) {
    this.events.push(event);
  }
}

const approvedCallback = {
  ok: true,
  card: "flight_plan",
  action: "confirm_takeoff",
  run_id: "run-original",
  user_id: "ou_user",
  decision: {
    status: "approved",
    next: "run_full_project_init"
  }
};

{
  const recorder = new MemoryRecorder();
  const result = await triggerRunFromCallback(approvedCallback, {
    dryRun: true,
    recorder
  });

  assert.equal(result.status, "dry_run_skipped");
  assert.equal(recorder.events.length, 2);
  assert.equal(recorder.events[0].event, "card.callback_received");
  assert.equal(recorder.events[1].event, "card.callback_triggered");
  assert.equal(recorder.events[1].status, "dry_run_skipped");
}

{
  const recorder = new MemoryRecorder();
  const result = await triggerRunFromCallback(approvedCallback, {
    inputPath: "tmp/does-not-exist/pilotflow-callback-input.txt",
    outputPath: "tmp/runs/callback-trigger-missing-input.jsonl",
    recorder
  });

  assert.equal(result.status, "failed");
  assert.match(result.error, /ENOENT|no such file/i);
  assert.equal(recorder.events.some((event) => event.event === "card.callback_triggered" && event.status === "started"), true);
  assert.equal(recorder.events.some((event) => event.event === "card.callback_failed"), true);
}

console.log("callback-run-trigger tests passed");
