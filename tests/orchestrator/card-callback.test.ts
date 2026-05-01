import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractCardAction, handleCardCallback } from "../../src/orchestrator/card-callback.js";

describe("card callback", () => {
  it("extracts execution plan action and can invoke orchestrator continuation", async () => {
    const action = extractCardAction({
      event: {
        action: {
          value: JSON.stringify({
            pilotflow_card: "execution_plan",
            pilotflow_run_id: "run-card",
            pilotflow_action: "confirm_execute",
          }),
        },
        operator: { open_id: "ou_1" },
      },
    });

    assert.equal(action?.action, "confirm_execute");
    assert.equal(action?.runId, "run-card");

    const calls: unknown[] = [];
    const result = await handleCardCallback(action, {
      run: async (...args: unknown[]) => {
        calls.push(args);
        return { status: "completed", artifacts: [] };
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(calls.length, 1);
  });

  it("accepts the legacy flight_plan card value", () => {
    const action = extractCardAction({
      event: {
        action: {
          value: {
            pilotflow_card: "flight_plan",
            pilotflow_action: "confirm_execute",
          },
        },
      },
    });

    assert.equal(action?.card, "flight_plan");
    assert.equal(action?.decision.next, "run_full_project_init");
  });

  it("extracts cancel action with cancelled status and stop_run next", () => {
    const action = extractCardAction({
      event: {
        action: {
          value: {
            pilotflow_card: "execution_plan",
            pilotflow_action: "cancel",
            pilotflow_run_id: "run-cancel-1",
          },
        },
        operator: { open_id: "ou_user" },
      },
    });

    assert.equal(action?.action, "cancel");
    assert.equal(action?.card, "execution_plan");
    assert.equal(action?.runId, "run-cancel-1");
    assert.equal(action?.userId, "ou_user");
    assert.equal(action?.decision.status, "cancelled");
    assert.equal(action?.decision.next, "stop_run");
    assert.match(action?.decision.message ?? "", /cancelled/i);
  });

  it("returns null for unknown card action combinations", () => {
    const action = extractCardAction({
      event: {
        action: {
          value: {
            pilotflow_card: "unknown_card_type",
            pilotflow_action: "some_action",
          },
        },
      },
    });

    assert.equal(action, null);
  });
});
