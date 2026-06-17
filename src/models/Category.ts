import { Schema, model, Types } from "mongoose";

export interface CategoryDocument {
  _id: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDocument>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export const Category = model<CategoryDocument>("Category", categorySchema);
