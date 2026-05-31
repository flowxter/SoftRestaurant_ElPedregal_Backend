import { CookieOptions, Response } from "express";

import { env } from "../config/env";

const baseCookieOptions = (): CookieOptions => {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production" || env.COOKIE_SECURE,
    path: "/api/auth",
  };

  if (env.COOKIE_DOMAIN) {
    options.domain = env.COOKIE_DOMAIN;
  }

  return options;
};

export const setRefreshTokenCookie = (res: Response, token: string, expires: Date) => {
  res.cookie(env.COOKIE_NAME, token, { ...baseCookieOptions(), expires });
};

export const clearRefreshTokenCookie = (res: Response) => {
  res.clearCookie(env.COOKIE_NAME, baseCookieOptions());
};
