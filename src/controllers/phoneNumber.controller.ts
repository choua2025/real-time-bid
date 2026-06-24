import { z } from "zod";
import { PhoneType } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { phoneNumberService } from "../services/phoneNumber.service.js";

const createSchema = z.object({
  msisdn: z.string().regex(/^\d{6,15}$/, "MSISDN must be 6-15 digits."),
  type: z.nativeEnum(PhoneType),
  category: z.string().min(1).max(50),
});

const updateSchema = createSchema.partial();

const listQuerySchema = z.object({
  category: z.string().optional(),
  type: z.nativeEnum(PhoneType).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

export const phoneNumberController = {
  create: asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    res.status(201).json(await phoneNumberService.create(body));
  }),

  list: asyncHandler(async (req, res) => {
    const filter = listQuerySchema.parse(req.query);
    res.json(await phoneNumberService.list(filter));
  }),

  get: asyncHandler(async (req, res) => {
    res.json(await phoneNumberService.get(z.string().parse(req.params.id)));
  }),

  update: asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    res.json(await phoneNumberService.update(z.string().parse(req.params.id), body));
  }),

  remove: asyncHandler(async (req, res) => {
    await phoneNumberService.remove(z.string().parse(req.params.id));
    res.status(204).send();
  }),
};
