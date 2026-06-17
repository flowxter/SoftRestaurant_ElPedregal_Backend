import { RequestHandler } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { User, UserDocument } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
    }
  }
}

export const authenticate: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "token_required" });
  }

  const token = header.slice(7);

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return res.status(401).json({ message: "invalid_token" });
  }

  if (!payload.sub) {
    return res.status(401).json({ message: "invalid_token" });
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    return res.status(401).json({ message: "user_not_found" });
  }

  req.user = user;
  return next();
};
