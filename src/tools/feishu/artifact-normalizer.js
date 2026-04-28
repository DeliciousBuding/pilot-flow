export function normalizeFeishuArtifacts(tool, input, output, context) {
  const status = output?.dry_run ? "planned" : "created";
  const runId = context.runId;

  if (tool === "doc.create") {
    return [normalizeDocArtifact(input, output, runId, status)];
  }

  if (tool === "base.write") {
    return normalizeBaseArtifacts(input, output, runId, status);
  }

  if (tool === "task.create") {
    return [normalizeTaskArtifact(input, output, runId, status)];
  }

  if (tool === "im.send") {
    return [normalizeMessageArtifact(input, output, runId, status)];
  }

  if (tool === "entry.send") {
    return [normalizeMessageArtifact(input, output, runId, status, "entry_message", "PilotFlow project entry message")];
  }

  if (tool === "entry.pin") {
    return [normalizePinnedMessageArtifact(input, output, runId, status)];
  }

  if (tool === "card.send") {
    return [normalizeCardArtifact(input, output, runId, status)];
  }

  return [];
}

function normalizeDocArtifact(input, output, runId, status) {
  const document = getPath(output, ["json", "data", "document"]) || getPath(output, ["json", "document"]) || {};
  const externalId = document.document_id || document.documentId || document.token;

  return cleanArtifact({
    id: externalId ? `doc-${externalId}` : `artifact-${runId}-doc`,
    type: "doc",
    title: input.title || markdownTitle(input.markdown) || "Project brief document",
    status,
    url: document.url,
    external_id: externalId
  });
}

function normalizeBaseArtifacts(input, output, runId, status) {
  const body = input.body || {};
  const fields = body.fields || [];
  const rows = body.rows || [];
  const recordIds =
    getPath(output, ["json", "data", "record_id_list"]) ||
    getPath(output, ["json", "record_id_list"]) ||
    getPath(output, ["json", "data", "records"])?.map((record) => record.record_id || record.id) ||
    [];

  const typeIndex = fields.indexOf("type");
  const titleIndex = fields.indexOf("title");
  const ownerIndex = fields.indexOf("owner");
  const dueDateIndex = fields.indexOf("due_date");
  const statusIndex = fields.indexOf("status");
  const riskLevelIndex = fields.indexOf("risk_level");
  const sourceRunIndex = fields.indexOf("source_run");
  const sourceMessageIndex = fields.indexOf("source_message");
  const urlIndex = fields.indexOf("url");
  const rowCount = Math.max(rows.length, recordIds.length, 1);

  return Array.from({ length: rowCount }, (_, index) => {
    const row = rows[index] || [];
    const externalId = recordIds[index];
    const title = row[titleIndex] || `Base record ${index + 1}`;

    return cleanArtifact({
      id: externalId ? `base-record-${externalId}` : `artifact-${runId}-base-${index + 1}`,
      type: "base_record",
      title,
      status: row[statusIndex] === "failed" ? "failed" : status,
      external_id: externalId,
      record_type: row[typeIndex],
      owner: row[ownerIndex],
      due_date: row[dueDateIndex],
      risk_level: row[riskLevelIndex],
      source_run: row[sourceRunIndex],
      source_message: row[sourceMessageIndex],
      url: row[urlIndex]
    });
  });
}

function normalizeTaskArtifact(input, output, runId, status) {
  const task = getPath(output, ["json", "data", "task"]) || getPath(output, ["json", "task"]) || getPath(output, ["json", "data"]) || {};
  const externalId = task.guid || task.task_guid || task.task_id || task.id;

  return cleanArtifact({
    id: externalId ? `task-${externalId}` : `artifact-${runId}-task`,
    type: "task",
    title: input.summary || task.summary || "PilotFlow task",
    status,
    url: task.url || task.app_link || task.applink,
    external_id: externalId,
    owner: input.owner,
    assignee: input.assignee,
    assignee_source: input.assignee_source
  });
}

function normalizeMessageArtifact(input, output, runId, status, type = "message", fallbackTitle = "PilotFlow summary message") {
  const message =
    getPath(output, ["json", "data", "message"]) ||
    getPath(output, ["json", "message"]) ||
    getPath(output, ["json", "data"]) ||
    {};
  const externalId = message.message_id || message.messageId || message.id;

  return cleanArtifact({
    id: externalId ? `${type}-${externalId}` : `artifact-${runId}-${type}`,
    type,
    title: input.text ? input.text.slice(0, 80) : fallbackTitle,
    status,
    external_id: externalId
  });
}

function normalizeCardArtifact(input, output, runId, status) {
  const message =
    getPath(output, ["json", "data", "message"]) ||
    getPath(output, ["json", "message"]) ||
    getPath(output, ["json", "data"]) ||
    {};
  const externalId = message.message_id || message.messageId || message.id;
  const title = input.title || getPath(input, ["card", "header", "title", "content"]) || "PilotFlow card";

  return cleanArtifact({
    id: externalId ? `card-${externalId}` : `artifact-${runId}-card`,
    type: "card",
    title,
    status,
    external_id: externalId
  });
}

function normalizePinnedMessageArtifact(input, output, runId, status) {
  const pin = getPath(output, ["json", "data", "pin"]) || getPath(output, ["json", "pin"]) || getPath(output, ["json", "data"]) || {};
  const externalId = pin.message_id || input.messageId;

  return cleanArtifact({
    id: externalId ? `pin-${externalId}` : `artifact-${runId}-pin`,
    type: "pinned_message",
    title: input.title || "Pinned project entry message",
    status,
    external_id: externalId,
    message_id: externalId,
    chat_id: pin.chat_id,
    created_at: pin.create_time
  });
}

function markdownTitle(markdown = "") {
  const titleLine = markdown.split(/\r?\n/).find((line) => line.startsWith("# "));
  return titleLine?.replace(/^#\s+/, "").trim();
}

function getPath(value, path) {
  return path.reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), value);
}

function cleanArtifact(artifact) {
  return Object.fromEntries(Object.entries(artifact).filter(([, value]) => value !== undefined && value !== ""));
}
