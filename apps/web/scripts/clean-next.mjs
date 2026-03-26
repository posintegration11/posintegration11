/**
 * Remove apps/web/.next (build cache). Use when Next reports EPERM on .next/trace on Windows.
 */
import { existsSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(webRoot, ".next");

if (!existsSync(nextDir)) {
  console.log("[clean-next] No .next folder; nothing to do.");
  process.exit(0);
}

try {
  rmSync(nextDir, { recursive: true, force: true });
  console.log("[clean-next] Removed .next");
} catch (err) {
  try {
    const fallback = `${nextDir}.bak.${Date.now()}`;
    renameSync(nextDir, fallback);
    console.warn(`[clean-next] Renamed locked .next to ${fallback} (remove manually when unlocked).`);
  } catch (err2) {
    console.error(
      "[clean-next] Failed — stop `npm run dev`, close programs using .next, then retry.\n",
      err,
      err2,
    );
    process.exit(1);
  }
}
