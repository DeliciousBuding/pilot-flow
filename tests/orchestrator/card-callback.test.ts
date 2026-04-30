import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractCardAction, handleCardCallback } from "../../src/orchestrator/card-callback.js";

describe("card callback", () => {
  it("extracts flight plan action and can invoke orchestrator continuation", async () => {
    const action = extractCardAction({
      event: {
        action: {
          value: JSON.stringify({
            pilotflow_card: "flight_plan",
            pilotflow_run_id: "run-card",
            pilotflow_action: "confirm_takeoff",
          }),
        },
        operator: { open_id: "ou_1" },
      },
    });

    assert.equal(action?.action, "confirm_takeoff");
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
});
