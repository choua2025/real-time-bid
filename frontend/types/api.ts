export type Role = "ADMIN" | "MEMBER";
export type AuctionStatus = "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED";
export type PhoneType = "PREPAID" | "POSTPAID";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResult {
  user: User;
  tokens: { accessToken: string; refreshToken: string };
}

export interface PhoneNumber {
  id: string;
  msisdn: string;
  type: PhoneType;
  category: string;
}

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

// Admin-only overview row: summary plus the current leading bidder.
export interface AdminAuctionOverview extends AuctionSummary {
  topBidder: { id: string; name: string; amount: string } | null;
}

export interface BidView {
  id: string;
  auctionId: string;
  userId: string;
  userName?: string;
  amount: string;
  bidAt: string;
}

// Real-time payloads.
export interface LiveState {
  auctionId: string;
  currentPrice: string;
  bidCount: number;
  topBidder: { id: string; name: string } | null;
}

export interface AuctionEnded {
  auctionId: string;
  winnerId: string | null;
  winnerName: string | null;
  finalPrice: string;
}
