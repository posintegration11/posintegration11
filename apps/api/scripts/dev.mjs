import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, "..");
const repoRoot = join(__dirname, "..", "..", "..");

const candidates = [
  join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
  join(apiRoot, "node_modules", "tsx", "dist", "cli.mjs"),
];

const cli = candidates.find((p) => existsSync(p));
if (!cli) {
  console.error(
    "tsx not found. From repo root run: npm install && npm install --prefix apps/api",
  );
  process.exit(1);
}

const child = spawn(process.execPath, [cli, "watch", "src/index.ts"], {
  cwd: apiRoot,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
