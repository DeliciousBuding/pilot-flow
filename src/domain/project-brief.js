export function buildBriefMarkdown(plan) {
  return `# PilotFlow Project Brief

## Goal

${plan.goal}

## Members

${plan.members.map((member) => `- ${member}`).join("\n") || "- TBD"}

## Deliverables

${plan.deliverables.map((item) => `- ${item}`).join("\n") || "- TBD"}

## Deadline

${plan.deadline}

## Risks

${plan.risks.map((risk) => `- ${risk.title}`).join("\n") || "- No explicit risks"}
`;
}
