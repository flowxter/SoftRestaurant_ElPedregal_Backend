import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticate, optionalAuth, AuthenticatedRequest } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import {
  Order,
  OrderItem,
  ORDER_STATUSES,
  PAYMENT_METHODS,
} from "../models/Order";
import { getNextSequence } from "../models/Counter";
import { Product } from "../models/Product";
import { calculatePrice } from "../utils/pricing";
import { allowedTargets, findTransition } from "../utils/orderStateMachine";

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
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  // Datos del invitado (obligatorios solo si el pedido no viene autenticado).
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().min(7).max(20).optional(),
  // Mesa/ubicación y notas (opcionales) que muestra y edita la UI.
  table: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Construye la lista de ítems del pedido (con precios/promos aplicados) y su
 * total, a partir de `{ product, quantity }`. Reutilizado por crear y editar.
 * Devuelve `{ ok:false, status, body }` con el error HTTP si algo no valida.
 */
type BuildItemsResult =
  | { ok: true; orderItems: OrderItem[]; total: number }
  | { ok: false; status: number; body: Record<string, unknown> };

async function buildOrderItems(
  items: { product: string; quantity: number }[]
): Promise<BuildItemsResult> {
  // Combinar cantidades de productos repetidos en el pedido
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.product)) {
      return {
        ok: false,
        status: 400,
        body: { message: "invalid_product_id", productId: item.product },
      };
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
      return { ok: false, status: 404, body: { message: "product_not_found", productId } };
    }
    if (!product.isAvailable) {
      return { ok: false, status: 400, body: { message: "product_not_available", productId } };
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

  return { ok: true, orderItems, total };
}

/* ------------------------------------------------------------------ */
/*  POST /  — crear pedido                                            */
/* ------------------------------------------------------------------ */

router.post(
  "/",
  optionalAuth,
  validateBody(orderCreateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { items, paymentMethod, customerName, customerPhone, table, notes } =
      req.body as z.infer<typeof orderCreateSchema>;

    // Si no hay usuario autenticado, el pedido es de un invitado y exige
    // identificarse con nombre y teléfono.
    if (!req.user && (!customerName || !customerPhone)) {
      return res.status(400).json({ message: "guest_requires_name_and_phone" });
    }

    const built = await buildOrderItems(items);
    if (!built.ok) {
      return res.status(built.status).json(built.body);
    }
    const { orderItems, total } = built;

    const number = await getNextSequence("order");

    const order = await Order.create({
      number,
      ...(req.user ? { user: req.user._id } : {}),
      ...(customerName ? { customerName } : {}),
      ...(customerPhone ? { customerPhone } : {}),
      ...(table ? { table } : {}),
      ...(notes ? { notes } : {}),
      items: orderItems,
      total: mongoose.Types.Decimal128.fromString(total.toFixed(2)),
      status: "PENDIENTE",
      ...(paymentMethod ? { paymentMethod } : {}),
      statusHistory: [
        {
          from: null,
          to: "PENDIENTE",
          ...(req.user ? { changedBy: req.user._id } : {}),
          changedAt: new Date(),
        },
      ],
    });

    return res.status(201).json({
      message: "order_created",
      order: order.toJSON(),
    });
  })
);

/* ------------------------------------------------------------------ */
/*  GET /  — listar pedidos                                           */
/*  Personal (admin/employee): todos. Cliente (user): solo los suyos. */
/* ------------------------------------------------------------------ */

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const role = req.user!.role;
    const isStaff = role === "admin" || role === "employee";
    // Los cancelados no se listan (equivale a "desaparecen" de la vista activa).
    const query: Record<string, unknown> = { status: { $ne: "CANCELADO" } };
    if (!isStaff) {
      query["user"] = req.user!._id;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });

    return res.status(200).json({
      message: "orders_retrieved",
      orders: orders.map((o) => o.toJSON()),
    });
  })
);

/* ------------------------------------------------------------------ */
/*  GET /:number  — detalle de un pedido por su número                */
/* ------------------------------------------------------------------ */

