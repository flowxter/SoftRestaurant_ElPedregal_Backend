import { Router } from "express";

import { asyncHandler } from "../middlewares/asyncHandler";
import { Category } from "../models/Category";

const router = Router();

// Público: las categorías del menú se pueden consultar sin iniciar sesión.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const categories = await Category.find().sort({ name: 1 }).lean();
    return res.status(200).json({
      message: "categories_retrieved",
      categories,
    });
  })
);

export default router;
