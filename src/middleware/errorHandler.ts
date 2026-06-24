import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/httpError.js";

// Central error translator. Keep this LAST in the middleware chain.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }
  console.error("[unhandled error]", err);
  res.status(500).json({ error: "Internal server error" });
};
