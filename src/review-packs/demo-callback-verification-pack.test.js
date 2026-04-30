import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCallbackVerificationPack, renderCallbackVerificationMarkdown } from "./demo-callback-verification-pack.js";

const tempDir = await mkdtemp(join(tmpdir(), "pilotflow-callback-pack-"));

try {
  const cardRunLog = join(tempDir, "card.jsonl");
  const listenerLog = join(tempDir, "listener.jsonl");
  const permissionPack = join(tempDir, "permissions.md");

  await writeFile(
    cardRunLog,
    [
      jsonl({
        event: "tool.called",
        tool: "card.send",
        input: {
          card: {
            elements: [
              {
                tag: "action",
                actions: [
                  button("confirm_execute"),
                  button("edit_plan"),
                  button("doc_only"),
                  button("cancel")
                ]
              }
            ]
          }
        }
      }),
      jsonl({
        event: "tool.succeeded",
        tool: "card.send",
        output: {
          json: {
            data: {
              message_id: "om_demo_card"
            }
          }
        }
      }),
      jsonl({
        event: "artifact.created",
        artifact: {
          type: "card",
          external_id: "om_demo_card"
        }
      })
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    listenerLog,
    [
      jsonl({
        event: "listener.lark_cli_stderr",
        listener_event: {
          message: "Listening for: card.action.trigger\nConnected. Waiting for events..."
        }
      }),
      jsonl({
        event: "listener.listener_timeout",
        listener_event: {
          event_count: 0
        }
      })
    ].join("\n"),
    "utf8"
  );

  await writeFile(permissionPack, "| Event subscribe dry-run | ready | ok |", "utf8");

  const pack = await buildCallbackVerificationPack({
    cardRunLog,
    listenerLog,
    permissionPack,
    output: join(tempDir, "CALLBACK.md")
  });

  assert.equal(pack.status, "blocked_on_platform_callback_event");
  assert.equal(pack.card.ready, true);
  assert.equal(pack.card.actionsReady, true);
  assert.equal(pack.listener.status, "connected_no_callback");
  assert.equal(pack.permissions.status, "event_dry_run_ready");

  const markdown = renderCallbackVerificationMarkdown(pack);
  assert.match(markdown, /Callback Verification Pack/);
  assert.match(markdown, /blocked_on_platform_callback_event/);
  assert.match(markdown, /text confirmation as fallback/i);
  assert.match(markdown, /card\.action\.trigger/);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("demo callback verification pack tests passed");

function button(action) {
  return {
    tag: "button",
    value: {
      pilotflow_card: "execution_plan",
      pilotflow_run_id: "run_demo",
      pilotflow_action: action
    }
  };
}

function jsonl(value) {
  return JSON.stringify(value);
}
