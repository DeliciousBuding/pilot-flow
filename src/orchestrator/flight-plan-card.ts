import type { ProjectInitPlan } from "../types/plan.js";

export function buildFlightPlanCard({ runId, plan, confirmationText = "确认起飞" }: { readonly runId: string; readonly plan: ProjectInitPlan; readonly confirmationText?: string }): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: { template: "blue", title: { tag: "plain_text", content: "PilotFlow 项目飞行计划" } },
    elements: [
      markdownBlock(`**目标**\n${plan.goal}`),
      markdownBlock(`**Run ID**\n${runId}`),
      { tag: "hr" },
      markdownBlock(`**成员**\n${formatList(plan.members, "TBD")}`),
      markdownBlock(`**交付物**\n${formatList(plan.deliverables, "TBD")}`),
      markdownBlock(`**截止时间**\n${plan.deadline || "TBD"}`),
      markdownBlock(`**风险**\n${plan.risks.length === 0 ? "- 暂无显式风险" : plan.risks.map((risk) => `- [${risk.level}] ${risk.title}`).join("\n")}`),
      { tag: "hr" },
      {
        tag: "action",
        actions: [
          button("确认起飞", "confirm_takeoff", "primary", runId),
          button("编辑计划", "edit_plan", "default", runId),
          button("仅生成文档", "doc_only", "default", runId),
          button("取消", "cancel", "danger", runId),
        ],
      },
      { tag: "note", elements: [{ tag: "plain_text", content: `按钮回调接入前，也可以回复“${confirmationText}”继续。` }] },
    ],
  };
}

function markdownBlock(content: string): Record<string, unknown> {
  return { tag: "div", text: { tag: "lark_md", content } };
}

function button(text: string, action: string, type: string, runId: string): Record<string, unknown> {
  return { tag: "button", text: { tag: "plain_text", content: text }, type, value: { pilotflow_card: "flight_plan", pilotflow_run_id: runId, pilotflow_action: action } };
}

function formatList(items: readonly string[], fallback: string): string {
  return items.length === 0 ? fallback : items.map((item) => `- ${item}`).join("\n");
}
