import type { Artifact } from "../types/artifact.js";

export function markdownBlock(text: string): { tag: "markdown"; content: string } {
  return { tag: "markdown", content: text };
}

export function divider(): { tag: "hr" } {
  return { tag: "hr" };
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

export function formatArtifactTarget(typeOrArtifact: string | Artifact, title?: string, url?: string): string {
  const artifact =
    typeof typeOrArtifact === "string"
      ? { type: typeOrArtifact, title: title ?? typeOrArtifact, url, external_id: "" }
      : typeOrArtifact;
  const label = artifact.title ?? artifact.type;
  if (artifact.url) return `${label} - ${artifact.url}`;
  if (artifact.external_id) return `${label} (${artifact.external_id})`;
  return label;
}

export function formatRecordIds(idsOrArtifacts: readonly string[] | readonly Artifact[], max = 3): string {
  const ids = idsOrArtifacts
    .map((item) => (typeof item === "string" ? item : item.external_id))
    .filter((item): item is string => item.length > 0);
  if (ids.length === 0) return "planned";

  const visible = ids.slice(0, max).join(", ");
  return ids.length <= max ? visible : `${visible}, ...`;
}