router.get(
  "/:number",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const number = Number(req.params["number"]);
    if (!Number.isInteger(number)) {
      return res.status(400).json({ message: "invalid_order_number" });
    }

    const order = await Order.findOne({ number });
    if (!order) {
      return res.status(404).json({ message: "order_not_found" });
    }

    // Un cliente solo puede ver sus propios pedidos.
    const role = req.user!.role;
    if (role === "user" && (!order.user || !order.user.equals(req.user!._id))) {
      return res.status(403).json({ message: "forbidden" });
    }

    return res.status(200).json({
      message: "order_retrieved",
      order: order.toJSON(),
    });
  })
);

/* ------------------------------------------------------------------ */
/*  PATCH /:id/status  — cambiar estado del pedido                    */
/* ------------------------------------------------------------------ */

const statusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

router.patch(
  "/:id/status",
  authenticate,
  validateBody(statusUpdateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params["id"] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "invalid_order_id" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "order_not_found" });
    }

    const { status: target } = req.body as z.infer<typeof statusUpdateSchema>;
    const current = order.status;

    // Máquina de estados: ¿es una transición permitida?
    const transition = findTransition(current, target);
    if (!transition) {
      return res.status(422).json({
        message: "invalid_status_transition",
        from: current,
        to: target,
        allowedTransitions: allowedTargets(current),
      });
    }

    // Autorización por transición (rol y, si aplica, propiedad del pedido)
    const role = req.user!.role;
    if (!transition.roles.includes(role)) {
      return res.status(403).json({
        message: "forbidden_transition_for_role",
        role,
        allowedRoles: transition.roles,
      });
    }
    // La restricción de propiedad solo aplica a clientes: un "user" solo puede
    // afectar sus propios pedidos. El personal (admin/employee) la omite.
    if (
      transition.ownerOnly &&
      role === "user" &&
      (!order.user || !order.user.equals(req.user!._id))
    ) {
      return res.status(403).json({ message: "forbidden_not_order_owner" });
    }

    // Aplicar cambio + registrar usuario y timestamp
    order.status = target;
    order.statusHistory.push({
      from: current,
      to: target,
      changedBy: req.user!._id,
      changedAt: new Date(),
    });
    await order.save();

    return res.status(200).json({
      message: "order_status_updated",
      order: order.toJSON(),
    });
  })
);

/* ------------------------------------------------------------------ */
/*  PATCH /:number  — editar ítems / mesa / notas de un pedido        */
/* ------------------------------------------------------------------ */

const orderUpdateSchema = z.object({
  items: z
    .array(
      z.object({
        product: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
      })
    )
    .min(1),
  table: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

router.patch(
  "/:number",
  authenticate,
  validateBody(orderUpdateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const number = Number(req.params["number"]);
    if (!Number.isInteger(number)) {
      return res.status(400).json({ message: "invalid_order_number" });
    }

    const order = await Order.findOne({ number });
    if (!order) {
      return res.status(404).json({ message: "order_not_found" });
    }

    // Un cliente solo puede editar sus propios pedidos.
    const role = req.user!.role;
    if (role === "user" && (!order.user || !order.user.equals(req.user!._id))) {
      return res.status(403).json({ message: "forbidden" });
    }

    // Solo se puede editar antes de entrar a preparación.
    if (order.status !== "PENDIENTE" && order.status !== "CONFIRMADO") {
      return res
        .status(409)
        .json({ message: "order_not_editable", status: order.status });
    }

    const { items, table, notes } = req.body as z.infer<typeof orderUpdateSchema>;

    const built = await buildOrderItems(items);
    if (!built.ok) {
      return res.status(built.status).json(built.body);
    }

    order.items = built.orderItems;
    order.total = mongoose.Types.Decimal128.fromString(built.total.toFixed(2));
    if (table !== undefined) order.table = table;
    if (notes !== undefined) order.notes = notes;
    await order.save();

    return res.status(200).json({
      message: "order_updated",
      order: order.toJSON(),
    });
  })
);

export default router;
