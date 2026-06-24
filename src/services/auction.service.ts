import { AuctionStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  auctionRepository,
  AuctionWithDetail,
  AuctionWithTopBid,
  ListAuctionsFilter,
} from "../repositories/auction.repository.js";
import { bidRepository } from "../repositories/bid.repository.js";
import { phoneNumberRepository } from "../repositories/phoneNumber.repository.js";
import { badRequest, conflict, notFound } from "../lib/httpError.js";

// Payload for the `auction-ended` broadcast. Money as a fixed-scale string.
export interface AuctionEndedEvent {
  auctionId: string;
  winnerId: string | null;
  winnerName: string | null;
  finalPrice: string;
}

// JSON-safe DTOs: money as fixed(2) strings, timestamps as ISO.
export interface AuctionSummary {
  id: string;
  status: AuctionStatus;
  floorPrice: string;
  currentPrice: string;
  startsAt: string;
  endsAt: string;
  bidCount: number;
  phoneNumber: { id: string; msisdn: string; type: string; category: string };
}

export interface AuctionDetail extends AuctionSummary {
  topBidder: { id: string; name: string } | null;
  winner: { bidId: string; userId: string; name: string; amount: string } | null;
}

// Admin-only overview row: a summary plus the current leading bidder (and the
// amount they're leading with). null when the auction has no bids yet.
export interface AdminAuctionOverview extends AuctionSummary {
  topBidder: { id: string; name: string; amount: string } | null;
}

// Structural shape both AuctionWithDetail and AuctionWithTopBid satisfy — lets
// toSummary serve both without coupling to a single include.
type SummarizableAuction = Pick<
  AuctionWithDetail,
  "id" | "status" | "floorPrice" | "currentPrice" | "startsAt" | "endsAt" | "_count" | "phoneNumber"
>;

function toSummary(a: SummarizableAuction): AuctionSummary {
  return {
    id: a.id,
    status: a.status,
    floorPrice: a.floorPrice.toFixed(2),
    currentPrice: a.currentPrice.toFixed(2),
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    bidCount: a._count.bids,
    phoneNumber: {
      id: a.phoneNumber.id,
      msisdn: a.phoneNumber.msisdn,
      type: a.phoneNumber.type,
      category: a.phoneNumber.category,
    },
  };
}

function toDetail(
  a: AuctionWithDetail,
  top: { user: { id: string; name: string } } | null,
): AuctionDetail {
  return {
    ...toSummary(a),
    topBidder: top ? { id: top.user.id, name: top.user.name } : null,
    winner: a.winnerBid
      ? {
          bidId: a.winnerBid.id,
          userId: a.winnerBid.user.id,
          name: a.winnerBid.user.name,
          amount: a.winnerBid.amount.toFixed(2),
        }
      : null,
  };
}

// Live snapshot broadcast as `bid-update` and returned on `auction-join`.
export interface AuctionLiveState {
  auctionId: string;
  currentPrice: string;
  bidCount: number;
  topBidder: { id: string; name: string } | null;
}

