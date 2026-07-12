import { RequestHandler } from "express";

import { UserRole } from "../models/User";
import { AuthenticatedRequest } from "./auth";

export const authorize = (...allowedRoles: UserRole[]): RequestHandler => {
  return (req: AuthenticatedRequest, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "token_required" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "forbidden" });
    }

    return next();
  };
};
