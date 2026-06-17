import fs from "fs/promises";
import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";

import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticate } from "../middlewares/auth";
import { authorize } from "../middlewares/authorize";
import { uploadProductImage } from "../middlewares/upload";
import { Category } from "../models/Category";
import { Product } from "../models/Product";

const router = Router();

const productSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().min(1).max(2000).trim(),
  price: z
    .string()
    .or(z.number())
    .transform((v) => (typeof v === "string" ? parseFloat(v) : v))
    .pipe(
      z
        .number()
        .positive()
        .max(99999999.99)
        .refine((n) => Number.isFinite(n) && Math.round(n * 100) / 100 === n, {
          message: "price must have at most 2 decimal places",
        })
    ),
  category: z.string().min(1),
});

router.post(
  "/",
  authenticate,
  authorize("admin"),
  uploadProductImage.single("image"),
  asyncHandler(async (req, res) => {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        message: "validation_error",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, description, price, category: categoryId } = parsed.data;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: "invalid_category_id" });
    }

    const categoryExists = await Category.findById(categoryId);
    if (!categoryExists) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ message: "category_not_found" });
    }

    const duplicate = await Product.findOne({ name, category: categoryId });
    if (duplicate) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(409).json({ message: "product_name_already_exists_in_category" });
    }

    const data: Record<string, unknown> = {
      name,
      description,
      price: mongoose.Types.Decimal128.fromString(price.toFixed(2)),
      category: categoryId,
    };
    if (req.file) {
      data["image"] = `/uploads/products/${req.file.filename}`;
    }

    const product = await Product.create(data);

    return res.status(201).json(product.toJSON());
  })
);

router.use(
  (
    err: unknown,
    _req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction
  ) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "file_too_large", maxSize: "5MB" });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res
          .status(400)
          .json({ message: "invalid_file_format", allowed: ["jpeg", "png", "webp"] });
      }
    }
    return next(err);
  }
);

export default router;
