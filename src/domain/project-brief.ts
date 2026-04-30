import type { Artifact } from "../types/artifact.js";
import type { ProjectInitPlan } from "../types/plan.js";

export function buildBriefMarkdown(plan: ProjectInitPlan, artifacts: readonly Artifact[] = []): string {
  return `# PilotFlow Project Brief

## Goal

${plan.goal}

## Members

${formatList(plan.members, "TBD")}

## Deliverables

${formatList(plan.deliverables, "TBD")}

## Deadline

${plan.deadline}

## Risks

${formatList(plan.risks.map((risk) => risk.title), "No explicit risks")}
${formatArtifacts(artifacts)}
`;
}

function formatList(items: readonly string[], fallback: string): string {
  if (items.length === 0) return `- ${fallback}`;
  return items.map((item) => `- ${item}`).join("\n");
}

function formatArtifacts(artifacts: readonly Artifact[]): string {
  if (artifacts.length === 0) return "";
  return `\n## Related Artifacts\n\n${artifacts
    .map((artifact) => {
      const label = artifact.title ?? artifact.external_id;
      return artifact.url ? `- ${artifact.type}: [${label}](${artifact.url})` : `- ${artifact.type}: ${label}`;
    })
    .join("\n")}\n`;
}
