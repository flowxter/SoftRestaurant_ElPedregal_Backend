import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticate } from "../middlewares/auth";
import { authorize } from "../middlewares/authorize";
import { validateBody } from "../middlewares/validate";
import { Product } from "../models/Product";
import { Promotion } from "../models/Promotion";
import { calculatePrice } from "../utils/pricing";

const router = Router();

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const promotionCreateSchema = z
  .object({
    name: z.string().min(1).max(200).trim(),
    type: z.enum(["percentage", "fixed_amount"]),
    value: z.number().positive(),
    product: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  })
  .refine(
    (d) => {
      if (d.type === "percentage") return d.value > 0 && d.value <= 100;
      return true;
    },
    { message: "percentage value must be between 0 and 100", path: ["value"] }
  );

const promotionUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
    type: z.enum(["percentage", "fixed_amount"]).optional(),
    value: z.number().positive().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) return d.endDate > d.startDate;
      return true;
    },
    { message: "endDate must be after startDate", path: ["endDate"] }
  );

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

async function checkOverlap(
  productId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string
): Promise<boolean> {
  const filter: Record<string, unknown> = {
    product: productId,
    isActive: true,
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };
  if (excludeId) {
    filter["_id"] = { $ne: excludeId };
  }
  const existing = await Promotion.findOne(filter);
  return existing !== null;
}

/* ------------------------------------------------------------------ */
/*  POST /  — crear promoción                                         */
/* ------------------------------------------------------------------ */

router.post(
  "/",
  authenticate,
  authorize("admin"),
  validateBody(promotionCreateSchema),
  asyncHandler(async (req, res) => {
    const { name, type, value, product: productId, startDate, endDate } = req.body as z.infer<
      typeof promotionCreateSchema
    >;

    if (!isValidObjectId(productId)) {
      return res.status(400).json({ message: "invalid_product_id" });
    }

    const productExists = await Product.findById(productId);
    if (!productExists) {
      return res.status(404).json({ message: "product_not_found" });
    }

    if (type === "fixed_amount") {
      const price = parseFloat(productExists.price.toString());
      if (value > price) {
        return res.status(400).json({
          message: "fixed_discount_exceeds_product_price",
          productPrice: price,
        });
      }
    }

    const overlaps = await checkOverlap(productId, startDate, endDate);
    if (overlaps) {
      return res.status(409).json({ message: "product_already_has_active_promotion_in_range" });
    }

    const promotion = await Promotion.create({
      name,
      type,
      value,
      product: productId,
      startDate,
      endDate,
    });

    return res.status(201).json(promotion.toJSON());
  })
);

/* ------------------------------------------------------------------ */
/*  GET /  — listar promociones (filtros opcionales)                   */
/* ------------------------------------------------------------------ */

router.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    const now = new Date();

    if (req.query["active"] === "true") {
      filter["isActive"] = true;
      filter["startDate"] = { $lte: now };
      filter["endDate"] = { $gte: now };
    } else if (req.query["active"] === "false") {
      filter["$or"] = [{ isActive: false }, { endDate: { $lt: now } }];
    }

    if (typeof req.query["product"] === "string" && isValidObjectId(req.query["product"])) {
      filter["product"] = req.query["product"];
    }

    const promotions = await Promotion.find(filter)
      .populate("product", "name price")
      .sort({ createdAt: -1 });

    return res.status(200).json(promotions.map((p) => p.toJSON()));
  })
);

/* ------------------------------------------------------------------ */
/*  GET /:id  — obtener una promoción                                  */
/* ------------------------------------------------------------------ */

router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = req.params["id"] as string;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "invalid_promotion_id" });
    }

    const promotion = await Promotion.findById(id).populate(
      "product",
      "name price"
    );
    if (!promotion) {
      return res.status(404).json({ message: "promotion_not_found" });
    }

    return res.status(200).json(promotion.toJSON());
  })
);

/* ------------------------------------------------------------------ */
/*  PUT /:id  — actualizar promoción                                   */
/* ------------------------------------------------------------------ */

router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  validateBody(promotionUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = req.params["id"] as string;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "invalid_promotion_id" });
    }

    const promotion = await Promotion.findById(id);
    if (!promotion) {
      return res.status(404).json({ message: "promotion_not_found" });
    }

    const updates = req.body as z.infer<typeof promotionUpdateSchema>;

    const newType = updates.type ?? promotion.type;
    const newValue = updates.value ?? promotion.value;
    const newStart = updates.startDate ?? promotion.startDate;
    const newEnd = updates.endDate ?? promotion.endDate;

    if (newEnd <= newStart) {
      return res.status(400).json({ message: "endDate must be after startDate" });
    }

    if (newType === "percentage" && (newValue <= 0 || newValue > 100)) {
      return res
        .status(400)
        .json({ message: "percentage value must be between 0 and 100" });
    }

    if (newType === "fixed_amount") {
      const product = await Product.findById(promotion.product);
      if (product) {
        const price = parseFloat(product.price.toString());
        if (newValue > price) {
          return res.status(400).json({
            message: "fixed_discount_exceeds_product_price",
            productPrice: price,
          });
        }
      }
    }

    const newIsActive = updates.isActive ?? promotion.isActive;
    if (newIsActive) {
      const overlaps = await checkOverlap(
        promotion.product.toString(),
        newStart,
        newEnd,
        promotion._id.toString()
      );
      if (overlaps) {
        return res
          .status(409)
          .json({ message: "product_already_has_active_promotion_in_range" });
      }
    }

    Object.assign(promotion, updates);
    await promotion.save();

    return res.status(200).json(promotion.toJSON());
  })
);

/* ------------------------------------------------------------------ */
/*  DELETE /:id  — eliminar promoción                                  */
/* ------------------------------------------------------------------ */

router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const id = req.params["id"] as string;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "invalid_promotion_id" });
    }

    const promotion = await Promotion.findByIdAndDelete(id);
    if (!promotion) {
      return res.status(404).json({ message: "promotion_not_found" });
    }

    return res.status(204).send();
  })
);

/* ------------------------------------------------------------------ */
/*  GET /price/:productId  — precio con descuento aplicado             */
/* ------------------------------------------------------------------ */

router.get(
  "/price/:productId",
  asyncHandler(async (req, res) => {
    const productId = req.params["productId"] as string;

    if (!isValidObjectId(productId)) {
      return res.status(400).json({ message: "invalid_product_id" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "product_not_found" });
    }

    const originalPrice = parseFloat(product.price.toString());
    const breakdown = await calculatePrice(productId, originalPrice);

    return res.status(200).json(breakdown);
  })
);

export default router;
