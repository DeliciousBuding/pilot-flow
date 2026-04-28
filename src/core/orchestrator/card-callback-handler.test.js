import assert from "node:assert/strict";
import { extractActionValue, handleCardCallback } from "./card-callback-handler.js";

assert.deepEqual(
  extractActionValue({
    event: {
      action: {
        value: {
          pilotflow_card: "flight_plan",
          pilotflow_run_id: "run-1",
          pilotflow_action: "confirm_takeoff"
        }
      }
    }
  }),
  {
    pilotflow_card: "flight_plan",
    pilotflow_run_id: "run-1",
    pilotflow_action: "confirm_takeoff"
  }
);

assert.deepEqual(
  handleCardCallback({
    event: {
      operator: {
        open_id: "ou_user"
      },
      action: {
        value: {
          pilotflow_card: "flight_plan",
          pilotflow_run_id: "run-1",
          pilotflow_action: "confirm_takeoff"
        }
      }
    }
  }),
  {
    ok: true,
    card: "flight_plan",
    action: "confirm_takeoff",
    run_id: "run-1",
    user_id: "ou_user",
    decision: {
      status: "approved",
      next: "run_full_project_init",
      message: "Flight plan confirmed. Continue with Doc, Base, Task, risk, entry, and summary steps."
    }
  }
);

assert.equal(
  handleCardCallback({
    action: {
      value: JSON.stringify({
        pilotflow_action: "doc_only"
      })
    }
  }).decision.next,
  "run_doc_only"
);

assert.equal(
  handleCardCallback({
    event: {
      action: {
        value: {
          pilotflow_card: "risk_decision",
          pilotflow_action: "accept_risk"
        }
      }
    }
  }).decision.status,
  "accepted"
);

assert.deepEqual(handleCardCallback({ event: { action: { value: {} } } }), {
  ok: false,
  card: "",
  action: undefined,
  run_id: "",
  user_id: "",
  reason: "missing_action"
});

assert.equal(
  handleCardCallback({
    event: {
      action: {
        value: {
          pilotflow_card: "flight_plan",
          pilotflow_action: "unknown"
        }
      }
    }
  }).reason,
  "unsupported_action"
);

console.log("card callback handler tests passed");
