import { Role, User } from "@prisma/client";
import { userRepository } from "../repositories/user.repository.js";
import { refreshTokenRepository } from "../repositories/refreshToken.repository.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from "../lib/jwt.js";
import { conflict, notFound, unauthorized } from "../lib/httpError.js";

// What we expose about a user — never the password hash.
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

// Mint an access token and a persisted, rotation-ready refresh token.
async function issueTokens(user: Pick<User, "id" | "role">): Promise<AuthTokens> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const { token: refreshToken, expiresAt } = signRefreshToken(user.id);
  await refreshTokenRepository.create({
    token: hashToken(refreshToken),
    userId: user.id,
    expiresAt,
  });
  return { accessToken, refreshToken };
}

export const authService = {
  async register(input: { email: string; password: string; name: string }): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    if (await userRepository.findByEmail(email)) {
      throw conflict("An account with this email already exists.");
    }
    const user = await userRepository.create({
      email,
      name: input.name.trim(),
      password: await hashPassword(input.password),
      // Public registration is always MEMBER; admins are provisioned separately.
      role: Role.MEMBER,
    });
    return { user: toPublicUser(user), tokens: await issueTokens(user) };
  },

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const user = await userRepository.findByEmail(email);
    // Same error whether the email is unknown or the password is wrong — no
    // account enumeration.
    if (!user || !(await verifyPassword(input.password, user.password))) {
      throw unauthorized("Invalid email or password.");
    }
    return { user: toPublicUser(user), tokens: await issueTokens(user) };
  },

  // Rotating refresh: validate the presented token, revoke it, issue a fresh
  // pair. If an already-revoked token is replayed, treat it as theft and kill
  // every session for that user.
  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw unauthorized("Invalid or expired refresh token.");
    }

    const stored = await refreshTokenRepository.findByToken(hashToken(refreshToken));
    if (!stored) throw unauthorized("Refresh token not recognized.");

    if (stored.revokedAt) {
      await refreshTokenRepository.revokeAllForUser(stored.userId);
      throw unauthorized("Refresh token has been revoked.");
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw unauthorized("Refresh token has expired.");
    }

    const user = await userRepository.findById(payload.sub);
    if (!user) throw unauthorized("User no longer exists.");

    await refreshTokenRepository.revoke(stored.id); // rotate
    return { user: toPublicUser(user), tokens: await issueTokens(user) };
  },

  // Idempotent: revoking an unknown/already-revoked token is a no-op.
  async logout(refreshToken: string): Promise<void> {
    const stored = await refreshTokenRepository.findByToken(hashToken(refreshToken));
    if (stored && !stored.revokedAt) {
      await refreshTokenRepository.revoke(stored.id);
    }
  },

  async logoutAll(userId: string): Promise<number> {
    return refreshTokenRepository.revokeAllForUser(userId);
  },

  async me(userId: string): Promise<PublicUser> {
    const user = await userRepository.findById(userId);
    if (!user) throw notFound("User not found.");
    return toPublicUser(user);
  },
};
