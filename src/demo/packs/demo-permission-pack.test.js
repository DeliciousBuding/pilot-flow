import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDemoPermissionPack, renderDemoPermissionMarkdown } from "./demo-permission-pack.js";

const tempDir = await mkdtemp(join(tmpdir(), "pilotflow-permission-pack-"));

try {
  const authStatusJson = join(tempDir, "auth-status.json");
  const listenerLog = join(tempDir, "listener.jsonl");
  await writeFile(
    authStatusJson,
    JSON.stringify({
      appId: "cli_test",
      brand: "feishu",
      identity: "user",
      tokenStatus: "valid",
      verified: true,
      userOpenId: "ou_should_not_render",
      scope: [
        "im:message",
        "im:chat:read",
        "im:message.pins:write_only",
        "docx:document:create",
        "docs:document.content:read",
        "docx:document:write_only",
        "base:app:read",
        "base:record:create",
        "base:record:read",
        "base:field:read",
        "task:task:write",
        "task:task:read",
        "contact:user:search",
        "contact:user.base:readonly",
        "docs:event:subscribe"
      ].join(" ")
    }),
    "utf8"
  );
  await writeFile(
    listenerLog,
    [
      JSON.stringify({ listener_event: { message: "Connected." } }),
      JSON.stringify({ event: "listener.listener_timeout", listener_event: { event_count: 0 } })
    ].join("\n"),
    "utf8"
  );

  const pack = await buildDemoPermissionPack({
    authStatusJson,
    listenerLog,
    output: join(tempDir, "PERMISSION_APPENDIX_TEST.md")
  });

  assert.equal(pack.auth.status, "verified");
  assert.equal(pack.scopeGroups.every((group) => group.status === "covered"), true);
  assert.equal(pack.listener.status, "connected_no_callback");
  assert.equal(pack.screenshotItems.length, 5);

  const markdown = renderDemoPermissionMarkdown(pack);
  assert.match(markdown, /Permission Appendix Pack/);
  assert.match(markdown, /Scope Coverage Matrix/);
  assert.match(markdown, /card\.action\.trigger/);
  assert.doesNotMatch(markdown, /ou_should_not_render/);
  assert.match(markdown, /Do not show App Secret/);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("demo permission pack tests passed");
