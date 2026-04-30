import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { JsonlRecorder } from "../../src/infrastructure/jsonl-recorder.js";

test("JsonlRecorder creates parent dirs and writes timestamped JSONL", async () => {
  const root = await mkdtemp(join(tmpdir(), "pilotflow-recorder-"));
  try {
    const file = join(root, "nested", "run.jsonl");
    const recorder = new JsonlRecorder(file);
    await recorder.record({
      type: "run.created",
      runId: "run-1",
      content: "private message",
      metadata: { apiKey: "secret-key" },
    });
    const line = (await readFile(file, "utf8")).trim();
    const parsed = JSON.parse(line) as Record<string, unknown>;
    assert.equal(parsed.type, "run.created");
    assert.equal(parsed.runId, "run-1");
    assert.match(String(parsed.content), /^\[REDACTED/);
    assert.match(String((parsed.metadata as Record<string, unknown>).apiKey), /^\[REDACTED/);
    assert.equal(typeof parsed.ts, "string");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
