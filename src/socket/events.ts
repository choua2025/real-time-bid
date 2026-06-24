import type { Server, Socket } from "socket.io";
import { Role } from "@prisma/client";
import type { AuctionEndedEvent, AuctionLiveState } from "../services/auction.service.js";

// Acks let the client know a join/leave actually took effect (or why not).
export interface JoinAck {
  ok: boolean;
  state?: AuctionLiveState;
  error?: string;
}

export interface LeaveAck {
  ok: boolean;
}

// Server → client/room.
export interface ServerToClientEvents {
  "bid-update": (state: AuctionLiveState) => void;
  "auction-ended": (event: AuctionEndedEvent) => void;
  "bid-rejected": (payload: { reason: string }) => void;
}

// Client → server. Acks are optional callbacks.
export interface ClientToServerEvents {
  "auction-join": (payload: { auctionId: string }, ack?: (res: JoinAck) => void) => void;
  "auction-leave": (payload: { auctionId: string }, ack?: (res: LeaveAck) => void) => void;
  "bid-place": (payload: { auctionId: string; amount: number | string }) => void;
}

export interface InterServerEvents {
  // none yet (single-node)
}

// Per-socket state. The authenticated principal lives here (not on socket.user)
// so that RemoteSocket results from fetchSockets() can read it for watch
// reference-counting.
export interface SocketData {
  user: { id: string; role: Role };
}

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
