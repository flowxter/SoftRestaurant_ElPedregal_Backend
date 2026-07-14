import { Category } from "../models/Category";

const DEFAULT_CATEGORIES = [
  "Desayuno",
  "Entrada",
  "Almuerzo",
  "Plato fuerte",
  "Bebidas",
  "Postre",
  "Otros",
];

export async function seedCategoriesIfEmpty() {
  // Ensure the default categories exist without removing any custom categories.
  for (const name of DEFAULT_CATEGORIES) {
    await Category.findOneAndUpdate(
      { name },
      { name },
      { upsert: true, new: true }
    );
  }

  const count = await Category.countDocuments();
  if (count > 0) {
    console.log(`[seed] Categories exist (${count} total)`);
  }
}
