import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authService } from "../services/auth.service.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authController = {
  register: asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    res.status(201).json(await authService.register(body));
  }),

  login: asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    res.json(await authService.login(body));
  }),

  refresh: asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    res.json(await authService.refresh(refreshToken));
  }),

  logout: asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).send();
  }),

  // authenticate middleware guarantees req.user is present.
  me: asyncHandler(async (req, res) => {
    res.json(await authService.me(req.user!.id));
  }),
};
