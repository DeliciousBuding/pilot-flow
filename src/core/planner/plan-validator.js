const PLAN_REQUIRED_FIELDS = ["intent", "goal", "members", "deliverables", "deadline", "steps", "confirmations", "risks"];
const STEP_STATUSES = new Set(["pending", "running", "succeeded", "failed", "skipped"]);
const CONFIRMATION_STATUSES = new Set(["pending", "approved", "rejected", "expired"]);
const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const RISK_STATUSES = new Set(["open", "accepted", "mitigated", "closed"]);

export function validateProjectInitPlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return { ok: false, errors: [{ path: "$", message: "plan must be an object" }] };
  }

  for (const field of PLAN_REQUIRED_FIELDS) {
    if (plan[field] === undefined) {
      errors.push({ path: field, message: "is required" });
    }
  }

  if (plan.intent !== undefined && plan.intent !== "project_init") {
    errors.push({ path: "intent", message: "must equal project_init" });
  }
  requireString(plan.goal, "goal", errors);
  requireString(plan.deadline, "deadline", errors);
  requireStringArray(plan.members, "members", errors);
  requireStringArray(plan.deliverables, "deliverables", errors);
  if (plan.missing_info !== undefined) requireStringArray(plan.missing_info, "missing_info", errors);
  requireObjectArray(plan.steps, "steps", errors, validateStep);
  requireObjectArray(plan.confirmations, "confirmations", errors, validateConfirmation);
  requireObjectArray(plan.risks, "risks", errors, validateRisk);

  return { ok: errors.length === 0, errors };
}

export function buildPlanValidationFallbackPlan(inputText, errors = []) {
  const missingInfo = [...new Set(errors.map((error) => error.path.split(".")[0]))];
  const sourceSummary = String(inputText || "").split(/\r?\n/).find(Boolean) || "project request";

  return {
    intent: "project_init",
    goal: `Clarify project launch request before writing Feishu artifacts: ${sourceSummary}`,
    members: [],
    deliverables: ["Clarify goal, owners, deliverables, and deadline"],
    deadline: "TBD",
    missing_info: ["valid plan schema", ...missingInfo],
    steps: [
      {
        id: "step-clarify",
        title: "Ask requester to clarify the project plan before Feishu writes",
        status: "pending"
      }
    ],
    confirmations: [
      {
        id: "confirm-clarify",
        prompt: "PilotFlow needs a valid project plan before creating Doc, Base, Task, or IM artifacts.",
        status: "pending",
        required_for: []
      }
    ],
    risks: [
      {
        id: "risk-plan-validation",
        title: "planner output failed schema validation",
        level: "high",
        status: "open"
      }
    ]
  };
}

function validateStep(step, path, errors) {
  requireString(step.id, `${path}.id`, errors);
  requireString(step.title, `${path}.title`, errors);
  requireEnum(step.status, STEP_STATUSES, `${path}.status`, errors);
  if (step.tool !== undefined) requireString(step.tool, `${path}.tool`, errors);
  if (step.depends_on !== undefined) requireStringArray(step.depends_on, `${path}.depends_on`, errors);
}

function validateConfirmation(confirmation, path, errors) {
  requireString(confirmation.id, `${path}.id`, errors);
  requireString(confirmation.prompt, `${path}.prompt`, errors);
  requireEnum(confirmation.status, CONFIRMATION_STATUSES, `${path}.status`, errors);
  requireStringArray(confirmation.required_for, `${path}.required_for`, errors);
}

function validateRisk(risk, path, errors) {
  requireString(risk.id, `${path}.id`, errors);
  requireString(risk.title, `${path}.title`, errors);
  requireEnum(risk.level, RISK_LEVELS, `${path}.level`, errors);
  requireEnum(risk.status, RISK_STATUSES, `${path}.status`, errors);
  if (risk.owner !== undefined) requireString(risk.owner, `${path}.owner`, errors);
  if (risk.source_run !== undefined) requireString(risk.source_run, `${path}.source_run`, errors);
}

function requireString(value, path, errors) {
  if (typeof value !== "string") {
    errors.push({ path, message: "must be a string" });
  }
}

function requireStringArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "must be an array" });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push({ path: `${path}[${index}]`, message: "must be a string" });
    }
  });
}

function requireObjectArray(value, path, errors, validateItem) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "must be an array" });
    return;
  }

  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ path: `${path}[${index}]`, message: "must be an object" });
      return;
    }
    validateItem(item, `${path}[${index}]`, errors);
  });
}

function requireEnum(value, allowed, path, errors) {
  if (!allowed.has(value)) {
    errors.push({ path, message: `must be one of: ${[...allowed].join(", ")}` });
  }
}
