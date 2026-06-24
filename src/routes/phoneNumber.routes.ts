import { Router } from "express";
import { Role } from "@prisma/client";
import { phoneNumberController } from "../controllers/phoneNumber.controller.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";

export const phoneNumberRouter = Router();

// Phone number management is admin-only.
phoneNumberRouter.use(authenticate, requireRole(Role.ADMIN));

phoneNumberRouter.post("/", phoneNumberController.create);
phoneNumberRouter.get("/", phoneNumberController.list);
phoneNumberRouter.get("/:id", phoneNumberController.get);
phoneNumberRouter.patch("/:id", phoneNumberController.update);
phoneNumberRouter.delete("/:id", phoneNumberController.remove);
