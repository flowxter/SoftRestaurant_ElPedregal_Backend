import { Schema, model, Types } from "mongoose";

export type PromotionType = "percentage" | "fixed_amount";

export interface PromotionDocument {
  _id: Types.ObjectId;
  name: string;
  type: PromotionType;
  value: number;
  product: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const promotionSchema = new Schema<PromotionDocument>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["percentage", "fixed_amount"],
      required: true,
    },
    value: { type: Number, required: true },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        const now = new Date();
        const endDate = ret["endDate"] as Date;
        if (ret["isActive"] === true && endDate < now) {
          ret["isActive"] = false;
          ret["_expired"] = true;
        }
        return ret;
      },
    },
  }
);

promotionSchema.index({ product: 1, startDate: 1, endDate: 1 });

export const Promotion = model<PromotionDocument>("Promotion", promotionSchema);
