import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

/** Maskable-safe: important content in center 80% safe zone */
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="128" fill="#0f1419"/>
  <rect x="96" y="96" width="320" height="320" rx="64" fill="#1a2332" stroke="#3b82f6" stroke-width="8"/>
  <text x="256" y="292" text-anchor="middle" font-family="system-ui,Segoe UI,sans-serif" font-size="140" font-weight="700" fill="#3b82f6">POS</text>
</svg>`;

const buf = Buffer.from(svg);

await sharp(buf).resize(192, 192).png().toFile(join(publicDir, "pwa-192.png"));
await sharp(buf).resize(512, 512).png().toFile(join(publicDir, "pwa-512.png"));

console.log("Wrote public/pwa-192.png and public/pwa-512.png");
