import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { verifyAccessToken } from "../lib/jwt.js";
import { forbidden, unauthorized } from "../lib/httpError.js";

// Verifies the Bearer access token and attaches req.user. Stateless — no DB hit.
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(unauthorized("Missing or malformed Authorization header."));
  }
  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(unauthorized("Invalid or expired access token."));
  }
}

// Role gate. Use after `authenticate`, e.g. requireRole(Role.ADMIN).
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden("Insufficient permissions."));
    next();
  };
}
