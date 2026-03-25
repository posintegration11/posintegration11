import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function resolveNextBin() {
  try {
    return require.resolve("next/dist/bin/next", { paths: [webRoot] });
  } catch {
    for (const name of ["next", "next.js"]) {
      const p = join(webRoot, "node_modules", "next", "dist", "bin", name);
      if (existsSync(p)) return p;
    }
    return null;
  }
}

const nextBin = resolveNextBin();
if (!nextBin) {
  console.error("Next not installed. Run: npm install --prefix apps/web");
  process.exit(1);
}

const args = process.argv.slice(2);
const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: webRoot,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
