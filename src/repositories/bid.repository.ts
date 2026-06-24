import { Bid, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type Money = Prisma.Decimal | number | string;

export interface CreateBidInput {
  auctionId: string;
  userId: string;
  amount: Money;
}

const withBidder = {
  user: { select: { id: true, name: true } },
} satisfies Prisma.BidInclude;

export type BidWithBidder = Prisma.BidGetPayload<{ include: typeof withBidder }>;

export const bidRepository = {
  create(data: CreateBidInput): Promise<Bid> {
    return prisma.bid.create({ data });
  },

  findById(id: string): Promise<Bid | null> {
    return prisma.bid.findUnique({ where: { id } });
  },

  // Highest bid on an auction. Ties broken by earliest bidAt (first to reach
  // the amount wins). Returns the bidder's id/name for broadcast payloads.
  getTopBid(auctionId: string): Promise<BidWithBidder | null> {
    return prisma.bid.findFirst({
      where: { auctionId },
      include: withBidder,
      orderBy: [{ amount: "desc" }, { bidAt: "asc" }],
    });
  },

  countByAuction(auctionId: string): Promise<number> {
    return prisma.bid.count({ where: { auctionId } });
  },

  listByAuction(auctionId: string): Promise<BidWithBidder[]> {
    return prisma.bid.findMany({
      where: { auctionId },
      include: withBidder,
      orderBy: { bidAt: "desc" },
    });
  },

  // Highest bids on an auction (leaderboard). Ranked by amount; ties broken by
  // earliest bidAt so the first to reach an amount ranks above later equal bids.
  topByAuction(auctionId: string, limit: number): Promise<BidWithBidder[]> {
    return prisma.bid.findMany({
      where: { auctionId },
      include: withBidder,
      orderBy: [{ amount: "desc" }, { bidAt: "asc" }],
      take: limit,
    });
  },

  // Scoped to the authenticated user — their own bid history.
  listByUser(userId: string): Promise<Bid[]> {
    return prisma.bid.findMany({
      where: { userId },
      orderBy: { bidAt: "desc" },
    });
  },
};
