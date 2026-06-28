import fs from "fs/promises";
import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";

import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import { authorize } from "../middlewares/authorize";
import { uploadProductImage } from "../middlewares/upload";
import { Category } from "../models/Category";
import { Product } from "../models/Product";
import { ProductAuditLog } from "../models/ProductAuditLog";

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
  stock: z.coerce.number().int().min(0).default(0),
  imageUrl: z.string().trim().url().optional(),
});

const booleanFromString = z.preprocess((val) => {
  if (val === "true" || val === true) return true;
  if (val === "false" || val === false) return false;
  return val;
}, z.boolean());

const productUpdateSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().min(1).max(2000).trim().optional(),
  isAvailable: booleanFromString.optional(),
  category: z.string().min(1).optional(),
  stock: z.coerce.number().int().min(0).optional(),
  imageUrl: z.string().trim().url().optional(),
});

// ─── GET /api/products ───────────────────────────────────────────────────────
router.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const products = await Product.find().populate("category").lean();
    return res.status(200).json({
      message: "products_retrieved",
      products: products,
    });
  })
);

// ─── GET /api/products/:id ───────────────────────────────────────────────────
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "invalid_product_id" });
    }

    const product = await Product.findById(id).populate("category");
    if (!product) {
      return res.status(404).json({ message: "product_not_found" });
    }

    return res.status(200).json({
      message: "product_retrieved",
      product: product.toJSON(),
    });
  })
);

// ─── POST /api/products ──────────────────────────────────────────────────────
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

    const { name, description, price, category: categoryId, imageUrl } = parsed.data;

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
      stock: parsed.data.stock,
    };
    if (req.file) {
      data["image"] = `/uploads/products/${req.file.filename}`;
    } else if (imageUrl) {
      data["image"] = imageUrl;
    }

    const product = await Product.create(data);

    return res.status(201).json({
      message: "product_created",
      product: product.toJSON(),
    });
  })
);

// ─── PATCH /api/products/:id ─────────────────────────────────────────────────
router.patch(
  "/:id",
  authenticate,
  authorize("admin", "employee"),
  uploadProductImage.single("image"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: "invalid_product_id" });
    }

    const product = await Product.findById(id);
    if (!product) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ message: "product_not_found" });
    }

    const parsed = productUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        message: "validation_error",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, description, isAvailable, category: categoryId, stock, imageUrl } = parsed.data;

    // Validate category if provided
    if (categoryId) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ message: "invalid_category_id" });
      }

      const categoryExists = await Category.findById(categoryId);
      if (!categoryExists) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(404).json({ message: "category_not_found" });
      }
    }

    // Check for duplicate name in category (if name is being updated)
    if (name && name !== product.name) {
      const targetCategory = categoryId || product.category;
      const duplicate = await Product.findOne({
        name,
        category: targetCategory,
        _id: { $ne: id },
      });
      if (duplicate) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(409).json({ message: "product_name_already_exists_in_category" });
      }
    }

    const changedFields: Record<string, { from: unknown; to: unknown }> = {};

    if (name && name !== product.name) {
      changedFields.name = { from: product.name, to: name };
      product.name = name;
    }
    if (description && description !== product.description) {
      changedFields.description = { from: product.description, to: description };
      product.description = description;
    }
    if (isAvailable !== undefined && isAvailable !== product.isAvailable) {
      changedFields.isAvailable = { from: product.isAvailable, to: isAvailable };
      product.isAvailable = isAvailable;
    }
    if (categoryId && categoryId !== product.category.toString()) {
      changedFields.category = { from: product.category.toString(), to: categoryId };
      product.category = new mongoose.Types.ObjectId(categoryId);
    }

    if (stock !== undefined && stock !== product.stock) {
      changedFields.stock = { from: product.stock, to: stock };
      product.stock = stock;
    }

    if (req.file) {
      const newImage = `/uploads/products/${req.file.filename}`;
      if (product.image !== newImage) {
        changedFields.image = { from: product.image ?? null, to: newImage };
      }
      if (product.image && product.image.startsWith("/uploads/")) {
        const oldImagePath = product.image.replace(/^\/uploads\//, "uploads/");
        await fs.unlink(oldImagePath).catch(() => {});
      }
      product.image = newImage;
    } else if (imageUrl) {
      if (product.image !== imageUrl) {
        changedFields.image = { from: product.image ?? null, to: imageUrl };
      }
      if (product.image && product.image.startsWith("/uploads/")) {
        const oldImagePath = product.image.replace(/^\/uploads\//, "uploads/");
        await fs.unlink(oldImagePath).catch(() => {});
      }
      product.image = imageUrl;
    }

    if (Object.keys(changedFields).length > 0) {
      await ProductAuditLog.create({
        productId: product._id,
        userId: req.user!._id,
        changedFields,
      });
    }

    await product.save();

    return res.status(200).json({
      message: "product_updated",
      product: product.toJSON(),
    });
  })
);

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "invalid_product_id" });
    }

    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ message: "product_not_found" });
    }

    // Delete image if exists
    if (product.image) {
      const imagePath = product.image.replace(/^\/uploads\//, "uploads/");
      await fs.unlink(imagePath).catch(() => {});
    }

    return res.status(200).json({
      message: "product_deleted",
    });
  })
);

// ─── Error handler ───────────────────────────────────────────────────────────
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

