import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Monorepo: use repo root for file tracing / avoid wrong lockfile root warning */
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
