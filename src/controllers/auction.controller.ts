import { z } from "zod";
import { AuctionStatus } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { auctionService } from "../services/auction.service.js";

const createSchema = z.object({
  phoneNumberId: z.string().min(1),
  floorPrice: z.union([z.number().positive(), z.string().min(1)]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

const listQuerySchema = z.object({
  status: z.nativeEnum(AuctionStatus).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

export const auctionController = {
  create: asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    res.status(201).json(await auctionService.create(body));
  }),

  list: asyncHandler(async (req, res) => {
    const filter = listQuerySchema.parse(req.query);
    res.json(await auctionService.list(filter));
  }),

  // Admin-only: same listing plus the current top bidder per auction.
  adminOverview: asyncHandler(async (req, res) => {
    const filter = listQuerySchema.parse(req.query);
    res.json(await auctionService.adminOverview(filter));
  }),

  get: asyncHandler(async (req, res) => {
    res.json(await auctionService.getDetail(z.string().parse(req.params.id)));
  }),

  cancel: asyncHandler(async (req, res) => {
    res.json(await auctionService.cancel(z.string().parse(req.params.id)));
  }),
};
