import { RefreshToken } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export interface CreateRefreshTokenInput {
  token: string; // a hash of the raw refresh token, never the raw value
  userId: string;
  expiresAt: Date;
}

export const refreshTokenRepository = {
  create(data: CreateRefreshTokenInput): Promise<RefreshToken> {
    return prisma.refreshToken.create({ data });
  },

  findByToken(token: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({ where: { token } });
  },

  revoke(id: string): Promise<RefreshToken> {
    return prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  // Used on logout-all / password change to invalidate every active session.
  revokeAllForUser(userId: string): Promise<number> {
    return prisma.refreshToken
      .updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .then((r) => r.count);
  },

  // Housekeeping for expired rows.
  deleteExpired(now: Date = new Date()): Promise<number> {
    return prisma.refreshToken
      .deleteMany({ where: { expiresAt: { lt: now } } })
      .then((r) => r.count);
  },
};
