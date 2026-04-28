const FLIGHT_PLAN_ACTIONS = new Map([
  [
    "confirm_takeoff",
    {
      status: "approved",
      next: "run_full_project_init",
      message: "Flight plan confirmed. Continue with Doc, Base, Task, risk, entry, and summary steps."
    }
  ],
  [
    "edit_plan",
    {
      status: "needs_edit",
      next: "request_plan_edit",
      message: "Requester wants to edit the flight plan before Feishu writes."
    }
  ],
  [
    "doc_only",
    {
      status: "approved_doc_only",
      next: "run_doc_only",
      message: "Flight plan confirmed for document-only execution."
    }
  ],
  [
    "cancel",
    {
      status: "cancelled",
      next: "stop_run",
      message: "Flight plan was cancelled before Feishu project artifacts were written."
    }
  ]
]);

const RISK_ACTIONS = new Map([
  [
    "assign_owner",
    {
      status: "needs_owner",
      next: "request_owner_mapping",
      message: "Risk decision requests owner confirmation or reassignment."
    }
  ],
  [
    "adjust_deadline",
    {
      status: "needs_deadline",
      next: "request_deadline_update",
      message: "Risk decision requests a deadline adjustment."
    }
  ],
  [
    "accept_risk",
    {
      status: "accepted",
      next: "record_risk_acceptance",
      message: "Risk accepted and should remain tracked."
    }
  ],
  [
    "defer",
    {
      status: "deferred",
      next: "pause_risk_action",
      message: "Risk action deferred."
    }
  ]
]);

export function handleCardCallback(payload = {}) {
  const value = extractActionValue(payload);
  const card = value.pilotflow_card || inferCardFromAction(value.pilotflow_action);
  const action = value.pilotflow_action;
  const runId = value.pilotflow_run_id || extractRunId(payload);
  const userId = extractUserId(payload);

  if (!action) {
    return rejected({ card, action, runId, userId, reason: "missing_action" });
  }

  const decision = decisionFor(card, action);
  if (!decision) {
    return rejected({ card, action, runId, userId, reason: "unsupported_action" });
  }

  return {
    ok: true,
    card,
    action,
    run_id: runId,
    user_id: userId,
    decision
  };
}

export function extractActionValue(payload = {}) {
  const action =
    getPath(payload, ["event", "action"]) ||
    getPath(payload, ["action"]) ||
    getPath(payload, ["event", "operator", "action"]) ||
    {};
  const value = action.value || getPath(payload, ["event", "action_value"]) || payload.value || {};

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { pilotflow_action: value };
    }
  }

  return value && typeof value === "object" ? value : {};
}

function decisionFor(card, action) {
  if (card === "flight_plan") return FLIGHT_PLAN_ACTIONS.get(action);
  if (card === "risk_decision") return RISK_ACTIONS.get(action);
  return undefined;
}

function inferCardFromAction(action) {
  if (FLIGHT_PLAN_ACTIONS.has(action)) return "flight_plan";
  if (RISK_ACTIONS.has(action)) return "risk_decision";
  return "";
}

function rejected({ card, action, runId, userId, reason }) {
  return {
    ok: false,
    card,
    action,
    run_id: runId,
    user_id: userId,
    reason
  };
}

function extractRunId(payload) {
  return (
    getPath(payload, ["event", "context", "run_id"]) ||
    getPath(payload, ["context", "run_id"]) ||
    getPath(payload, ["event", "message", "root_id"]) ||
    ""
  );
}

function extractUserId(payload) {
  return (
    getPath(payload, ["event", "operator", "open_id"]) ||
    getPath(payload, ["event", "operator", "operator_id", "open_id"]) ||
    getPath(payload, ["operator", "open_id"]) ||
    getPath(payload, ["user", "open_id"]) ||
    ""
  );
}

function getPath(value, path) {
  return path.reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), value);
}
