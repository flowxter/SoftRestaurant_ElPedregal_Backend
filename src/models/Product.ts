import { Schema, model, Types } from "mongoose";

export interface ProductDocument {
  _id: Types.ObjectId;
  name: string;
  description: string;
  price: Types.Decimal128;
  category: Types.ObjectId;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<ProductDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Schema.Types.Decimal128, required: true },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    image: { type: String, default: undefined },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret["price"] != null) {
          ret["price"] = parseFloat(String(ret["price"]));
        }
        return ret;
      },
    },
  }
);

productSchema.index({ name: 1, category: 1 }, { unique: true });

export const Product = model<ProductDocument>("Product", productSchema);
