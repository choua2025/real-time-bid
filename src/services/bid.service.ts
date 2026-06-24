import { AuctionStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { bidRepository } from "../repositories/bid.repository.js";
import { BidError } from "../lib/errors.js";

// JSON-safe bid view: amount as fixed(2) string, bidAt as ISO.
export interface BidView {
  id: string;
  auctionId: string;
  userId: string;
  userName?: string;
  amount: string;
  bidAt: string;
}

// Prisma error codes that are transient and safe to retry: write-conflict/
// deadlock (P2034) and connection-pool timeout under bursty load (P2024).
const TRANSIENT_CODES = new Set(["P2034", "P2024"]);
const MAX_ATTEMPTS = 4;

function isTransient(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(err.code)
  );
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Business rejections are deterministic — never retry them.
      if (!isTransient(err)) throw err;
      lastErr = err;
      // Small jittered backoff before retrying the contended transaction.
      await new Promise((r) => setTimeout(r, 10 * attempt + Math.random() * 10));
    }
  }
  throw lastErr;
}

export interface PlaceBidInput {
  auctionId: string;
  userId: string; // caller MUST already be an authenticated MEMBER (enforced upstream)
  amount: number | string | Prisma.Decimal;
}

// Everything the socket layer needs to broadcast `bid-update`.
// Money is returned as a fixed-scale string so it serializes over the wire
// without float rounding.
export interface AcceptedBid {
  bidId: string;
  auctionId: string;
  userId: string;
  currentPrice: string;
  bidCount: number;
  bidAt: Date;
}

function parseAmount(raw: PlaceBidInput["amount"]): Prisma.Decimal {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(raw);
  } catch {
    throw new BidError("INVALID_AMOUNT");
  }
  // Positive, finite, and within the Decimal(14,2) money scale.
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
    throw new BidError("INVALID_AMOUNT");
  }
  return amount;
}

export const bidService = {
  /**
   * Place a bid with full concurrency safety.
   *
   * The authoritative guard is the conditional `updateMany`: Postgres takes a
   * row lock on the auction and re-evaluates `currentPrice < amount` *after*
   * acquiring it. Two simultaneous bids therefore serialize — whoever commits
   * first wins, and the loser's update matches 0 rows and is rejected as OUTBID
   * before any losing Bid row is ever written.
   *
   * The pre-checks before the update exist only to return a precise rejection
   * reason; the update is what actually enforces correctness.
   */
  async place(input: PlaceBidInput): Promise<AcceptedBid> {
    const amount = parseAmount(input.amount);
    const { auctionId, userId } = input;

    const result = await withRetry(() =>
      prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        select: {
          id: true,
          status: true,
          startsAt: true,
          endsAt: true,
          floorPrice: true,
          currentPrice: true,
        },
      });

      const now = new Date();
      if (!auction) throw new BidError("AUCTION_NOT_FOUND");
      if (auction.status !== AuctionStatus.ACTIVE) throw new BidError("AUCTION_NOT_ACTIVE");
      if (now < auction.startsAt) throw new BidError("AUCTION_NOT_STARTED");
      // Reject even if the background close job hasn't flipped status yet.
      if (now >= auction.endsAt) throw new BidError("AUCTION_ENDED");
      if (amount.lt(auction.floorPrice)) throw new BidError("BELOW_FLOOR");
      // Must strictly exceed the current price — equalling it is not enough.
      if (amount.lte(auction.currentPrice)) throw new BidError("NOT_HIGHER");

      // Atomic, race-proof price bump.
      const bumped = await tx.auction.updateMany({
        where: {
          id: auctionId,
          status: AuctionStatus.ACTIVE,
          endsAt: { gt: now },
          currentPrice: { lt: amount },
        },
        data: { currentPrice: amount },
      });
      if (bumped.count === 0) throw new BidError("OUTBID");

      const bid = await tx.bid.create({
        data: { auctionId, userId, amount },
        select: { id: true, bidAt: true },
      });
      const bidCount = await tx.bid.count({ where: { auctionId } });

      return { bidId: bid.id, bidAt: bid.bidAt, bidCount };
      }),
    );

    return {
      bidId: result.bidId,
      auctionId,
      userId,
      currentPrice: amount.toFixed(2),
      bidCount: result.bidCount,
      bidAt: result.bidAt,
    };
  },

  // Full bid history for an auction (newest first), with bidder names.
  async listForAuction(auctionId: string): Promise<BidView[]> {
    const bids = await bidRepository.listByAuction(auctionId);
    return bids.map((b) => ({
      id: b.id,
      auctionId: b.auctionId,
      userId: b.userId,
      userName: b.user.name,
      amount: b.amount.toFixed(2),
      bidAt: b.bidAt.toISOString(),
    }));
  },

  // Leaderboard: the highest bids on an auction (default top 10), ranked by
  // amount with the bidder's name attached.
  async topForAuction(auctionId: string, limit = 10): Promise<BidView[]> {
    const bids = await bidRepository.topByAuction(auctionId, limit);
    return bids.map((b) => ({
      id: b.id,
      auctionId: b.auctionId,
      userId: b.userId,
      userName: b.user.name,
      amount: b.amount.toFixed(2),
      bidAt: b.bidAt.toISOString(),
    }));
  },

  // The authenticated user's own bids across all auctions (newest first).
  async listForUser(userId: string): Promise<BidView[]> {
    const bids = await bidRepository.listByUser(userId);
    return bids.map((b) => ({
      id: b.id,
      auctionId: b.auctionId,
      userId: b.userId,
      amount: b.amount.toFixed(2),
      bidAt: b.bidAt.toISOString(),
    }));
  },
};
