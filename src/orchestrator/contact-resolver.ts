import type { TaskAssignee } from "./assignee-resolver.js";

export function resolveContactAssignee(owner: string, output: Record<string, unknown> = {}): TaskAssignee {
  if (!owner) return unresolved(owner, "missing_owner");
  if (output.dry_run) return unresolved(owner, "dry_run", { source: "contact_lookup_unresolved", command: output.command });
  const json = objectValue(output.json) ?? output;
  if (typeof json.code === "number" && json.code !== 0) return unresolved(owner, "api_error", { reason: json.msg ?? json.message ?? `code ${json.code}` });
  const candidates = extractContactCandidates(json);
  if (candidates.length === 0) return unresolved(owner, "no_match", { candidate_count: 0 });
  const exact = candidates.filter((candidate) => candidate.searchable.some((value) => normalize(value) === normalize(owner)));
  if (exact.length === 1) return matched(owner, exact[0]!, "contact_lookup_exact", candidates.length);
  if (exact.length > 1) return unresolved(owner, "ambiguous_exact_match", { candidate_count: candidates.length, matched_candidates: exact.map(publicCandidate) });
  if (candidates.length === 1) return matched(owner, candidates[0]!, "contact_lookup_unique", candidates.length);
  return unresolved(owner, "ambiguous_search_result", { candidate_count: candidates.length, matched_candidates: candidates.slice(0, 5).map(publicCandidate) });
}

interface ContactCandidate {
  readonly open_id: string;
  readonly name: string;
  readonly email: string;
  readonly searchable: readonly string[];
}

function extractContactCandidates(json: Record<string, unknown>): readonly ContactCandidate[] {
  const users = arrayPath(json, ["data", "users"]) ?? arrayPath(json, ["data", "items"]) ?? arrayPath(json, ["users"]) ?? arrayPath(json, ["items"]) ?? (Array.isArray(json.data) ? json.data : []);
  return users.map((user) => normalizeContactCandidate(objectValue(user) ?? {})).filter((candidate) => candidate.open_id);
}

function normalizeContactCandidate(user: Record<string, unknown>): ContactCandidate {
  const openId = stringField(user, "open_id") || stringField(user, "openId");
  const name = stringField(user, "name") || stringField(user, "display_name") || stringField(user, "displayName") || stringField(user, "en_name") || stringField(user, "nickname");
  const email = stringField(user, "email") || stringField(user, "enterprise_email") || stringField(user, "enterpriseEmail");
  const searchable = [name, email, stringField(user, "mobile"), stringField(user, "mobile_phone")].filter(Boolean);
  return { open_id: openId, name, email, searchable };
}

function matched(owner: string, candidate: ContactCandidate, source: TaskAssignee["source"], candidateCount: number): TaskAssignee {
  return { owner, assignee: candidate.open_id, source, contact_lookup: { status: "matched", source, candidate_count: candidateCount, matched_candidate: publicCandidate(candidate) } };
}

function unresolved(owner: string, status: string, details: Record<string, unknown> = {}): TaskAssignee {
  return { owner, assignee: "", source: "contact_lookup_unresolved", contact_lookup: { status, ...details } };
}

function publicCandidate(candidate: ContactCandidate): Record<string, string> {
  return { open_id: candidate.open_id, name: candidate.name, email: candidate.email };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayPath(value: Record<string, unknown>, path: readonly string[]): unknown[] | undefined {
  const result = path.reduce<unknown>((current, key) => objectValue(current)?.[key], value);
  return Array.isArray(result) ? result : undefined;
}

function stringField(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === "string" ? value[key] : "";
}
