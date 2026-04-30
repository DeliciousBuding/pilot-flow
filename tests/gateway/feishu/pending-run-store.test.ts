import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PendingRunStore } from "../../../src/gateway/feishu/pending-run-store.js";

test("PendingRunStore saves, takes, and prunes expired runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-pending-store-"));
  let now = 1_000;
  const store = new PendingRunStore({
    storagePath: join(dir, "pending.json"),
    ttlMs: 100,
    now: () => now,
  });

  try {
    await store.save({
      runId: "run-1",
      inputText: "launch",
      options: { sendEntryMessage: true },
      createdAt: new Date(now).toISOString(),
    });

    assert.equal(await store.count(), 1);
    assert.equal((await store.get("run-1"))?.inputText, "launch");

    now = 2_000;
    assert.equal(await store.get("run-1"), null);
    assert.equal(await store.count(), 0);

    await store.save({
      runId: "run-2",
      inputText: "launch again",
      options: { sendRiskCard: true },
      createdAt: new Date(now).toISOString(),
    });
    const taken = await store.take("run-2");
    assert.equal(taken?.runId, "run-2");
    assert.equal(await store.count(), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PendingRunStore finds the latest run by chat id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-pending-store-chat-"));
  const store = new PendingRunStore({
    storagePath: join(dir, "pending.json"),
  });

  try {
    await store.save({
      runId: "run-1",
      chatId: "oc_1",
      inputText: "first",
      options: { sendEntryMessage: true },
      createdAt: "2026-05-01T10:00:00.000Z",
    });
    await store.save({
      runId: "run-2",
      chatId: "oc_1",
      inputText: "second",
      options: { sendRiskCard: true },
      createdAt: "2026-05-01T10:01:00.000Z",
    });
    await store.save({
      runId: "run-3",
      chatId: "oc_2",
      inputText: "third",
      options: {},
      createdAt: "2026-05-01T10:02:00.000Z",
    });

    assert.equal((await store.findLatestByChatId("oc_1"))?.runId, "run-2");
    assert.equal((await store.findLatestByChatId("oc_2"))?.runId, "run-3");
    assert.equal(await store.findLatestByChatId("oc_missing"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
