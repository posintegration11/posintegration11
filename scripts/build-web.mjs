/**
 * Windows + FAT32/exFAT: run `build:web:stage` (NTFS temp). Else: normal `apps/web` build.
 * Non-Windows: always normal build (no fsutil).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps", "web");

function run(cmd, args, opts = {}) {
  execSync([cmd, ...args].join(" "), { cwd: root, stdio: "inherit", ...opts });
}

if (!existsSync(webDir)) {
  console.error("[build-web] Missing apps/web");
  process.exit(1);
}

if (process.platform !== "win32") {
  run("npm", ["run", "build", "--prefix", "apps/web"]);
  process.exit(0);
}

const m = /^([A-Za-z]):\\/i.exec(path.resolve(webDir));
if (!m) {
  run("npm", ["run", "build", "--prefix", "apps/web"]);
  process.exit(0);
}

const letter = m[1].toUpperCase();
let out = "";
try {
  out = execSync(`fsutil fsinfo volumeinfo ${letter}:`, {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch {
  run("npm", ["run", "build", "--prefix", "apps/web"]);
  process.exit(0);
}

const fat =
  /\bFile System Name\s*:\s*FAT32\b/i.test(out) || /\bFile System Name\s*:\s*exFAT\b/i.test(out);

if (fat) {
  console.error("[build-web] FAT32/exFAT volume — running npm run build:web:stage\n");
  run("npm", ["run", "build:web:stage"]);
} else {
  run("npm", ["run", "build", "--prefix", "apps/web"]);
}
