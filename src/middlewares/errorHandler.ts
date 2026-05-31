import { NextFunction, Request, Response } from "express";

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ message: "not_found" });
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(error);
  res.status(500).json({ message: "internal_server_error" });
};
