import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DuplicateGuard, GuardBlockedError } from "../../src/orchestrator/duplicate-guard.js";

describe("DuplicateGuard", () => {
  it("blocks duplicate live runs until the key is completed or expires", async () => {
    const dir = join(process.cwd(), "tmp", "tests", `pilotflow-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try {
      const guard = new DuplicateGuard({ enabled: true, storagePath: join(dir, "runs"), ttlMs: 50, allowDuplicateRun: false });

      const started = await guard.start({ key: "project_init:abc", runId: "run-1", summary: { goal: "x" } });
      assert.equal(started.status, "started");

      await assert.rejects(
        () => guard.start({ key: "project_init:abc", runId: "run-2" }),
        (error) => error instanceof GuardBlockedError && error.existingRun.runId === "run-1",
      );

      await guard.complete({ key: "project_init:abc", runId: "run-1", artifactCount: 2 });
      await assert.rejects(() => guard.start({ key: "project_init:abc", runId: "run-3" }), GuardBlockedError);

      await new Promise((resolve) => setTimeout(resolve, 70));
      const restarted = await guard.start({ key: "project_init:abc", runId: "run-4" });
      assert.equal(restarted.status, "started");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses exclusive files so concurrent starts cannot both win", async () => {
    const dir = join(process.cwd(), "tmp", "tests", `pilotflow-guard-race-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try {
      await mkdir(dir, { recursive: true });
      const guard = new DuplicateGuard({ enabled: true, storagePath: dir, ttlMs: 60_000, allowDuplicateRun: false });
      const results = await Promise.allSettled([
        guard.start({ key: "project_init:race", runId: "run-a" }),
        guard.start({ key: "project_init:race", runId: "run-b" }),
      ]);

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("cleans up expired guard files", async () => {
    const dir = join(process.cwd(), "tmp", "tests", `pilotflow-guard-cleanup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try {
      const guard = new DuplicateGuard({ enabled: true, storagePath: dir, ttlMs: 10, allowDuplicateRun: false });
      await guard.start({ key: "project_init:old", runId: "run-old" });
      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.equal(await guard.cleanup(), 1);
      const restarted = await guard.start({ key: "project_init:old", runId: "run-new" });
      assert.equal(restarted.status, "started");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
