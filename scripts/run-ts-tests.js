import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";

const root = join(process.cwd(), "dist", "tests");

async function collectTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTests(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function runNodeTest(files) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", ...files], { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`TS tests failed (${files.map((file) => relative(process.cwd(), file)).join(", ")})`));
    });
  });
}

const files = await collectTests(root);
if (files.length === 0) {
  console.log("No compiled TS tests found.");
} else {
  await runNodeTest(files);
}
