import { execFileSync, spawn } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/**
 * Windows: `next dev` + `next build` together locks `.next` and often causes EPERM / EISDIR.
 * Port must match `package.json` dev script (default 3000). Override with `NEXT_WEB_DEV_PORT`.
 */
function win32ListenPidsOnPort(portNum) {
  try {
    const script = [
      `$p=${portNum}`,
      `$c=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue`,
      `if ($null -ne $c) { (@($c | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)) -join ' ' }`,
    ].join("; ");
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    if (!out) return [];
    return out
      .split(/\s+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function assertWin32DevServerStoppedForBuild() {
  if (process.env.NEXT_BUILD_ALLOW_DEV === "1") return;
  const webPort = parseInt(process.env.NEXT_WEB_DEV_PORT ?? "3000", 10) || 3000;
  const pids = win32ListenPidsOnPort(webPort);
  if (pids.length === 0) return;
  console.error(
    `[next-run] Port ${webPort} is already listening (PID(s): ${pids.join(", ")}). ` +
      "Stop `npm run dev` / root `npm run dev` (concurrently) before `npm run build`. " +
      "Dev + build together locks `.next` and breaks the production build on Windows. " +
      "To force anyway: NEXT_BUILD_ALLOW_DEV=1 (not recommended).",
  );
  process.exit(1);
}

/** FAT32/exFAT: Node `readlink` on regular files returns EISDIR → webpack/Next build fails (see fsutil on project drive). */
function assertWin32ProjectVolumeSupportsNextBuild() {
  if (process.env.NEXT_BUILD_SKIP_VOLUME_CHECK === "1") return;
  const m = /^([A-Za-z]):/.exec(webRoot);
  if (!m) return;
  const letter = m[1].toUpperCase();
  let out = "";
  try {
    out = execFileSync("fsutil", ["fsinfo", "volumeinfo", `${letter}:`], {
      encoding: "utf8",
      windowsHide: true,
    });
  } catch {
    return;
  }
  const fat32 = /\bFile System Name\s*:\s*FAT32\b/i.test(out);
  const exfat = /\bFile System Name\s*:\s*exFAT\b/i.test(out);
  if (!fat32 && !exfat) return;
  const fsType = fat32 ? "FAT32" : "exFAT";
  console.error(
    `[next-run] Drive ${letter}: uses ${fsType}. Next.js \`next build\` on FAT32/exFAT often fails with ` +
      "EISDIR / readlink errors (Node/webpack). From repo root try: `npm run build:web:stage` (builds under NTFS %TEMP%, copies `.next` back). " +
      "Or move the repo to NTFS (e.g. C:\\Projects\\POS), Docker (`npm run build:web:docker`), or CI. " +
      "Bypass (still likely broken): NEXT_BUILD_SKIP_VOLUME_CHECK=1",
  );
  process.exit(1);
}

/** Windows: stale or locked `.next` (e.g. trace) causes EPERM / EISDIR during `next build`. */
function envForWin32Build() {
  const env = { ...process.env };
  if (process.env.NEXT_SKIP_PREBUILD_CLEAN === "1") return env;
  const nextDir = join(webRoot, ".next");
  const had = existsSync(nextDir);
  if (!had) return env;
  try {
    rmSync(nextDir, { recursive: true, force: true });
    return env;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    try {
      const fallback = `${nextDir}.bak.${Date.now()}`;
      renameSync(nextDir, fallback);
      console.warn(`[next-run] Could not delete .next (${code}); renamed to ${fallback} — you can remove it later.`);
      return env;
    } catch (err2) {
      const alt = `.next-b${Date.now()}`;
      env.NEXT_WEB_DIST_DIR = alt;
      console.warn(
        `[next-run] .next is locked (delete/rename failed). Building to /${alt}/ instead. ` +
          "Almost always `npm run dev` / `next dev` is still running — stop it before `next build` " +
          "or you may get EPERM on .next/trace or webpack errors (e.g. EISDIR). " +
          "When idle, delete the stale `.next` folder.",
      );
      return env;
    }
  }
}

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

let args = process.argv.slice(2);
/** Render / PaaS: bind to public PORT and all interfaces */
const port = process.env.PORT;
if (args[0] === "start") {
  if (!args.includes("-H")) args = [...args, "-H", "0.0.0.0"];
  if (port && !args.includes("-p")) args = [...args, "-p", port];
}
let spawnEnv = process.env;
if (args[0] === "build" && process.platform === "win32") {
  assertWin32DevServerStoppedForBuild();
  assertWin32ProjectVolumeSupportsNextBuild();
  spawnEnv = envForWin32Build();
}
const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: webRoot,
  env: spawnEnv,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
