const DEFAULT_DEADLINE = "TBD";
const DETERMINISTIC_PROVIDER = "deterministic-prototype";

export class DeterministicProjectInitPlanner {
  constructor({ provider = DETERMINISTIC_PROVIDER } = {}) {
    this.provider = provider;
  }

  plan(inputText) {
    return buildDeterministicProjectInitPlan(inputText);
  }
}

export function createProjectInitPlannerProvider({ type = DETERMINISTIC_PROVIDER } = {}) {
  if (type !== DETERMINISTIC_PROVIDER && type !== "deterministic") {
    throw new Error(`Unsupported project-init planner provider: ${type}`);
  }

  return new DeterministicProjectInitPlanner({ provider: type });
}

export function createProjectInitPlan(inputText) {
  return buildDeterministicProjectInitPlan(inputText);
}

function buildDeterministicProjectInitPlan(inputText) {
  const fields = parseDemoInput(inputText);
  const goal = fields.goal || inputText.split(/\r?\n/).find(Boolean) || "Launch a project from group discussion";
  const members = splitList(fields.members);
  const deliverables = splitList(fields.deliverables);
  const risks = splitList(fields.risks).map((title, index) => ({
    id: `risk-${index + 1}`,
    title,
    level: "medium",
    status: "open"
  }));

  const missingInfo = [];
  if (members.length === 0) missingInfo.push("members");
  if (deliverables.length === 0) missingInfo.push("deliverables");
  if (!fields.deadline) missingInfo.push("deadline");

  return {
    intent: "project_init",
    goal,
    members,
    deliverables,
    deadline: fields.deadline || DEFAULT_DEADLINE,
    missing_info: missingInfo,
    steps: [
      { id: "step-plan", title: "Generate project flight plan", status: "pending" },
      { id: "step-confirm", title: "Post flight plan card and request human confirmation", status: "pending", tool: "card.send" },
      { id: "step-doc", title: "Create project brief document", status: "pending", tool: "doc.create" },
      { id: "step-state", title: "Write tasks and risks to project state", status: "pending", tool: "base.write" },
      { id: "step-task", title: "Create first task with owner/deadline fallback context", status: "pending", tool: "task.create" },
      { id: "step-risk", title: "Build risk decision card", status: "pending", tool: "card.send" },
      { id: "step-entry", title: "Send project entry message", status: "pending", tool: "entry.send" },
      { id: "step-announcement", title: "Try to upgrade project entry to group announcement", status: "pending", tool: "announcement.update" },
      { id: "step-pin", title: "Pin project entry message", status: "pending", tool: "entry.pin" },
      { id: "step-summary", title: "Send delivery summary", status: "pending", tool: "im.send" }
    ],
    confirmations: [
      {
        id: "confirm-takeoff",
        prompt: "Confirm the flight plan before PilotFlow writes project artifacts.",
        status: "pending",
        required_for: ["step-doc", "step-state", "step-task", "step-risk", "step-entry", "step-announcement", "step-pin", "step-summary"]
      }
    ],
    risks
  };
}

function parseDemoInput(inputText) {
  const result = {};
  for (const line of inputText.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z ]+):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase().replaceAll(" ", "_");
    result[key] = match[2].trim();
  }
  return result;
}

function splitList(value = "") {
  return value
    .split(/[,;，；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
