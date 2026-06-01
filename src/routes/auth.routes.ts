import bcrypt from "bcrypt";
import crypto from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { env } from "../config/env";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validateBody } from "../middlewares/validate";
import { requireAuth, AuthenticatedRequest } from "../middlewares/auth";
import { PasswordResetToken } from "../models/PasswordResetToken";
import { RefreshToken } from "../models/RefreshToken";
import { User } from "../models/User";
import { clearRefreshTokenCookie, setRefreshTokenCookie } from "../utils/cookies";
import {
  createRefreshToken,
  hashToken,
  signAccessToken,
  signResetToken,
  verifyResetToken,
} from "../utils/tokens";

const router = Router();

const registerSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  phone: z.string().min(6).max(50),
  email: z.string().email().min(5).max(255),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email().min(5).max(255),
  password: z.string().min(8).max(128),
});

const profileSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().min(5).max(255),
  phone: z.string().min(6).max(50),
});

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(128),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().min(5).max(255),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "too_many_attempts" },
});

function buildCurrentUser(user: { firstName?: string; lastName?: string; email: string }) {
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Usuario";
  const initials = `${(user.firstName?.[0] ?? "").toUpperCase()}${(user.lastName?.[0] ?? "").toUpperCase()}` || "--";
  return {
    initials,
    name,
    role: "Empleado",
    email: user.email,
  };
}

router.post(
  "/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, email, password } = req.body as z.infer<typeof registerSchema>;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: "email_in_use" });
    }

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
    });

    return res.status(201).json({ id: user._id.toString() });
  })
);

router.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const normalizedEmail = email.toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: "invalid_credentials" });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ message: "invalid_credentials" });
    }

    const accessToken = signAccessToken(user._id.toString());
    const { token: refreshToken, tokenHash, expiresAt } = createRefreshToken();

    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      expiresAt,
    });

    setRefreshTokenCookie(res, refreshToken, expiresAt);

    return res.status(200).json({ accessToken });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[env.COOKIE_NAME];

    if (typeof token === "string") {
      const tokenHash = hashToken(token);
      await RefreshToken.findOneAndUpdate(
        { tokenHash, revokedAt: null },
        { revokedAt: new Date() }
      );
    }

    clearRefreshTokenCookie(res);
    return res.status(204).send();
  })
);

router.get(
  "/users/current",
  asyncHandler(requireAuth),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(401).json({ message: "unauthorized" });
    }

    return res.status(200).json({
      message: "current_user_loaded",
      user: buildCurrentUser(user),
    });
  })
);

router.get(
  "/users/profile",
  asyncHandler(requireAuth),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(401).json({ message: "unauthorized" });
    }

    return res.status(200).json({
      message: "profile_loaded",
      profile: {
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.email,
        phone: user.phone ?? "",
      },
    });
  })
);

router.put(
  "/users/profile",
  asyncHandler(requireAuth),
  validateBody(profileSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { firstName, lastName, email, phone } = req.body as z.infer<typeof profileSchema>;
    const normalizedEmail = email.toLowerCase();

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const existingEmailUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: user._id },
    });
    if (existingEmailUser) {
      return res.status(409).json({
        message: "email_in_use",
        errors: { email: "Este correo ya está en uso." },
      });
    }

    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.email = normalizedEmail;
    user.phone = phone.trim();
    await user.save();

    return res.status(200).json({
      message: "profile_updated",
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone ?? "",
      },
    });
  })
);

router.post(
  "/users/delete-account",
  asyncHandler(requireAuth),
  validateBody(deleteAccountSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { password } = req.body as z.infer<typeof deleteAccountSchema>;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ message: "invalid_credentials" });
    }

    await User.findByIdAndDelete(user._id);
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
    clearRefreshTokenCookie(res);

    return res.status(200).json({ message: "account_deleted" });
  })
);

router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof forgotPasswordSchema>;
    const normalizedEmail = email.toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    let resetToken: string | undefined;

    if (user) {
      const jti = crypto.randomBytes(16).toString("hex");
      resetToken = signResetToken(user._id.toString(), jti);

      const tokenHash = hashToken(resetToken);
      const expiresAt = new Date(
        Date.now() + env.RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000
      );

      await PasswordResetToken.create({
        userId: user._id,
        tokenHash,
        expiresAt,
      });
    }

    const payload: { message: string; resetToken?: string } = {
      message: "reset_token_sent",
    };

    if (resetToken && env.NODE_ENV !== "production") {
      payload.resetToken = resetToken;
    }

    return res.status(200).json(payload);
  })
);

router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as z.infer<typeof resetPasswordSchema>;

    let payload: ReturnType<typeof verifyResetToken>;
    try {
      payload = verifyResetToken(token);
    } catch {
      return res.status(400).json({ message: "invalid_or_expired_token" });
    }

    if (payload.type !== "password_reset" || !payload.sub) {
      return res.status(400).json({ message: "invalid_or_expired_token" });
    }

    const tokenHash = hashToken(token);
    const resetRecord = await PasswordResetToken.findOne({
      tokenHash,
      usedAt: null,
    });

    if (!resetRecord) {
      return res.status(400).json({ message: "invalid_or_expired_token" });
    }

    if (resetRecord.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "invalid_or_expired_token" });
    }

    if (resetRecord.userId.toString() !== payload.sub) {
      return res.status(400).json({ message: "invalid_or_expired_token" });
    }

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    await User.findByIdAndUpdate(resetRecord.userId, { passwordHash });

    resetRecord.usedAt = new Date();
    await resetRecord.save();

    return res.status(200).json({ message: "password_reset_ok" });
  })
);

export default router;
