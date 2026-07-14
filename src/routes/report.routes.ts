import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import { authorize } from "../middlewares/authorize";
import { Order, ORDER_STATUSES, PAYMENT_METHODS } from "../models/Order";

const router = Router();

/* ------------------------------------------------------------------ */
/*  Zod schema (query params)                                         */
/* ------------------------------------------------------------------ */

const salesReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
/** SLA del reporte: la consulta se aborta si supera este tiempo. */
const QUERY_TIMEOUT_MS = 3000;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface ReportBucket {
  orders: number;
  revenue: number;
}

function roundBuckets<T extends ReportBucket>(buckets: T[]): T[] {
  return buckets.map((bucket) => ({
    ...bucket,
    revenue: round2(bucket.revenue),
  }));
}

/* ------------------------------------------------------------------ */
/*  GET /sales — reporte de ventas (solo admin)                       */
/* ------------------------------------------------------------------ */

router.get(
  "/sales",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = salesReportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        message: "validation_error",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { status, paymentMethod } = parsed.data;

    // "to" sin hora ("YYYY-MM-DD") se interpreta como fin de día (inclusivo)
    let to = parsed.data.to ?? new Date();
    if (
      typeof req.query["to"] === "string" &&
      DATE_ONLY_REGEX.test(req.query["to"])
    ) {
      to = new Date(to.getTime() + DAY_MS - 1);
    }
    const from =
      parsed.data.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

    if (from > to) {
      return res.status(400).json({ message: "invalid_date_range" });
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      return res.status(400).json({
        message: "date_range_too_large",
        maxDays: MAX_RANGE_DAYS,
      });
    }

    const match: Record<string, unknown> = {
      createdAt: { $gte: from, $lte: to },
    };
    if (status) {
      match["status"] = status;
    }
    if (paymentMethod) {
      // Pedidos previos a la existencia del campo cuentan como EFECTIVO
      // (default del schema); $in con null también matchea campo ausente.
      match["paymentMethod"] =
        paymentMethod === "EFECTIVO"
          ? { $in: [paymentMethod, null] }
          : paymentMethod;
    }

    const startedAt = Date.now();

    let result: Record<string, never[]> | undefined;
    try {
      [result] = await Order.aggregate([
        { $match: match },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  totalOrders: { $sum: 1 },
                  totalRevenue: { $sum: { $toDouble: "$total" } },
                  averageOrderValue: { $avg: { $toDouble: "$total" } },
                },
              },
              { $project: { _id: 0 } },
            ],
            byStatus: [
              {
                $group: {
                  _id: "$status",
                  orders: { $sum: 1 },
                  revenue: { $sum: { $toDouble: "$total" } },
                },
              },
              { $project: { _id: 0, status: "$_id", orders: 1, revenue: 1 } },
              { $sort: { revenue: -1 } },
            ],
            byPaymentMethod: [
              {
                $group: {
                  _id: { $ifNull: ["$paymentMethod", "EFECTIVO"] },
                  orders: { $sum: 1 },
                  revenue: { $sum: { $toDouble: "$total" } },
                },
              },
              {
                $project: {
                  _id: 0,
                  paymentMethod: "$_id",
                  orders: 1,
                  revenue: 1,
                },
              },
              { $sort: { revenue: -1 } },
            ],
            byDay: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                  },
                  orders: { $sum: 1 },
                  revenue: { $sum: { $toDouble: "$total" } },
                },
              },
              { $project: { _id: 0, date: "$_id", orders: 1, revenue: 1 } },
              { $sort: { date: 1 } },
            ],
          },
        },
      ])
        .option({ maxTimeMS: QUERY_TIMEOUT_MS })
        .exec();
    } catch (error) {
      if (
        error instanceof Error &&
        (error as { codeName?: string }).codeName === "MaxTimeMSExpired"
      ) {
        return res.status(504).json({
          message: "report_query_timeout",
          maxTimeMs: QUERY_TIMEOUT_MS,
        });
      }
      throw error;
    }

    const rawSummary = (result?.["summary"]?.[0] ?? {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
    }) as { totalOrders: number; totalRevenue: number; averageOrderValue: number };

    return res.status(200).json({
      message: "sales_report",
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        status: status ?? null,
        paymentMethod: paymentMethod ?? null,
      },
      summary: {
        totalOrders: rawSummary.totalOrders,
        totalRevenue: round2(rawSummary.totalRevenue),
        averageOrderValue: round2(rawSummary.averageOrderValue),
      },
      byStatus: roundBuckets(result?.["byStatus"] ?? []),
      byPaymentMethod: roundBuckets(result?.["byPaymentMethod"] ?? []),
      byDay: roundBuckets(result?.["byDay"] ?? []),
      tookMs: Date.now() - startedAt,
    });
  })
);

export default router;
