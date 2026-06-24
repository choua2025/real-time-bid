import { Auction, AuctionStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type Money = Prisma.Decimal | number | string;

export interface CreateAuctionInput {
  phoneNumberId: string;
  floorPrice: Money;
  startsAt: Date;
  endsAt: Date;
  status?: AuctionStatus;
}

export interface ListAuctionsFilter {
  status?: AuctionStatus;
  skip?: number;
  take?: number;
}

// Auction with its phone number and lightweight bid stats, for detail views.
const detailInclude = {
  phoneNumber: true,
  winnerBid: { include: { user: { select: { id: true, name: true } } } },
  _count: { select: { bids: true } },
} satisfies Prisma.AuctionInclude;

export type AuctionWithDetail = Prisma.AuctionGetPayload<{
  include: typeof detailInclude;
}>;

// Auction with phone number, bid count, and ONLY its current top bid (highest
// amount, ties broken by earliest bidAt). The `bids` take:1 correlated include
// resolves the leading bidder for every auction in a single query — no N+1.
const overviewInclude = {
  phoneNumber: true,
  _count: { select: { bids: true } },
  bids: {
    orderBy: [{ amount: "desc" }, { bidAt: "asc" }],
    take: 1,
    select: { id: true, amount: true, user: { select: { id: true, name: true } } },
  },
} satisfies Prisma.AuctionInclude;

export type AuctionWithTopBid = Prisma.AuctionGetPayload<{
  include: typeof overviewInclude;
}>;

export const auctionRepository = {
  create(data: CreateAuctionInput): Promise<Auction> {
    // currentPrice starts at the floor — no bids yet.
    return prisma.auction.create({
      data: { ...data, currentPrice: data.floorPrice },
    });
  },

  findById(id: string): Promise<Auction | null> {
    return prisma.auction.findUnique({ where: { id } });
  },

  findByIdWithDetail(id: string): Promise<AuctionWithDetail | null> {
    return prisma.auction.findUnique({ where: { id }, include: detailInclude });
  },

  // An existing SCHEDULED or ACTIVE auction for this phone number, if any.
  // Used to prevent two open auctions for the same number at once.
  findOpenForPhone(phoneNumberId: string): Promise<Auction | null> {
    return prisma.auction.findFirst({
      where: {
        phoneNumberId,
        status: { in: [AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE] },
      },
    });
  },

  list(filter: ListAuctionsFilter = {}): Promise<AuctionWithDetail[]> {
    const { status, skip, take } = filter;
    return prisma.auction.findMany({
      where: { status },
      include: detailInclude,
      orderBy: { endsAt: "asc" },
      skip,
      take,
    });
  },

  // Admin overview: every auction with its current top bidder, one query.
  listWithTopBid(filter: ListAuctionsFilter = {}): Promise<AuctionWithTopBid[]> {
    const { status, skip, take } = filter;
    return prisma.auction.findMany({
      where: { status },
      include: overviewInclude,
      orderBy: { endsAt: "asc" },
      skip,
      take,
    });
  },

  // Denormalized price bump. Caller is responsible for ensuring the new
  // amount actually beats the old currentPrice (business rule lives in service).
  updateCurrentPrice(id: string, amount: Money): Promise<Auction> {
    return prisma.auction.update({
      where: { id },
      data: { currentPrice: amount },
    });
  },

  setStatus(id: string, status: AuctionStatus): Promise<Auction> {
    return prisma.auction.update({ where: { id }, data: { status } });
  },

  // Background job: auctions still ACTIVE whose end time has passed.
  findExpiredActive(now: Date = new Date()): Promise<Auction[]> {
    return prisma.auction.findMany({
      where: { status: AuctionStatus.ACTIVE, endsAt: { lte: now } },
    });
  },

  // Background job: scheduled auctions whose start time has arrived.
  activateDue(now: Date = new Date()): Promise<number> {
    return prisma.auction
      .updateMany({
        where: {
          status: AuctionStatus.SCHEDULED,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        data: { status: AuctionStatus.ACTIVE },
      })
      .then((r) => r.count);
  },

  // Close an auction: lock in the winner (if any) and final price.
  close(
    id: string,
    opts: { winnerBidId?: string | null; finalPrice?: Money } = {},
  ): Promise<Auction> {
    return prisma.auction.update({
      where: { id },
      data: {
        status: AuctionStatus.ENDED,
        winnerBidId: opts.winnerBidId ?? null,
        ...(opts.finalPrice !== undefined ? { currentPrice: opts.finalPrice } : {}),
      },
    });
  },
};
