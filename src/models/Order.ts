import { Schema, model, Types } from "mongoose";

export type OrderStatus =
  | "PENDIENTE"
  | "CONFIRMADO"
  | "EN_PREPARACION"
  | "ENTREGADO"
  | "FACTURADO"
  | "CANCELADO";

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDIENTE",
  "CONFIRMADO",
  "EN_PREPARACION",
  "ENTREGADO",
  "FACTURADO",
  "CANCELADO",
];

export type PaymentMethod = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "EFECTIVO",
  "TARJETA",
  "TRANSFERENCIA",
];

export interface OrderItem {
  product: Types.ObjectId;
  name: string;
  unitPrice: Types.Decimal128;
  quantity: number;
  subtotal: Types.Decimal128;
}

export interface OrderStatusChange {
  from: OrderStatus | null;
  to: OrderStatus;
  changedBy?: Types.ObjectId;
  changedAt: Date;
}

export interface OrderDocument {
  _id: Types.ObjectId;
  number?: number;
  user?: Types.ObjectId;
  customerName?: string;
  customerPhone?: string;
  table?: string;
  notes?: string;
  items: OrderItem[];
  total: Types.Decimal128;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  statusHistory: OrderStatusChange[];
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<OrderItem>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    unitPrice: { type: Schema.Types.Decimal128, required: true },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Schema.Types.Decimal128, required: true },
  },
  { _id: false }
);

const orderStatusChangeSchema = new Schema<OrderStatusChange>(
  {
    from: { type: String, enum: ORDER_STATUSES, default: null },
    to: { type: String, enum: ORDER_STATUSES, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: "User", required: false },
    changedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new Schema<OrderDocument>(
  {
    // Número de pedido legible/secuencial (para mostrar y enrutar en la UI).
    number: { type: Number, unique: true, sparse: true, index: true },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    // Datos del cliente cuando el pedido lo hace un invitado (sin cuenta).
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    // Mesa/ubicación y notas del pedido (lo que muestra y edita la UI).
    table: { type: String, trim: true },
    notes: { type: String, trim: true },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: OrderItem[]) => items.length > 0,
        message: "order must contain at least one item",
      },
    },
    total: { type: Schema.Types.Decimal128, required: true },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "PENDIENTE",
      required: true,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "EFECTIVO",
      required: true,
    },
    statusHistory: {
      type: [orderStatusChangeSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret["total"] != null) {
          ret["total"] = parseFloat(String(ret["total"]));
        }
        if (Array.isArray(ret["items"])) {
          for (const item of ret["items"] as Record<string, unknown>[]) {
            if (item["unitPrice"] != null) {
              item["unitPrice"] = parseFloat(String(item["unitPrice"]));
            }
            if (item["subtotal"] != null) {
              item["subtotal"] = parseFloat(String(item["subtotal"]));
            }
          }
        }
        return ret;
      },
    },
  }
);

/*
 * Índices para reportes de ventas: el rango de fechas (createdAt) es la
 * condición común, y status/paymentMethod son los filtros de igualdad.
 */
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentMethod: 1, createdAt: -1 });

export const Order = model<OrderDocument>("Order", orderSchema);
