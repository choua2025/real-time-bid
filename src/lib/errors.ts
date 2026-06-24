// Domain errors. BidError carries a stable `code` plus a human-readable
// `message` that is safe to send to the bidder as `bid-rejected { reason }`.

export type BidRejectionCode =
  | "INVALID_AMOUNT"
  | "AUCTION_NOT_FOUND"
  | "AUCTION_NOT_ACTIVE"
  | "AUCTION_NOT_STARTED"
  | "AUCTION_ENDED"
  | "BELOW_FLOOR"
  | "NOT_HIGHER"
  | "OUTBID";

const REJECTION_MESSAGES: Record<BidRejectionCode, string> = {
  INVALID_AMOUNT: "Invalid bid amount.",
  AUCTION_NOT_FOUND: "Auction not found.",
  AUCTION_NOT_ACTIVE: "This auction is not open for bidding.",
  AUCTION_NOT_STARTED: "This auction has not started yet.",
  AUCTION_ENDED: "This auction has already ended.",
  BELOW_FLOOR: "Your bid is below the floor price.",
  NOT_HIGHER: "Your bid must be higher than the current price.",
  OUTBID: "You were outbid — the price has already moved past your bid.",
};

export class BidError extends Error {
  readonly code: BidRejectionCode;

  constructor(code: BidRejectionCode, message?: string) {
    super(message ?? REJECTION_MESSAGES[code]);
    this.name = "BidError";
    this.code = code;
  }
}

export function isBidError(err: unknown): err is BidError {
  return err instanceof BidError;
}
