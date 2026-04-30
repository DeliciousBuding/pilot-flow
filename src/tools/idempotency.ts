import { createHash } from "node:crypto";

export interface BuildToolIdempotencyKeyOptions {
  readonly runId: string;
  readonly tool: string;
  readonly sequence: number | string;
}

export function buildToolIdempotencyKey({ runId, tool, sequence }: BuildToolIdempotencyKeyOptions): string {
  const toolSlug = String(tool).replaceAll(".", "-").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20) || "tool";
  const sequenceSlug = String(sequence).replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 6) || "0";
  const hash = createHash("sha256").update(`${runId}:${tool}:${sequence}`).digest("hex").slice(0, 16);
  return `pf-${toolSlug}-${sequenceSlug}-${hash}`;
}
