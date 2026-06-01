import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { env } from "../config/env";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "unauthorized" });
  }

  const token = authorization.replace(/^Bearer\s+/i, "");

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return res.status(401).json({ message: "unauthorized" });
  }

  if (!payload?.sub || typeof payload.sub !== "string") {
    return res.status(401).json({ message: "unauthorized" });
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    return res.status(401).json({ message: "unauthorized" });
  }

  req.userId = user._id.toString();
  next();
};
