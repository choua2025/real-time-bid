import { NextFunction, Request, RequestHandler, Response } from "express";

// Wraps async controllers so thrown errors / rejected promises reach the
// central errorHandler via next(err) instead of crashing the process.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
