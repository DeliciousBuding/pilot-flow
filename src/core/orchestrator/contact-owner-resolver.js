export function resolveContactSearchAssignee(owner, output = {}) {
  if (!owner) {
    return unresolved(owner, "missing_owner");
  }

  if (output.dry_run) {
    return unresolved(owner, "dry_run", {
      source: "contact_lookup_dry_run",
      command: output.command
    });
  }

  const json = output.json || {};
  if (isApiError(json)) {
    return unresolved(owner, "api_error", {
      reason: json.msg || json.message || `code ${json.code}`
    });
  }

  const candidates = extractContactCandidates(json);
  if (candidates.length === 0) {
    return unresolved(owner, "no_match", { candidate_count: 0 });
  }

  const normalizedOwner = normalizeContactText(owner);
  const exactMatches = candidates.filter((candidate) =>
    candidate.searchable.some((value) => normalizeContactText(value) === normalizedOwner)
  );

  if (exactMatches.length === 1) {
    return matched(owner, exactMatches[0], "contact_lookup_exact", candidates.length);
  }

  if (exactMatches.length > 1) {
    return unresolved(owner, "ambiguous_exact_match", {
      candidate_count: candidates.length,
      matched_candidates: exactMatches.map(publicCandidate)
    });
  }

  if (candidates.length === 1) {
    return matched(owner, candidates[0], "contact_lookup_unique", candidates.length);
  }

  return unresolved(owner, "ambiguous_search_result", {
    candidate_count: candidates.length,
    matched_candidates: candidates.slice(0, 5).map(publicCandidate)
  });
}

export function extractContactCandidates(json = {}) {
  const users =
    getPath(json, ["data", "users"]) ||
    getPath(json, ["data", "items"]) ||
    getPath(json, ["data", "user_list"]) ||
    getPath(json, ["users"]) ||
    getPath(json, ["items"]) ||
    (Array.isArray(json.data) ? json.data : []);

  if (!Array.isArray(users)) return [];

  return users
    .map((user) => normalizeContactCandidate(user))
    .filter((candidate) => candidate.open_id);
}

function normalizeContactCandidate(user = {}) {
  const openId = user.open_id || user.openId || "";
  const name = user.name || user.display_name || user.displayName || user.en_name || user.enName || user.nickname || "";
  const email = user.email || user.enterprise_email || user.enterpriseEmail || "";
  const mobile = user.mobile || user.mobile_phone || user.mobilePhone || "";
  const searchable = [
    name,
    user.name,
    user.display_name,
    user.displayName,
    user.en_name,
    user.enName,
    user.nickname,
    email,
    mobile
  ].filter(Boolean);

  return {
    open_id: openId,
    name,
    email,
    searchable
  };
}

function matched(owner, candidate, source, candidateCount) {
  return {
    owner,
    assignee: candidate.open_id,
    source,
    contact_lookup: {
      status: "matched",
      source,
      candidate_count: candidateCount,
      matched_candidate: publicCandidate(candidate)
    }
  };
}

function unresolved(owner, status, details = {}) {
  return {
    owner,
    assignee: "",
    source: details.source || "contact_lookup_unresolved",
    contact_lookup: {
      status,
      ...details
    }
  };
}

function publicCandidate(candidate) {
  return {
    open_id: candidate.open_id,
    name: candidate.name,
    email: candidate.email
  };
}

function normalizeContactText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isApiError(json) {
  return json && typeof json.code === "number" && json.code !== 0;
}

function getPath(value, path) {
  return path.reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), value);
}
