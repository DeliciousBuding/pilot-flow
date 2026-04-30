import assert from "node:assert/strict";
import test from "node:test";
import { ChatQueue } from "../../../src/gateway/feishu/chat-queue.js";

test("ChatQueue serializes jobs per chat", async () => {
  const queue = new ChatQueue();
  const order: string[] = [];
  let releaseFirst: (() => void) | undefined;

  const first = queue.enqueue("chat-1", async () => {
    order.push("first-start");
    await new Promise<void>((resolve) => { releaseFirst = resolve; });
    order.push("first-end");
  });
  const second = queue.enqueue("chat-1", async () => {
    order.push("second");
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["first-start"]);
  releaseFirst?.();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first-start", "first-end", "second"]);
});