export const auctionService = {
  /**
   * Close a single auction: resolve the winner from the highest bid and flip
   * it to ENDED. Concurrency-safe and idempotent — the conditional update on
   * `status: ACTIVE` means only one caller (e.g. one of two overlapping job
   * runs) can close it; everyone else gets `null`.
   *
   * Returns the broadcast event, or `null` if the auction was already closed,
   * missing, or no longer ACTIVE.
   */
  async close(auctionId: string): Promise<AuctionEndedEvent | null> {
    return prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: auctionId },
        select: { id: true, status: true, currentPrice: true },
      });
      if (!auction || auction.status !== AuctionStatus.ACTIVE) return null;

      // Highest bid wins; ties broken by earliest bid (same rule as live bids).
      const topBid = await tx.bid.findFirst({
        where: { auctionId },
        orderBy: [{ amount: "desc" }, { bidAt: "asc" }],
        select: { id: true, user: { select: { id: true, name: true } } },
      });

      const closed = await tx.auction.updateMany({
        where: { id: auctionId, status: AuctionStatus.ACTIVE },
        data: { status: AuctionStatus.ENDED, winnerBidId: topBid?.id ?? null },
      });
      // Lost the race to another close — let the winner emit the event.
      if (closed.count === 0) return null;

      return {
        auctionId,
        winnerId: topBid?.user.id ?? null,
        winnerName: topBid?.user.name ?? null,
        finalPrice: auction.currentPrice.toFixed(2),
      } satisfies AuctionEndedEvent;
    });
  },

  /**
   * Close every auction whose end time has passed but is still ACTIVE.
   * Sequential to keep connection-pool pressure low; the set per tick is small.
   * Returns the events for auctions this call actually closed.
   */
  async closeExpired(now: Date = new Date()): Promise<AuctionEndedEvent[]> {
    const expired = await auctionRepository.findExpiredActive(now);
    const events: AuctionEndedEvent[] = [];
    for (const auction of expired) {
      const event = await this.close(auction.id);
      if (event) events.push(event);
    }
    return events;
  },

  /** Flip due SCHEDULED auctions to ACTIVE. Returns how many were activated. */
  activateDue(now: Date = new Date()): Promise<number> {
    return auctionRepository.activateDue(now);
  },

  // Authoritative live state for an auction — the single source for both the
  // `auction-join` ack and `bid-update` broadcasts. Returns null if missing.
  async liveState(auctionId: string): Promise<AuctionLiveState | null> {
    const auction = await auctionRepository.findById(auctionId);
    if (!auction) return null;
    const [top, bidCount] = await Promise.all([
      bidRepository.getTopBid(auctionId),
      bidRepository.countByAuction(auctionId),
    ]);
    return {
      auctionId,
      currentPrice: auction.currentPrice.toFixed(2),
      bidCount,
      topBidder: top ? { id: top.user.id, name: top.user.name } : null,
    };
  },

  // --- admin / browse CRUD ------------------------------------------------

  async create(input: {
    phoneNumberId: string;
    floorPrice: number | string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<AuctionDetail> {
    const phone = await phoneNumberRepository.findById(input.phoneNumberId);
    if (!phone) throw badRequest("phoneNumberId does not reference an existing phone number.");

    let floorPrice: Prisma.Decimal;
    try {
      floorPrice = new Prisma.Decimal(input.floorPrice);
    } catch {
      throw badRequest("Invalid floor price.");
    }
    if (!floorPrice.isFinite() || floorPrice.lte(0) || floorPrice.decimalPlaces() > 2) {
      throw badRequest("Floor price must be a positive amount with at most 2 decimals.");
    }

    const now = new Date();
    if (input.endsAt <= input.startsAt) throw badRequest("endsAt must be after startsAt.");
    if (input.endsAt <= now) throw badRequest("endsAt must be in the future.");

    if (await auctionRepository.findOpenForPhone(input.phoneNumberId)) {
      throw conflict("This phone number already has a scheduled or active auction.");
    }

    // Open immediately if the start time has already passed; otherwise the
    // background job promotes SCHEDULED -> ACTIVE at startsAt.
    const status = input.startsAt <= now ? AuctionStatus.ACTIVE : AuctionStatus.SCHEDULED;

    const created = await auctionRepository.create({
      phoneNumberId: input.phoneNumberId,
      floorPrice,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status,
    });
    return this.getDetail(created.id);
  },

  async list(filter: ListAuctionsFilter): Promise<AuctionSummary[]> {
    const auctions = await auctionRepository.list(filter);
    return auctions.map(toSummary);
  },

  // Admin dashboard: every auction with its current top bidder. The bidder's
  // identity is admin-only, so this is NOT exposed through the public `list`.
  async adminOverview(filter: ListAuctionsFilter): Promise<AdminAuctionOverview[]> {
    const auctions = await auctionRepository.listWithTopBid(filter);
    return auctions.map((a: AuctionWithTopBid) => {
      const top = a.bids[0]; // take:1 — highest bid, or undefined if no bids
      return {
        ...toSummary(a),
        topBidder: top
          ? { id: top.user.id, name: top.user.name, amount: top.amount.toFixed(2) }
          : null,
      };
    });
  },

  async getDetail(id: string): Promise<AuctionDetail> {
    const auction = await auctionRepository.findByIdWithDetail(id);
    if (!auction) throw notFound("Auction not found.");
    const top = await bidRepository.getTopBid(id);
    return toDetail(auction, top);
  },

  // Admin pulls an auction. Idempotent; cannot cancel one that already ended.
  async cancel(id: string): Promise<AuctionDetail> {
    const auction = await auctionRepository.findById(id);
    if (!auction) throw notFound("Auction not found.");
    if (auction.status === AuctionStatus.ENDED) {
      throw conflict("Cannot cancel an auction that has already ended.");
    }
    if (auction.status !== AuctionStatus.CANCELLED) {
      await auctionRepository.setStatus(id, AuctionStatus.CANCELLED);
    }
    return this.getDetail(id);
  },
};
