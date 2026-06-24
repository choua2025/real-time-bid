import { z } from "zod";
import { Role } from "@prisma/client";
import { bidService } from "../services/bid.service.js";
import { auctionService } from "../services/auction.service.js";
import { auctionWatchRepository } from "../repositories/auctionWatch.repository.js";
import { isBidError } from "../lib/errors.js";
import type { AppServer, AppSocket } from "./events.js";

const roomFor = (auctionId: string) => `auction:${auctionId}`;

const joinSchema = z.object({ auctionId: z.string().min(1) });
const leaveSchema = z.object({ auctionId: z.string().min(1) });
const bidSchema = z.object({
  auctionId: z.string().min(1),
  amount: z.union([z.number(), z.string().min(1)]),
});

// Per-socket bid throttle: at most BID_MAX bids per BID_WINDOW_MS sliding window.
// In-memory and per-socket — bounded by connection count, cleared on disconnect.
const BID_WINDOW_MS = 10_000;
const BID_MAX = 10;
function makeBidThrottle() {
  let hits: number[] = [];
  return (): boolean => {
    const now = Date.now();
    hits = hits.filter((t) => now - t < BID_WINDOW_MS);
    if (hits.length >= BID_MAX) return false;
    hits.push(now);
    return true;
  };
}

/**
 * Remove the user's AuctionWatch row only if they have NO remaining socket in
 * the room (reference counting across tabs/devices). Call AFTER the socket has
 * left the room so it isn't counted.
 */
async function releaseWatch(io: AppServer, auctionId: string, userId: string): Promise<void> {
  const sockets = await io.in(roomFor(auctionId)).fetchSockets();
  const stillConnected = sockets.some((s) => s.data.user?.id === userId);
  if (!stillConnected) {
    await auctionWatchRepository.leave(auctionId, userId);
  }
}

export function registerAuctionHandlers(io: AppServer): void {
  io.on("connection", (socket: AppSocket) => {
    const user = socket.data.user; // guaranteed present by the auth middleware
    // Auctions this particular socket has joined — used for disconnect cleanup.
    const joined = new Set<string>();
    // Sliding-window bid throttle for this socket.
    const allowBid = makeBidThrottle();

    // --- watch / join room ------------------------------------------------
    socket.on("auction-join", async (payload, ack) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: "INVALID_PAYLOAD" });
      const { auctionId } = parsed.data;

      try {
        const state = await auctionService.liveState(auctionId);
        if (!state) return ack?.({ ok: false, error: "AUCTION_NOT_FOUND" });

        await auctionWatchRepository.join(auctionId, user.id); // idempotent upsert
        await socket.join(roomFor(auctionId));
        joined.add(auctionId);
        ack?.({ ok: true, state });
      } catch (err) {
        console.error("[auction-join]", err);
        ack?.({ ok: false, error: "SERVER_ERROR" });
      }
    });

    // --- stop watching / leave room --------------------------------------
    socket.on("auction-leave", async (payload, ack) => {
      const parsed = leaveSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false });
      const { auctionId } = parsed.data;

      await socket.leave(roomFor(auctionId));
      joined.delete(auctionId);
      try {
        await releaseWatch(io, auctionId, user.id);
      } catch (err) {
        console.error("[auction-leave]", err);
      }
      ack?.({ ok: true });
    });

    // --- place a bid ------------------------------------------------------
    socket.on("bid-place", async (payload) => {
      const parsed = bidSchema.safeParse(payload);
      if (!parsed.success) {
        return socket.emit("bid-rejected", { reason: "Invalid bid payload." });
      }
      const { auctionId, amount } = parsed.data;

      // Only registered members can bid; admins watch only.
      if (user.role !== Role.MEMBER) {
        return socket.emit("bid-rejected", { reason: "Only members can place bids." });
      }

      // Throttle bid spam before touching the DB.
      if (!allowBid()) {
        return socket.emit("bid-rejected", { reason: "Too many bids — slow down." });
      }

      try {
        await bidService.place({ auctionId, userId: user.id, amount });
        // Broadcast the authoritative new state to everyone in the room.
        const state = await auctionService.liveState(auctionId);
        if (state) io.to(roomFor(auctionId)).emit("bid-update", state);
      } catch (err) {
        if (isBidError(err)) {
          socket.emit("bid-rejected", { reason: err.message });
        } else {
          console.error("[bid-place]", err);
          socket.emit("bid-rejected", { reason: "Could not place bid right now." });
        }
      }
    });

    // --- disconnect: release watches this socket held ---------------------
    socket.on("disconnect", async () => {
      // socket.io has already removed this socket from its rooms by now.
      for (const auctionId of joined) {
        try {
          await releaseWatch(io, auctionId, user.id);
        } catch (err) {
          console.error("[disconnect releaseWatch]", err);
        }
      }
    });
  });
}
