import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User, UserDocument } from "../models/User";
import { env } from "../config/env";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: UserDocument;
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
  req.user = user;
  next();
};

// Alias for backward compatibility
export const authenticate = requireAuth;

/**
 * Autenticación opcional: si viene un token válido, adjunta el usuario a la
 * request; si no viene o es inválido, continúa igual sin bloquear. Útil para
 * endpoints públicos que también quieren reconocer al usuario si está logueado
 * (p. ej. crear un pedido como invitado o como cliente registrado).
 */
export const optionalAuth = async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return next();
  }

  const token = authorization.replace(/^Bearer\s+/i, "");

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (payload?.sub && typeof payload.sub === "string") {
      const user = await User.findById(payload.sub);
      if (user) {
        req.userId = user._id.toString();
        req.user = user;
      }
    }
  } catch {
    // Token inválido/expirado: seguimos como invitado.
  }

  return next();
};
