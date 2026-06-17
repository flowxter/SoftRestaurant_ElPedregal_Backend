import { Schema, model, Types } from "mongoose";

export type UserRole = "admin" | "employee" | "user";

export interface UserDocument {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "employee", "user"],
      default: "user",
    },
  },
  { timestamps: true }
);

export const User = model<UserDocument>("User", userSchema);
