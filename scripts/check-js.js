import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT_DIRS = ["scripts", "src"];
const IGNORED_DIRS = new Set([".git", "node_modules", "tmp"]);

async function collectJavaScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(path)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }

  return files;
}

function runNodeCheck(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], {
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`node --check failed: ${relative(process.cwd(), file)}`));
    });
  });
}

async function main() {
  const files = (
    await Promise.all(ROOT_DIRS.map((dir) => collectJavaScriptFiles(join(process.cwd(), dir))))
  )
    .flat()
    .sort((a, b) => relative(process.cwd(), a).localeCompare(relative(process.cwd(), b)));

  for (const file of files) {
    await runNodeCheck(file);
  }

  console.log(`Checked ${files.length} JavaScript files.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
