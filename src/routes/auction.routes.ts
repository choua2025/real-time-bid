import { Router } from "express";
import { Role } from "@prisma/client";
import { auctionController } from "../controllers/auction.controller.js";
import { bidController } from "../controllers/bid.controller.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";

export const auctionRouter = Router();

// Browsing requires authentication (any role); writes are admin-only.
auctionRouter.get("/", authenticate, auctionController.list);
// Admin overview with top bidder — must precede "/:id" so it isn't swallowed.
auctionRouter.get("/admin/overview", authenticate, requireRole(Role.ADMIN), auctionController.adminOverview);
auctionRouter.get("/:id", authenticate, auctionController.get);
auctionRouter.get("/:id/bids", authenticate, bidController.listForAuction);
auctionRouter.get("/:id/bids/top", authenticate, bidController.topForAuction);

auctionRouter.post("/", authenticate, requireRole(Role.ADMIN), auctionController.create);
auctionRouter.post("/:id/cancel", authenticate, requireRole(Role.ADMIN), auctionController.cancel);
