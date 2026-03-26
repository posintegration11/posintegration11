import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  /** Public web origin for verification links (no trailing slash), e.g. https://app.example.com */
  APP_PUBLIC_URL: z.string().url().optional().default("http://localhost:3000"),
  /** Comma-separated emails allowed to use /platform APIs when role is SUPER_ADMIN */
  PLATFORM_ADMIN_EMAILS: z.string().default("platform@pos.local"),
  /** Optional SMTP (if unset, verification emails are logged in dev) */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Must be a valid email string; `localhost` TLD fails Zod email — use example.com or your domain */
  SMTP_FROM: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email().optional().default("noreply@example.com"),
  ),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      console.error(parsed.error.flatten().fieldErrors);
      throw new Error("Invalid environment variables");
    }
    cached = parsed.data;
  }
  return cached;
}

export function platformAdminEmails(): string[] {
  return getEnv()
    .PLATFORM_ADMIN_EMAILS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
