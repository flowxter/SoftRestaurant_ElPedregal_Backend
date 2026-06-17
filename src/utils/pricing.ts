import { Types } from "mongoose";

import { Promotion, PromotionDocument } from "../models/Promotion";

export async function getActivePromotion(
  productId: Types.ObjectId | string
): Promise<PromotionDocument | null> {
  const now = new Date();
  return Promotion.findOne({
    product: productId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });
}

export function applyDiscount(
  originalPrice: number,
  promotion: PromotionDocument
): number {
  let discounted: number;

  if (promotion.type === "percentage") {
    discounted = originalPrice * (1 - promotion.value / 100);
  } else {
    discounted = originalPrice - promotion.value;
  }

  return Math.max(0, Math.round(discounted * 100) / 100);
}

export interface PriceBreakdown {
  originalPrice: number;
  finalPrice: number;
  discount: number;
  promotion: {
    id: string;
    name: string;
    type: string;
    value: number;
  } | null;
}

export async function calculatePrice(
  productId: Types.ObjectId | string,
  originalPrice: number
): Promise<PriceBreakdown> {
  const promo = await getActivePromotion(productId);

  if (!promo) {
    return {
      originalPrice,
      finalPrice: originalPrice,
      discount: 0,
      promotion: null,
    };
  }

  const finalPrice = applyDiscount(originalPrice, promo);

  return {
    originalPrice,
    finalPrice,
    discount: Math.round((originalPrice - finalPrice) * 100) / 100,
    promotion: {
      id: promo._id.toString(),
      name: promo.name,
      type: promo.type,
      value: promo.value,
    },
  };
}
