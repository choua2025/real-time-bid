import { AuctionWatch } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const auctionWatchRepository = {
  // Idempotent join — re-joining the room (e.g. reconnect) is a no-op.
  join(auctionId: string, userId: string): Promise<AuctionWatch> {
    return prisma.auctionWatch.upsert({
      where: { auctionId_userId: { auctionId, userId } },
      create: { auctionId, userId },
      update: {},
    });
  },

  leave(auctionId: string, userId: string): Promise<number> {
    return prisma.auctionWatch
      .deleteMany({ where: { auctionId, userId } })
      .then((r) => r.count);
  },

  listWatchers(auctionId: string): Promise<AuctionWatch[]> {
    return prisma.auctionWatch.findMany({ where: { auctionId } });
  },

  countWatchers(auctionId: string): Promise<number> {
    return prisma.auctionWatch.count({ where: { auctionId } });
  },

  listByUser(userId: string): Promise<AuctionWatch[]> {
    return prisma.auctionWatch.findMany({ where: { userId } });
  },
};
