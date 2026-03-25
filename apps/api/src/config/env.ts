import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
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
