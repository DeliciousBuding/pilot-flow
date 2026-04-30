import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const COMMANDS = {
  check: {
    description: "Run the full local syntax and unit validation suite.",
    steps: [{ script: "check", args: [] }]
  },
  demo: {
    description: "Run the manual PilotFlow demo entry.",
    steps: [{ script: "pilot:demo:run", args: [] }]
  },
  listen: {
    description: "Run the bounded Feishu card listener.",
    steps: [{ script: "pilot:listen:cards", args: [] }]
  },
  recorder: {
    description: "Render a Flight Recorder HTML view.",
    steps: [{ script: "pilot:recorder:render", args: [] }]
  },
  doctor: {
    description: "Check local PilotFlow runtime requirements without printing secrets.",
    steps: [{ script: "pilot:doctor:run", args: [] }]
  },
  "live-check": {
    description: "Check live Feishu targets before running PilotFlow writes.",
    steps: [{ script: "pilot:live-check", args: [] }]
  },
  "callback-proof": {
    description: "Capture proof that Feishu card callback events reach PilotFlow.",
    steps: [{ script: "pilot:callback-proof", args: [] }]
  },
  gateway: {
    description: "Run the TypeScript Feishu IM and card gateway bridge.",
    steps: [{ script: "pilot:gateway", args: [] }]
  },
  run: {
    description: "Run the product-grade TypeScript PilotFlow project flow.",
    steps: [{ script: "pilot:run", args: [] }]
  },
  "agent-smoke": {
    description: "Run the TypeScript gateway and Agent dry-run smoke path.",
    steps: [{ script: "pilot:agent-smoke", args: [] }]
  },
  "project-init-ts": {
    description: "Run the TypeScript project-init bridge with live confirmation guards.",
    steps: [{ script: "pilot:project-init-ts", args: [] }]
  },
  status: {
    description: "Regenerate the delivery index status page.",
    steps: [
      {
        script: "review:delivery-index",
        args: ["--", "--output", "tmp/demo-delivery/DELIVERY_INDEX.md"]
      }
    ]
  },
  package: {
    description: "Regenerate the core machine-review package.",
    steps: [
      {
        script: "review:readiness",
        args: ["--", "--output", "tmp/demo-readiness/DEMO_READINESS.md"]
      },
      {
        script: "review:judge",
        args: ["--", "--output", "tmp/demo-judge/JUDGE_REVIEW.md"]
      },
      {
        script: "review:submission",
        args: ["--", "--output", "tmp/demo-submission/SUBMISSION_PACK.md"]
      },
      {
        script: "review:retrospective",
        args: ["--", "--output", "tmp/run-retrospective/RUN_RETROSPECTIVE.md"],
        acceptsSharedInput: true
      },
      {
        script: "review:retrospective-eval",
        args: ["--", "--output", "tmp/retrospective-eval/RETROSPECTIVE_EVAL.md"],
        acceptsSharedInput: true
      },
      {
        script: "review:delivery-index",
        args: ["--", "--output", "tmp/demo-delivery/DELIVERY_INDEX.md"]
      }
    ]
  },
  audit: {
    description: "Run the public-material safety audit.",
    steps: [
      {
        script: "review:safety-audit",
        args: ["--", "--output", "tmp/demo-safety/SAFETY_AUDIT.md"]
      }
    ]
  }
};

function renderHelp() {
  const lines = [
    "PilotFlow command facade",
    "",
    "Usage:",
    "  node src/interfaces/cli/pilot-cli.js <command> [-- extra args]",
    "",
    "Commands:"
  ];

  for (const [name, command] of Object.entries(COMMANDS)) {
    lines.push(`  ${name.padEnd(8)} ${command.description}`);
  }

  lines.push(
    "",
    "Examples:",
    "  npm run pilot:demo -- --send-plan-card --no-auto-confirm",
    "  npm run pilot:recorder -- --input tmp/runs/latest-manual-run.jsonl --output tmp/flight-recorder/latest.html",
    "  npm run pilot:doctor",
    "  npm run pilot:live-check -- --json",
    "  npm run pilot:callback-proof -- --timeout 60s",
    "  npm run pilot:gateway -- --dry-run --max-events 1",
    "  npm run pilot:run -- --dry-run --input \"目标: 建立答辩项目空间\"",
    "  npm run pilot:agent-smoke -- --input \"@PilotFlow 建立答辩项目空间\"",
    "  npm run pilot:project-init-ts -- --dry-run --send-entry-message",
    "  npm run pilot:project-init-ts -- --live --confirm \"确认执行\" --send-entry-message",
    "  npm run pilot:status",
    "  npm run pilot:package",
    "  npm run pilot:audit"
  );
  return lines.join("\n");
}

function splitArgs(argv) {
  const commandName = argv[0] ?? "help";
  const passthroughArgs = argv.slice(1);
  return {
    commandName,
    passthroughArgs: passthroughArgs[0] === "--" ? passthroughArgs.slice(1) : passthroughArgs
  };
}

function runNpmScript(script, args) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "cmd.exe" : npmCommand;
    const commandArgs =
      process.platform === "win32"
        ? ["/d", "/s", "/c", npmCommand, "run", script, ...args]
        : ["run", script, ...args];

    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`npm run ${script} exited with code ${code}`));
    });
  });
}

function buildStepArgs({ command, stepIndex, passthroughArgs = [] }) {
  const step = command.steps[stepIndex];
  if (!step) throw new Error(`Unknown step index: ${stepIndex}`);

  if (command.steps.length === 1 && passthroughArgs.length > 0) {
    return ["--", ...passthroughArgs];
  }

  const sharedInput = extractInputArgs(passthroughArgs);
  if (step.acceptsSharedInput && sharedInput.length > 0) {
    return [...step.args, ...sharedInput];
  }

  return step.args;
}

function extractInputArgs(args) {
  const inputArgs = [];
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--input") {
      const value = args[index + 1];
      if (value && !value.startsWith("--")) {
        inputArgs.push(item, value);
        index += 1;
      }
      continue;
    }
    if (item.startsWith("--input=")) inputArgs.push(item);
  }
  return inputArgs;
}

async function main(argv = process.argv.slice(2)) {
  const { commandName, passthroughArgs } = splitArgs(argv);

  if (commandName === "help" || commandName === "--help" || commandName === "-h") {
    console.log(renderHelp());
    return;
  }

  const command = COMMANDS[commandName];
  if (!command) {
    console.error(`Unknown PilotFlow command: ${commandName}`);
    console.error("");
    console.error(renderHelp());
    process.exitCode = 1;
    return;
  }

  console.log(`PilotFlow: ${command.description}`);

  for (const [index, step] of command.steps.entries()) {
    const args = buildStepArgs({ command, stepIndex: index, passthroughArgs });
    console.log(`\n> npm run ${step.script}${args.length > 0 ? ` ${args.join(" ")}` : ""}`);
    await runNpmScript(step.script, args);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { COMMANDS, buildStepArgs, main, renderHelp, splitArgs };
