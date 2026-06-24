import { verifyAccessToken } from "../lib/jwt.js";
import type { AppServer, AppSocket } from "./events.js";

// Token may arrive via the handshake `auth` payload (socket.io client default)
// or an Authorization header.
function extractToken(socket: AppSocket): string | undefined {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === "string" && fromAuth.length > 0) return fromAuth;

  const header = socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }
  return undefined;
}

// Validates the JWT before ANY socket event is processed (per conventions).
// Rejected handshakes never reach the connection handler. The principal is
// stored on socket.data so other sockets can read it via fetchSockets().
export function registerSocketAuth(io: AppServer): void {
  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) return next(new Error("UNAUTHORIZED"));
    try {
      const payload = verifyAccessToken(token);
      socket.data.user = { id: payload.sub, role: payload.role };
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });
}
