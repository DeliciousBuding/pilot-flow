const DEFAULT_CONFIRMATION_TEXT = "确认起飞";

export function buildFlightPlanCard({ runId, plan, confirmationText = DEFAULT_CONFIRMATION_TEXT }) {
  return {
    config: {
      wide_screen_mode: true
    },
    header: {
      template: "blue",
      title: {
        tag: "plain_text",
        content: "PilotFlow 项目飞行计划"
      }
    },
    elements: [
      markdownBlock(`**目标**\n${plan.goal}`),
      markdownBlock(`**Run ID**\n${runId}`),
      divider(),
      markdownBlock(`**成员**\n${formatList(plan.members, "TBD")}`),
      markdownBlock(`**交付物**\n${formatList(plan.deliverables, "TBD")}`),
      markdownBlock(`**截止时间**\n${plan.deadline || "TBD"}`),
      markdownBlock(`**风险**\n${formatRiskList(plan.risks)}`),
      divider(),
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `回复“${confirmationText}”后，PilotFlow 将创建 Doc、Base/Task 和交付总结。`
          }
        ]
      }
    ]
  };
}

function markdownBlock(content) {
  return {
    tag: "div",
    text: {
      tag: "lark_md",
      content
    }
  };
}

function divider() {
  return { tag: "hr" };
}

function formatList(items = [], fallback) {
  if (items.length === 0) return fallback;
  return items.map((item) => `- ${item}`).join("\n");
}

function formatRiskList(risks = []) {
  if (risks.length === 0) return "- 暂无显式风险";
  return risks.map((risk) => `- [${risk.level}] ${risk.title}`).join("\n");
}
