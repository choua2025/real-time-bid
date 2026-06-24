import jwt, { type SignOptions } from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { env } from "../config/env.js";

// Access token payload — kept small and role-aware so authorization checks
// need no DB round-trip.
export interface AccessPayload {
  sub: string; // user id
  role: Role;
}

export interface RefreshPayload {
  sub: string;
  jti: string; // unique per token, enables per-token revocation
}

function signWith(payload: object, secret: string, ttl: string): string {
  return jwt.sign(payload, secret, { expiresIn: ttl } as SignOptions);
}

export function signAccessToken(payload: AccessPayload): string {
  return signWith(payload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_TTL);
}

// Returns the raw refresh JWT plus its expiry, so the caller can persist a
// matching RefreshToken row (storing only the hash).
export function signRefreshToken(sub: string): { token: string; jti: string; expiresAt: Date } {
  const jti = randomUUID();
  const token = signWith({ sub, jti } satisfies RefreshPayload, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_TTL);
  const decoded = jwt.decode(token) as { exp: number };
  return { token, jti, expiresAt: new Date(decoded.exp * 1000) };
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as RefreshPayload;
}

// We persist a SHA-256 of the (already high-entropy, signed) refresh token —
// never the raw value. Fast and sufficient here; bcrypt would be overkill.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
