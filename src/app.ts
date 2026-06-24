import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Express app factory — no network binding here, so tests can drive it directly.
export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy/load balancer in production: trust X-Forwarded-* so
  // req.ip is the real client (correct rate-limiting) and secure-cookie logic works.
  if (env.NODE_ENV === "production") app.set("trust proxy", 1);

  // Security headers (HSTS, no-sniff, frameguard, etc.).
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",") }));
  // Cap body size — no endpoint needs large payloads; blunts memory-abuse.
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, });
  });

  app.use("/api", apiLimiter, apiRouter);

  // Must be registered last.
  app.use(errorHandler);
  return app;
}
