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
        tag: "action",
        actions: [
          actionButton("确认起飞", "confirm_takeoff", "primary", runId),
          actionButton("编辑计划", "edit_plan", "default", runId),
          actionButton("仅生成文档", "doc_only", "default", runId),
          actionButton("取消", "cancel", "danger", runId)
        ]
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `按钮回调接入前，也可以回复“${confirmationText}”继续。`
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

function actionButton(text, action, type, runId) {
  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: text
    },
    type,
    value: {
      pilotflow_card: "flight_plan",
      pilotflow_run_id: runId,
      pilotflow_action: action
    }
  };
}

function formatList(items = [], fallback) {
  if (items.length === 0) return fallback;
  return items.map((item) => `- ${item}`).join("\n");
}

function formatRiskList(risks = []) {
  if (risks.length === 0) return "- 暂无显式风险";
  return risks.map((risk) => `- [${risk.level}] ${risk.title}`).join("\n");
}
