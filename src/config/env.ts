import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),
  RESET_TOKEN_SECRET: z.string().min(1),
  RESET_TOKEN_EXPIRES_MINUTES: z.coerce.number().int().positive().default(60),
  BCRYPT_ROUNDS: z.coerce.number().int().min(12).default(12),
  COOKIE_NAME: z.string().default("refresh_token"),
  COOKIE_SECURE: booleanFromEnv.default(false),
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  EMAIL_FROM: z.string().default("El Pedregal <no-reply@elpedregal.com>"),
  GMAIL_USER: z.string().default(""),
  GMAIL_APP_PASSWORD: z.string().default(""),
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value?.trim().length ? value.trim() : undefined)),
  RESEND_FROM: z.string().default("El Pedregal <onboarding@resend.dev>"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
