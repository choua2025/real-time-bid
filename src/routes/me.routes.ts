import { Router } from "express";
import { bidController } from "../controllers/bid.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const meRouter = Router();

meRouter.get("/bids", authenticate, bidController.listMine);
