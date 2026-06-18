import { Schema, model, Types } from "mongoose";

export interface ProductAuditLogDocument {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  changedFields: Record<string, { from: unknown; to: unknown }>;
  createdAt: Date;
  updatedAt: Date;
}

const productAuditLogSchema = new Schema<ProductAuditLogDocument>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    changedFields: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const ProductAuditLog = model<ProductAuditLogDocument>(
  "ProductAuditLog",
  productAuditLogSchema
);
