import "dotenv/config";
import { z } from "zod";

// Secrets that are obviously placeholders — rejected outright so a half-set-up
// deployment can't accidentally ship with a guessable signing key.
const FORBIDDEN_SECRETS = new Set(["change-me-access", "change-me-refresh", "change-me", "secret"]);

// Validated environment. Throws at startup if required secrets are missing or
// weak, so the app never boots half-configured.
const schema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(1),
    JWT_REFRESH_SECRET: z.string().min(1),
    JWT_ACCESS_TTL: z.string().default("15m"),
    JWT_REFRESH_TTL: z.string().default("7d"),
    CORS_ORIGIN: z.string().default("*"),
  })
  .superRefine((cfg, ctx) => {
    const isProd = cfg.NODE_ENV === "production";

    const checkSecret = (key: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET", value: string) => {
      if (FORBIDDEN_SECRETS.has(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is a placeholder — set a real secret.` });
      }
      // In production demand real entropy; dev can stay lax for convenience.
      if (isProd && value.length < 32) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} must be at least 32 characters in production.` });
      }
    };
    checkSecret("JWT_ACCESS_SECRET", cfg.JWT_ACCESS_SECRET);
    checkSecret("JWT_REFRESH_SECRET", cfg.JWT_REFRESH_SECRET);

    if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_REFRESH_SECRET"], message: "Access and refresh secrets must differ." });
    }

    // A wildcard CORS origin in production lets any site drive the API.
    if (isProd && cfg.CORS_ORIGIN.trim() === "*") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGIN"], message: "CORS_ORIGIN must be an explicit allow-list in production (no '*')." });
    }
  });

export const env = schema.parse(process.env);
