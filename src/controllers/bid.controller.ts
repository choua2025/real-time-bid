import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { bidService } from "../services/bid.service.js";

export const bidController = {
  // GET /api/auctions/:id/bids — bid history for one auction.
  listForAuction: asyncHandler(async (req, res) => {
    res.json(await bidService.listForAuction(z.string().parse(req.params.id)));
  }),

  // GET /api/auctions/:id/bids/top — top 10 bids (leaderboard) for one auction.
  topForAuction: asyncHandler(async (req, res) => {
    res.json(await bidService.topForAuction(z.string().parse(req.params.id), 10));
  }),

  // GET /api/me/bids — the authenticated user's own bids.
  listMine: asyncHandler(async (req, res) => {
    res.json(await bidService.listForUser(req.user!.id));
  }),
};
