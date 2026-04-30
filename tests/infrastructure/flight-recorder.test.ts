import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildFlightRecorderModel } from "../../src/infrastructure/flight-recorder.js";

test("buildFlightRecorderModel skips bad lines and supports legacy fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "pilotflow-flight-"));
  try {
    const file = join(root, "run.jsonl");
    await writeFile(
      file,
      [
        JSON.stringify({ event: "run.created", run_id: "run-1", ts: "2026-04-30T00:00:00.000Z" }),
        "{bad json",
        JSON.stringify({
          event: "tool.succeeded",
          run_id: "run-1",
          ts: "2026-04-30T00:00:01.000Z",
          artifact: { type: "doc", external_id: "doc_1", title: "Brief" },
        }),
        JSON.stringify({ event: "run.completed", run_id: "run-1", ts: "2026-04-30T00:00:02.000Z" }),
      ].join("\n"),
      "utf8",
    );
    const model = await buildFlightRecorderModel(file);
    assert.equal(model?.runId, "run-1");
    assert.equal(model?.status, "completed");
    assert.equal(model?.events.length, 3);
    assert.equal(model?.artifacts[0]?.external_id, "doc_1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
