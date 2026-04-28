import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const events = await readJsonl(config.input);
  const model = buildFlightRecorderModel(events);
  const html = renderHtml(model);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, html, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        run_id: model.runId,
        run_status: model.status,
        event_count: events.length,
        artifact_count: model.artifacts.length,
        tool_count: model.tools.length
      },
      null,
      2
    )
  );
}

export function buildFlightRecorderModel(events) {
  const run = events.find((event) => event.event === "run.created") || {};
  const planEvent = events.find((event) => event.event === "plan.generated") || {};
  const runId = run.run_id || planEvent.run_id || events.find((event) => event.run_id)?.run_id || "unknown-run";
  const status = deriveRunStatus(events);
  const steps = buildStepRows(events, planEvent.plan);
  const tools = buildToolRows(events);
  const artifacts = events
    .filter((event) => event.artifact)
    .map((event) => ({
      ...event.artifact,
      event: event.event,
      tool_call_id: event.tool_call_id
    }));
  const errors = events.filter((event) => event.error).map((event) => ({ event: event.event, error: event.error }));

  return {
    runId,
    status,
    mode: run.mode || "unknown",
    plan: planEvent.plan,
    steps,
    tools,
    artifacts,
    errors,
    timeline: events.map((event) => ({
      ts: event.ts,
      event: event.event,
      step_id: event.step_id,
      tool: event.tool,
      status: event.status
    }))
  };
}

function buildStepRows(events, plan = {}) {
  const rows = new Map();
  for (const step of plan.steps || []) {
    rows.set(step.id, {
      id: step.id,
      title: step.title,
      tool: step.tool || "",
      status: step.status || "pending"
    });
  }

  for (const event of events.filter((item) => item.event === "step.status_changed")) {
    const existing = rows.get(event.step_id) || { id: event.step_id, title: event.step_id, tool: "" };
    rows.set(event.step_id, {
      ...existing,
      status: event.status,
      reason: event.reason || existing.reason
    });
  }

  return [...rows.values()];
}

function buildToolRows(events) {
  const rows = new Map();
  for (const event of events.filter((item) => item.tool_call_id)) {
    const existing = rows.get(event.tool_call_id) || {
      id: event.tool_call_id,
      tool: event.tool || "",
      status: "pending"
    };

    if (event.event === "tool.called") {
      rows.set(event.tool_call_id, { ...existing, tool: event.tool, status: "called", input: event.input });
    } else if (event.event === "tool.succeeded") {
      rows.set(event.tool_call_id, { ...existing, tool: event.tool, status: "succeeded", output: event.output });
    } else if (event.event === "tool.failed") {
      rows.set(event.tool_call_id, { ...existing, tool: event.tool, status: "failed", error: event.error });
    }
  }

  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function deriveRunStatus(events) {
  if (events.some((event) => event.event === "run.completed")) return "completed";
  if (events.some((event) => event.event === "run.failed")) return "failed";
  if (events.some((event) => event.event === "run.waiting_confirmation")) return "waiting_confirmation";
  return "running";
}

function renderHtml(model) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PilotFlow Flight Recorder - ${escapeHtml(model.runId)}</title>
  <style>
    :root { color-scheme: light; --ink: #172033; --muted: #5f6b7a; --line: #d9dee7; --fill: #f6f8fb; --blue: #1c64f2; --green: #0f8f5f; --red: #c2412d; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: #ffffff; }
    header { padding: 32px 40px 24px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, #f9fbff 0%, #ffffff 100%); }
    main { padding: 28px 40px 40px; display: grid; gap: 28px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 18px; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); line-height: 1.55; }
    .meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 5px 10px; background: white; font-size: 13px; }
    .status-completed { color: var(--green); border-color: #b8e3d0; background: #f0fbf6; }
    .status-failed { color: var(--red); border-color: #f0c1b8; background: #fff5f2; }
    section { border: 1px solid var(--line); border-radius: 8px; padding: 18px; background: white; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 650; background: var(--fill); }
    tr:last-child td { border-bottom: 0; }
    code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px; color: #27364f; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .mono { white-space: pre-wrap; word-break: break-word; }
    @media (max-width: 860px) { header, main { padding-left: 20px; padding-right: 20px; } .grid { grid-template-columns: 1fr; } table { font-size: 13px; } }
  </style>
</head>
<body>
  <header>
    <h1>PilotFlow Flight Recorder</h1>
    <p>${escapeHtml(model.plan?.goal || "Recorded PilotFlow run")}</p>
    <div class="meta">
      <span class="pill"><strong>Run</strong> ${escapeHtml(model.runId)}</span>
      <span class="pill status-${escapeHtml(model.status)}"><strong>Status</strong> ${escapeHtml(model.status)}</span>
      <span class="pill"><strong>Mode</strong> ${escapeHtml(model.mode)}</span>
      <span class="pill"><strong>Artifacts</strong> ${model.artifacts.length}</span>
      <span class="pill"><strong>Tools</strong> ${model.tools.length}</span>
    </div>
  </header>
  <main>
    <div class="grid">
      ${section("Plan", renderPlan(model.plan))}
      ${section("Steps", renderRows(model.steps, ["id", "title", "tool", "status", "reason"]))}
    </div>
    ${section("Artifacts", renderRows(model.artifacts, ["type", "title", "status", "owner", "due_date", "risk_level", "external_id", "url"]))}
    ${section("Tool Calls", renderRows(model.tools, ["id", "tool", "status"]))}
    ${section("Timeline", renderRows(model.timeline, ["ts", "event", "step_id", "tool", "status"]))}
    ${model.errors.length > 0 ? section("Errors", renderJson(model.errors)) : ""}
  </main>
</body>
</html>
`;
}

function section(title, body) {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function renderPlan(plan = {}) {
  return `<table><tbody>
    <tr><th>Goal</th><td>${escapeHtml(plan.goal || "")}</td></tr>
    <tr><th>Deadline</th><td>${escapeHtml(plan.deadline || "")}</td></tr>
    <tr><th>Members</th><td>${escapeHtml((plan.members || []).join(", "))}</td></tr>
    <tr><th>Deliverables</th><td>${escapeHtml((plan.deliverables || []).join(", "))}</td></tr>
  </tbody></table>`;
}

function renderRows(rows, columns) {
  if (!rows.length) return "<p>No records.</p>";
  return `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${columns.map((column) => `<td>${renderCell(row[column])}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function renderCell(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "object") return `<code class="mono">${escapeHtml(JSON.stringify(value, null, 2))}</code>`;
  return escapeHtml(String(value));
}

function renderJson(value) {
  return `<code class="mono">${escapeHtml(JSON.stringify(value, null, 2))}</code>`;
}

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }

  return {
    help: args.help === true || args.h === true,
    input: resolve(typeof args.input === "string" ? args.input : "tmp/runs/latest-manual-run.jsonl"),
    output: resolve(typeof args.output === "string" ? args.output : "tmp/flight-recorder/latest.html")
  };
}

function buildUsage() {
  return `Usage:
  npm run flight:recorder
  npm run flight:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html

Options:
  --input <path>   JSONL run log path.
  --output <path>  HTML output path.
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
