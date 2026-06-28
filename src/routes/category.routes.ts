import { Router } from "express";

import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticate } from "../middlewares/auth";
import { Category } from "../models/Category";

const router = Router();

router.get(
  "/",
  authenticate,
  asyncHandler(async (_req, res) => {
    const categories = await Category.find().sort({ name: 1 }).lean();
    return res.status(200).json({
      message: "categories_retrieved",
      categories,
    });
  })
);

export default router;
