import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnv } from "../../src/config/local-env.js";

test("loadLocalEnv merges .env values without overriding explicit env", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilotflow-local-env-"));
  try {
    await writeFile(join(dir, ".env"), [
      "# local targets",
      "PILOTFLOW_LARK_PROFILE=from-file",
      "PILOTFLOW_TEST_CHAT_ID=oc_from_file",
      "PILOTFLOW_BASE_TOKEN=\"base from file\"",
      "PILOTFLOW_BASE_TABLE_ID='tbl_from_file'",
      "BROKEN_LINE",
      "",
    ].join("\n"), "utf8");

    const env = loadLocalEnv({ cwd: dir, env: { PILOTFLOW_LARK_PROFILE: "explicit" } });

    assert.equal(env.PILOTFLOW_LARK_PROFILE, "explicit");
    assert.equal(env.PILOTFLOW_TEST_CHAT_ID, "oc_from_file");
    assert.equal(env.PILOTFLOW_BASE_TOKEN, "base from file");
    assert.equal(env.PILOTFLOW_BASE_TABLE_ID, "tbl_from_file");
    assert.equal(env.BROKEN_LINE, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadLocalEnv returns input env when .env is absent", () => {
  const env = loadLocalEnv({ cwd: join(tmpdir(), "pilotflow-missing-env"), env: { PILOTFLOW_LARK_PROFILE: "explicit" } });
  assert.equal(env.PILOTFLOW_LARK_PROFILE, "explicit");
});
