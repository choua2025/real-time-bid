import { PrismaClient } from "@prisma/client";

// Single shared PrismaClient. In dev, hot-reload can otherwise spawn many
// clients and exhaust the connection pool, so we stash one on globalThis.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
