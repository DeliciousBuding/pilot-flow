import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "../../src/shared/parse-args.js";

test("parseArgs supports equals, values, booleans, aliases, and positional separator", () => {
  const parsed = parseArgs(
    ["-p", "pilotflow-contest", "--mode=live", "--dry-run", "--", "--literal"],
    { alias: { p: "profile" }, boolean: ["dry-run"], string: ["profile", "mode"] },
  );
  assert.deepEqual(parsed.flags, { profile: "pilotflow-contest", mode: "live", "dry-run": true });
  assert.deepEqual(parsed.positional, ["--literal"]);
});
