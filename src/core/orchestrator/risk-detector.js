const DEFAULT_OPTIONS = ["assign_owner", "adjust_deadline", "accept_risk", "defer"];

export function detectProjectRisks(plan) {
  const risks = [];
  const seen = new Set();

  for (const risk of plan.risks || []) {
    addRisk(risks, seen, {
      id: risk.id || `risk-${risks.length + 1}`,
      title: risk.title,
      level: risk.level || "medium",
      status: risk.status || "open",
      source: "planner",
      owner: fallbackOwner(plan, risks.length),
      recommendation: recommendationForTitle(risk.title),
      decision_options: DEFAULT_OPTIONS
    });
  }

  if (!Array.isArray(plan.members) || plan.members.length === 0) {
    addRisk(risks, seen, {
      id: "derived-missing-members",
      title: "No project members were captured",
      level: "high",
      status: "open",
      source: "derived",
      owner: "TBD",
      recommendation: "Ask the group to confirm at least one accountable owner before publishing tasks.",
      decision_options: ["assign_owner", "defer"]
    });
  }

  if (!Array.isArray(plan.deliverables) || plan.deliverables.length === 0) {
    addRisk(risks, seen, {
      id: "derived-missing-deliverables",
      title: "No deliverables were captured",
      level: "high",
      status: "open",
      source: "derived",
      owner: fallbackOwner(plan, 0),
      recommendation: "Ask for concrete deliverables before creating the project space.",
      decision_options: ["edit_plan", "defer"]
    });
  }

  if (!isConcreteDate(plan.deadline)) {
    addRisk(risks, seen, {
      id: "derived-missing-deadline",
      title: "Deadline is not a concrete date",
      level: "medium",
      status: "open",
      source: "derived",
      owner: fallbackOwner(plan, 0),
      recommendation: "Keep the text fallback now, then request a date before the first status review.",
      decision_options: ["adjust_deadline", "accept_risk"]
    });
  }

  if (Array.isArray(plan.members) && plan.members.length > 0) {
    addRisk(risks, seen, {
      id: "derived-owner-text-fallback",
      title: "Owners are text fallbacks, not Feishu user mappings",
      level: "medium",
      status: "open",
      source: "derived",
      owner: "Feishu Integration Owner",
      recommendation: "Keep text owners for the demo and map to Feishu open_id after contact scope is verified.",
      decision_options: ["accept_risk", "assign_owner"]
    });
  }

  return risks.map((risk, index) => ({
    ...risk,
    id: risk.id || `risk-${index + 1}`
  }));
}

export function summarizeRiskDecision(risks = []) {
  const openRisks = risks.filter((risk) => risk.status === "open");
  const highestLevel = highestRiskLevel(openRisks);
  const recommendedAction = openRisks.some((risk) => risk.level === "high" || risk.level === "critical")
    ? "confirm_owner_or_deadline"
    : "accept_with_followup";

  return {
    total: risks.length,
    open: openRisks.length,
    highest_level: highestLevel,
    recommended_action: recommendedAction,
    top_risks: openRisks.slice(0, 3).map((risk) => risk.id)
  };
}

function addRisk(risks, seen, risk) {
  const title = normalizeTitle(risk.title);
  if (!title || seen.has(title)) return;
  seen.add(title);
  risks.push(risk);
}

function recommendationForTitle(title = "") {
  const lower = title.toLowerCase();
  if (lower.includes("callback")) return "Use text confirmation as fallback until card callback events are verified.";
  if (lower.includes("owner")) return "Keep text owner fallback now, then map to Feishu users after contact lookup is verified.";
  if (lower.includes("scope") || lower.includes("permission")) return "Keep a dry-run or entry-message fallback and capture permission evidence.";
  return "Track this risk in Base and request a human decision before demo recording.";
}

function fallbackOwner(plan, index) {
  const members = Array.isArray(plan.members) ? plan.members.filter(Boolean) : [];
  if (members.length === 0) return "TBD";
  return members[index % members.length];
}

function highestRiskLevel(risks) {
  const order = ["low", "medium", "high", "critical"];
  return risks.reduce((highest, risk) => (order.indexOf(risk.level) > order.indexOf(highest) ? risk.level : highest), "low");
}

function normalizeTitle(title = "") {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function isConcreteDate(deadline = "") {
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline);
}
