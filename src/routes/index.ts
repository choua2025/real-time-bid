import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { phoneNumberRouter } from "./phoneNumber.routes.js";
import { auctionRouter } from "./auction.routes.js";
import { meRouter } from "./me.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/phone-numbers", phoneNumberRouter);
apiRouter.use("/auctions", auctionRouter);
apiRouter.use("/me", meRouter);
