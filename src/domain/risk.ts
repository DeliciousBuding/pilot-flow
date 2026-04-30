import type { PlanRisk, ProjectInitPlan, RiskLevel } from "../types/plan.js";

const DEFAULT_OPTIONS = ["assign_owner", "adjust_deadline", "accept_risk", "defer"] as const;

export interface DetectedRisk extends PlanRisk {
  readonly source: "planner" | "derived";
  readonly decision_options: readonly string[];
}

export interface RiskDecisionSummary {
  readonly total: number;
  readonly open: number;
  readonly highest_level: RiskLevel;
  readonly recommended_action: "confirm_owner_or_deadline" | "accept_with_followup";
  readonly top_risks: readonly string[];
}

export function detectRisks(plan: Partial<ProjectInitPlan>): readonly DetectedRisk[] {
  const risks: DetectedRisk[] = [];
  const seen = new Set<string>();
  const plannerRisks = Array.isArray(plan.risks) ? plan.risks : [];
  const members = Array.isArray(plan.members) ? plan.members : [];
  const deliverables = Array.isArray(plan.deliverables) ? plan.deliverables : [];
  const deadline = typeof plan.deadline === "string" ? plan.deadline : "";

  for (const risk of plannerRisks) {
    addRisk(risks, seen, {
      id: risk.id || `risk-${risks.length + 1}`,
      title: risk.title,
      level: risk.level || "medium",
      status: risk.status || "open",
      source: "planner",
      owner: risk.owner ?? fallbackOwner(plan, risks.length),
      recommendation: risk.recommendation ?? recommendationForTitle(risk.title),
      decision_options: DEFAULT_OPTIONS,
    });
  }

  if (members.length === 0) {
    addRisk(risks, seen, {
      id: "derived-missing-members",
      title: "No project members were captured",
      level: "high",
      status: "open",
      source: "derived",
      owner: "TBD",
      recommendation: "Ask the group to confirm at least one accountable owner before publishing tasks.",
      decision_options: ["assign_owner", "defer"],
    });
  }

  if (deliverables.length === 0) {
    addRisk(risks, seen, {
      id: "derived-missing-deliverables",
      title: "No deliverables were captured",
      level: "high",
      status: "open",
      source: "derived",
      owner: fallbackOwner(plan, 0),
      recommendation: "Ask for concrete deliverables before creating the project space.",
      decision_options: ["edit_plan", "defer"],
    });
  }

  if (!isConcreteDate(deadline)) {
    addRisk(risks, seen, {
      id: "derived-missing-deadline",
      title: "Deadline is not a concrete date",
      level: "medium",
      status: "open",
      source: "derived",
      owner: fallbackOwner(plan, 0),
      recommendation: "Keep the text fallback now, then request a date before the first status review.",
      decision_options: ["adjust_deadline", "accept_risk"],
    });
  }

  if (members.length > 0) {
    addRisk(risks, seen, {
      id: "derived-owner-text-fallback",
      title: "Owners are text fallbacks, not Feishu user mappings",
      level: "medium",
      status: "open",
      source: "derived",
      owner: "Feishu Integration Owner",
      recommendation: "Keep text owners for the demo and map to Feishu open_id after contact scope is verified.",
      decision_options: ["accept_risk", "assign_owner"],
    });
  }

  return risks.map((risk, index) => ({ ...risk, id: risk.id || `risk-${index + 1}` }));
}

export function summarizeRiskDecision(risks: readonly PlanRisk[]): RiskDecisionSummary {
  const openRisks = risks.filter((risk) => risk.status === "open");
  const highest = highestRiskLevel(openRisks);
  return {
    total: risks.length,
    open: openRisks.length,
    highest_level: highest,
    recommended_action: openRisks.some((risk) => risk.level === "high" || risk.level === "critical")
      ? "confirm_owner_or_deadline"
      : "accept_with_followup",
    top_risks: openRisks.slice(0, 3).map((risk) => risk.id),
  };
}

export function highestRiskLevel(risks: readonly Pick<PlanRisk, "level">[]): RiskLevel {
  const order: readonly RiskLevel[] = ["low", "medium", "high", "critical"];
  return risks.reduce<RiskLevel>(
    (highest, risk) => (order.indexOf(risk.level) > order.indexOf(highest) ? risk.level : highest),
    "low",
  );
}

function addRisk(risks: DetectedRisk[], seen: Set<string>, risk: DetectedRisk): void {
  const title = normalizeTitle(risk.title);
  if (!title || seen.has(title)) return;
  seen.add(title);
  risks.push(risk);
}

function recommendationForTitle(title = ""): string {
  const lower = title.toLowerCase();
  if (lower.includes("callback")) return "Use text confirmation as fallback until card callback events are verified.";
  if (lower.includes("owner")) return "Keep text owner fallback now, then map to Feishu users after contact lookup is verified.";
  if (lower.includes("scope") || lower.includes("permission")) return "Keep a dry-run or entry-message fallback and capture permission evidence.";
  return "Track this risk in Base and request a human decision before demo recording.";
}

function fallbackOwner(plan: Partial<ProjectInitPlan>, index: number): string {
  const members = Array.isArray(plan.members) ? plan.members.filter(Boolean) : [];
  if (members.length === 0) return "TBD";
  return members[index % members.length] ?? "TBD";
}

function normalizeTitle(title = ""): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function isConcreteDate(deadline = ""): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline);
}
