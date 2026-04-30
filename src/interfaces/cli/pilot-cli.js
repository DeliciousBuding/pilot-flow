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
  "agent-smoke": {
    description: "Run the TypeScript gateway and Agent dry-run smoke path.",
    steps: [{ script: "pilot:agent-smoke", args: [] }]
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
    "  npm run pilot:agent-smoke -- --input \"@PilotFlow 建立答辩项目空间\"",
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
    const args = index === command.steps.length - 1 && passthroughArgs.length > 0 ? ["--", ...passthroughArgs] : step.args;
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

export { COMMANDS, main, renderHelp, splitArgs };
