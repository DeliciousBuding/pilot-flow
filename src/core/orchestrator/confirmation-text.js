export const PRIMARY_CONFIRMATION_TEXT = "确认执行";
export const LEGACY_CONFIRMATION_TEXTS = ["确认起飞"];
export const ACCEPTED_CONFIRMATION_TEXTS = [PRIMARY_CONFIRMATION_TEXT, ...LEGACY_CONFIRMATION_TEXTS];

export function isAcceptedConfirmationText(value = "") {
  const normalized = String(value).trim();
  return ACCEPTED_CONFIRMATION_TEXTS.includes(normalized);
}

export function confirmationTextHint() {
  return `${PRIMARY_CONFIRMATION_TEXT}（兼容旧口令：${LEGACY_CONFIRMATION_TEXTS.join("、")}）`;
}
