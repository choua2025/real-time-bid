import { auctionService, AuctionEndedEvent } from "../services/auction.service.js";

export interface AuctionCloserOptions {
  // Emit-agnostic: the socket layer passes a function that broadcasts
  // `auction-ended` to the auction's room. Kept out of the service so the
  // closing logic stays testable without socket.io.
  onAuctionEnded: (event: AuctionEndedEvent) => void;
  intervalMs?: number; // default 30s per the brief
  onError?: (err: unknown) => void;
}

export interface AuctionCloser {
  stop: () => void;
  // Exposed for tests / manual triggering — runs one tick immediately.
  tick: () => Promise<void>;
}

/**
 * Background job: every `intervalMs`, activate due auctions and close expired
 * ones, firing `onAuctionEnded` for each close. A `running` guard prevents
 * overlapping ticks if a tick ever runs long.
 */
export function startAuctionCloser(opts: AuctionCloserOptions): AuctionCloser {
  const intervalMs = opts.intervalMs ?? 30_000;
  const onError = opts.onError ?? ((err) => console.error("[auctionCloser]", err));
  let running = false;

  const tick = async () => {
    if (running) return; // previous tick still in flight — skip this one
    running = true;
    try {
      await auctionService.activateDue();
      const ended = await auctionService.closeExpired();
      for (const event of ended) opts.onAuctionEnded(event);
    } catch (err) {
      onError(err);
    } finally {
      running = false;
    }
  };

  const handle = setInterval(tick, intervalMs);
  // Don't keep the process alive solely for this timer.
  handle.unref?.();

  return {
    stop: () => clearInterval(handle),
    tick,
  };
}
