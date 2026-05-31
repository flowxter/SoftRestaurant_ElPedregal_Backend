import { RequestHandler } from "express";
import { ZodSchema } from "zod";

export const validateBody = (schema: ZodSchema): RequestHandler => {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "validation_error",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    req.body = parsed.data;
    return next();
  };
};
