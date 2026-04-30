import assert from "node:assert/strict";
import { test } from "node:test";
import { redactArgs } from "../../src/safety/redact.js";

test("redactArgs redacts sensitive split and equals forms", () => {
  assert.deepEqual(
    redactArgs(["--base-token", "secret-base", "--CONTENT=hello", "--profile", "pilotflow-contest", "--api-key", "sk-test"]),
    ["--base-token", "[REDACTED]", "--CONTENT=[REDACTED]", "--profile", "pilotflow-contest", "--api-key", "[REDACTED]"],
  );
});
