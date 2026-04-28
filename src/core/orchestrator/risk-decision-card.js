export function buildRiskDecisionCard({ runId, plan, risks, summary }) {
  return {
    config: {
      wide_screen_mode: true
    },
    header: {
      template: templateForRisk(summary.highest_level),
      title: {
        tag: "plain_text",
        content: "PilotFlow 风险裁决卡"
      }
    },
    elements: [
      markdownBlock(`**目标**\n${plan.goal}`),
      markdownBlock(`**Run ID**\n${runId}`),
      markdownBlock(`**风险概览**\n- 总数: ${summary.total}\n- 待处理: ${summary.open}\n- 最高等级: ${summary.highest_level}`),
      divider(),
      markdownBlock(`**优先裁决项**\n${formatTopRisks(risks)}`),
      divider(),
      {
        tag: "action",
        actions: [
          decisionButton("确认负责人", "assign_owner", "primary", runId),
          decisionButton("调整截止时间", "adjust_deadline", "default", runId),
          decisionButton("接受并跟踪", "accept_risk", "default", runId),
          decisionButton("暂缓推进", "defer", "danger", runId)
        ]
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "当前原型会先展示裁决选项；按钮回调接入前，仍以群内文本确认作为兜底。"
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

function decisionButton(text, action, type, runId) {
  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: text
    },
    type,
    value: {
      pilotflow_card: "risk_decision",
      pilotflow_run_id: runId,
      pilotflow_action: action
    }
  };
}

function formatTopRisks(risks = []) {
  const top = risks.filter((risk) => risk.status === "open").slice(0, 5);
  if (top.length === 0) return "- 暂无待裁决风险";
  return top
    .map((risk) => `- [${risk.level}] ${risk.title}\n  - owner: ${risk.owner || "TBD"}\n  - next: ${risk.recommendation}`)
    .join("\n");
}

function templateForRisk(level) {
  if (level === "critical" || level === "high") return "red";
  if (level === "medium") return "orange";
  return "green";
}
