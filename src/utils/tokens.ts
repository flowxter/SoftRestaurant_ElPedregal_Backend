import crypto from "crypto";
import * as jwt from "jsonwebtoken";

import { env } from "../config/env";

export const hashToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const createRefreshToken = () => {
  const token = crypto.randomBytes(64).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000
  );
  return { token, tokenHash, expiresAt };
};

export const signAccessToken = (userId: string) => {
  return jwt.sign({ sub: userId }, env.JWT_SECRET as jwt.Secret, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const signResetToken = (userId: string, jti: string) => {
  return jwt.sign(
    { sub: userId, jti, type: "password_reset" },
    env.RESET_TOKEN_SECRET as jwt.Secret,
    {
      expiresIn: `${env.RESET_TOKEN_EXPIRES_MINUTES}m`,
    } as jwt.SignOptions
  );
};

export const verifyResetToken = (token: string) => {
  return jwt.verify(token, env.RESET_TOKEN_SECRET) as jwt.JwtPayload;
};
