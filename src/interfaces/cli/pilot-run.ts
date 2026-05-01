import { pathToFileURL } from "node:url";
import {
  renderAgentProjectInit,
  runAgentProjectInit,
  type AgentProjectInitOptions,
  type AgentProjectInitResult,
} from "./agent-project-init.js";
import { isAcceptedConfirmationText } from "../../orchestrator/confirmation-text.js";

const PRODUCT_SURFACE_FLAGS = ["--send-plan-card", "--send-entry-message", "--pin-entry-message", "--send-risk-card"];

export interface PilotRunOptions extends AgentProjectInitOptions {}

export interface PilotRunResult extends AgentProjectInitResult {
  readonly productSurfaces: {
    readonly planCard: boolean;
    readonly entryMessage: boolean;
    readonly pinnedEntry: boolean;
    readonly riskCard: boolean;
  };
}

export async function runPilotRun(options: PilotRunOptions = {}): Promise<PilotRunResult> {
  const argv = buildPilotRunArgv(options.argv ?? []);
  const result = await runAgentProjectInit({ ...options, argv });
  return {
    ...result,
    productSurfaces: {
      planCard: argv.includes("--send-plan-card"),
      entryMessage: argv.includes("--send-entry-message"),
      pinnedEntry: argv.includes("--pin-entry-message"),
      riskCard: argv.includes("--send-risk-card"),
    },
  };
}

export function buildPilotRunArgv(argv: readonly string[]): string[] {
  let next = [...argv];
  if (!hasExplicitMode(next)) {
    next.push("--dry-run");
  }

  const confirmedLiveRun = isLiveMode(next) && isAcceptedConfirmationText(valueFor(next, "--confirm") ?? "");
  const canEnableProductSurfaces = !isLiveMode(next) || confirmedLiveRun;
  if (canEnableProductSurfaces) {
    for (const flag of PRODUCT_SURFACE_FLAGS) {
      if (!next.includes(flag)) next.push(flag);
    }
  } else {
    next = next.filter((item) => !PRODUCT_SURFACE_FLAGS.includes(item));
  }

  if (!hasFlagWithValue(next, "--output")) {
    next.push("--output", defaultOutputPath(next));
  }
  return next;
}

export function renderPilotRun(result: PilotRunResult): string {
  const base = renderAgentProjectInit(result);
  const surfaces = [
    result.productSurfaces.planCard ? "plan_card" : null,
    result.productSurfaces.entryMessage ? "entry_message" : null,
    result.productSurfaces.pinnedEntry ? "pinned_entry" : null,
    result.productSurfaces.riskCard ? "risk_card" : null,
  ].filter(Boolean);

  return [
    base,
    "",
    `surfaces: ${surfaces.join(", ")}`,
    "",
    "--- Artifacts ---",
    `count: ${result.artifactCount}`,
    `log: ${result.output}`,
    "",
    "--- Next Steps ---",
    `  npm run pilot:recorder -- --input ${result.output} --output tmp/flight-recorder/latest.html`,
    `  npm run pilot:package`,
  ].join("\n");
}

function defaultOutputPath(argv: readonly string[]): string {
  return isLiveMode(argv)
    ? "tmp/runs/latest-live-run.jsonl"
    : "tmp/runs/latest-manual-run.jsonl";
}

function hasExplicitMode(argv: readonly string[]): boolean {
  return argv.includes("--live") || argv.includes("--dry-run") || valueFor(argv, "--mode") !== undefined;
}

function isLiveMode(argv: readonly string[]): boolean {
  return argv.includes("--live") || valueFor(argv, "--mode") === "live";
}

function hasFlagWithValue(argv: readonly string[], flag: string): boolean {
  return valueFor(argv, flag) !== undefined;
}

function valueFor(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === flag) return argv[index + 1];
    if (item.startsWith(`${flag}=`)) return item.slice(flag.length + 1);
  }
  return undefined;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const result = await runPilotRun({ argv });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(renderPilotRun(result));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
