export const PRIMARY_CONFIRMATION_TEXT = "确认执行";
export const LEGACY_CONFIRMATION_TEXTS = ["确认起飞"] as const;
export const ACCEPTED_CONFIRMATION_TEXTS = [PRIMARY_CONFIRMATION_TEXT, ...LEGACY_CONFIRMATION_TEXTS] as const;

export function isAcceptedConfirmationText(value = ""): boolean {
  return ACCEPTED_CONFIRMATION_TEXTS.includes(value.trim() as (typeof ACCEPTED_CONFIRMATION_TEXTS)[number]);
}

export function confirmationTextHint(): string {
  return `${PRIMARY_CONFIRMATION_TEXT}（兼容旧口令：${LEGACY_CONFIRMATION_TEXTS.join("、")}）`;
}
