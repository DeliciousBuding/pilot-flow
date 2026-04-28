import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { handleCardCallback } from "../orchestrator/card-callback-handler.js";

export class CardEventListener {
  constructor({
    profile = "pilotflow-contest",
    dryRun = false,
    maxEvents = 0,
    timeoutMs = 0,
    onEvent,
    onCallback,
    onError,
    onTrigger
  } = {}) {
    this.profile = profile;
    this.dryRun = dryRun;
    this.maxEvents = normalizePositiveInteger(maxEvents);
    this.timeoutMs = normalizePositiveInteger(timeoutMs);
    this.onEvent = onEvent || (() => {});
    this.onCallback = onCallback || (() => {});
    this.onError = onError || (() => {});
    this.onTrigger = onTrigger || (() => {});
    this.child = null;
    this.stopped = false;
    this.eventCount = 0;
    this.timeoutHandle = null;
  }

  start() {
    const args = buildSubscribeArgs(this.profile);
    const resolved = resolveExecutable("lark-cli", args);

    this.child = spawn(resolved.bin, resolved.args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });

    const rl = createInterface({ input: this.child.stdout });

    rl.on("line", (line) => {
      if (this.stopped) return;
      this.handleLine(line);
    });

    this.child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        this.onEvent({ type: "lark_cli_stderr", message: text });
      }
    });

    this.child.on("error", (error) => {
      this.onError(error);
    });

    this.child.on("close", (code) => {
      if (!this.stopped) {
        this.onEvent({ type: "lark_cli_exit", code });
      }
    });

    if (this.timeoutMs > 0) {
      this.timeoutHandle = setTimeout(() => {
        if (this.stopped) return;
        this.onEvent({ type: "listener_timeout", timeout_ms: this.timeoutMs, event_count: this.eventCount });
        this.stop();
      }, this.timeoutMs);
      this.timeoutHandle.unref?.();
    }

    this.onEvent({
      type: "listener_started",
      profile: this.profile,
      dryRun: this.dryRun,
      max_events: this.maxEvents,
      timeout_ms: this.timeoutMs,
      pid: this.child.pid
    });
  }

  stop() {
    this.stopped = true;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }
  }

  handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed || this.stopped) return;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      this.onEvent({ type: "parse_error", raw: trimmed.slice(0, 200) });
      return;
    }

    this.eventCount += 1;
    this.onEvent({
      type: "event_received",
      event_type: parsed.event_type || parsed.type || "unknown",
      event_count: this.eventCount,
      raw: parsed
    });

    const callback = handleCardCallback(parsed);
    this.onCallback(callback);

    if (callback.ok && callback.decision.status === "approved") {
      void Promise.resolve()
        .then(() => this.onTrigger(callback))
        .catch((error) => {
          this.onEvent({ type: "trigger_failed", error: { message: error.message }, callback });
          this.onError(error);
        });
    }

    this.stopIfMaxEventsReached();
  }

  stopIfMaxEventsReached() {
    if (this.maxEvents > 0 && this.eventCount >= this.maxEvents) {
      this.onEvent({ type: "listener_max_events_reached", max_events: this.maxEvents, event_count: this.eventCount });
      this.stop();
    }
  }
}

function buildSubscribeArgs(profile) {
  const args = ["event", "+subscribe", "--as", "bot", "--event-types", "card.action.trigger", "--compact"];
  if (profile) args.push("--profile", profile);
  return args;
}

function resolveExecutable(bin, args) {
  if (process.platform !== "win32") {
    return { bin, args };
  }

  const cliScript = process.env.APPDATA
    ? join(process.env.APPDATA, "npm", "node_modules", "@larksuite", "cli", "scripts", "run.js")
    : undefined;
  if (cliScript && existsSync(cliScript)) {
    return { bin: "node", args: [cliScript, ...args] };
  }

  return { bin: "cmd.exe", args: ["/d", "/s", "/c", `${bin}.cmd`, ...args] };
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
