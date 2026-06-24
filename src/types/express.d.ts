import { Role } from "@prisma/client";

// Authenticated principal attached by the `authenticate` middleware.
// Role-aware so `requireRole` can authorize without a DB lookup.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export {};
