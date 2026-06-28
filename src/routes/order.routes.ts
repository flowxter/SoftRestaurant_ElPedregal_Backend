import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import { authorize } from "../middlewares/authorize";
import { validateBody } from "../middlewares/validate";
import { Order, OrderItem } from "../models/Order";
import { Product } from "../models/Product";
import { calculatePrice } from "../utils/pricing";

const router = Router();

/* ------------------------------------------------------------------ */
/*  Zod schema                                                        */
/* ------------------------------------------------------------------ */

const orderCreateSchema = z.object({
  items: z
    .array(
      z.object({
        product: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
      })
    )
    .min(1),
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  POST /  — crear pedido                                            */
/* ------------------------------------------------------------------ */

router.post(
  "/",
  authenticate,
  authorize("user"),
  validateBody(orderCreateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { items } = req.body as z.infer<typeof orderCreateSchema>;

    // Combinar cantidades de productos repetidos en el pedido
    const quantities = new Map<string, number>();
    for (const item of items) {
      if (!mongoose.Types.ObjectId.isValid(item.product)) {
        return res
          .status(400)
          .json({ message: "invalid_product_id", productId: item.product });
      }
      quantities.set(
        item.product,
        (quantities.get(item.product) ?? 0) + item.quantity
      );
    }

    const productIds = [...quantities.keys()];
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const orderItems: OrderItem[] = [];
    let total = 0;

    for (const [productId, quantity] of quantities) {
      const product = productMap.get(productId);
      if (!product) {
        return res.status(404).json({ message: "product_not_found", productId });
      }
      if (!product.isAvailable) {
        return res
          .status(400)
          .json({ message: "product_not_available", productId });
      }

      const originalPrice = parseFloat(product.price.toString());
      const { finalPrice } = await calculatePrice(productId, originalPrice);

      const subtotal = round2(finalPrice * quantity);
      total = round2(total + subtotal);

      orderItems.push({
        product: product._id,
        name: product.name,
        unitPrice: mongoose.Types.Decimal128.fromString(finalPrice.toFixed(2)),
        quantity,
        subtotal: mongoose.Types.Decimal128.fromString(subtotal.toFixed(2)),
      });
    }

    const order = await Order.create({
      user: req.user!._id,
      items: orderItems,
      total: mongoose.Types.Decimal128.fromString(total.toFixed(2)),
      status: "PENDIENTE",
    });

    return res.status(201).json({
      message: "order_created",
      order: order.toJSON(),
    });
  })
);

export default router;
