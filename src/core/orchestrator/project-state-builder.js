export const PROJECT_STATE_FIELDS = [
  "type",
  "title",
  "owner",
  "due_date",
  "status",
  "risk_level",
  "source_run",
  "source_message",
  "url"
];

export const PROJECT_STATE_FIELD_DEFINITIONS = PROJECT_STATE_FIELDS.map((name) => ({
  name,
  type: "text"
}));

export function buildProjectStateRows(plan, { runId, artifacts = [], sourceMessage = "manual-trigger" } = {}) {
  const doc = artifacts.find((artifact) => artifact.type === "doc");
  const dueDate = normalizeDueDateText(plan.deadline);

  const taskRows = plan.deliverables.map((item, index) =>
    rowToArray({
      type: "task",
      title: item,
      owner: ownerFallback(plan, index),
      due_date: dueDate,
      status: "todo",
      risk_level: "",
      source_run: runId,
      source_message: sourceMessage,
      url: ""
    })
  );

  const riskRows = plan.risks.map((risk, index) =>
    rowToArray({
      type: "risk",
      title: risk.title,
      owner: ownerFallback(plan, index),
      due_date: dueDate,
      status: risk.status || "open",
      risk_level: risk.level || "medium",
      source_run: runId,
      source_message: sourceMessage,
      url: ""
    })
  );

  const artifactRows = [
    rowToArray({
      type: "artifact",
      title: "Project brief document",
      owner: ownerFallback(plan, 0),
      due_date: dueDate,
      status: doc?.status === "created" ? "created" : "planned",
      risk_level: "",
      source_run: runId,
      source_message: sourceMessage,
      url: doc?.url || ""
    })
  ];

  return [...taskRows, ...riskRows, ...artifactRows];
}

export function firstTaskSummary(plan) {
  return plan.deliverables[0] || `Kick off: ${plan.goal}`;
}

export function firstTaskFallbackOwner(plan) {
  return ownerFallback(plan, 0);
}

export function normalizeDueDate(deadline) {
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : undefined;
}

export function normalizeDueDateText(deadline) {
  return normalizeDueDate(deadline) || "TBD";
}

function rowToArray(row) {
  return PROJECT_STATE_FIELDS.map((field) => row[field] ?? "");
}

function ownerFallback(plan, index) {
  const members = Array.isArray(plan.members) ? plan.members.filter(Boolean) : [];
  if (members.length === 0) return "TBD";
  return members[index % members.length];
}
