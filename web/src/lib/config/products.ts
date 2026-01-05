export interface ProductFeature {
  name: string;
  included: boolean;
  description?: string;
}

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  isPopular: boolean;
  features: ProductFeature[];
  pricing: {
    creem: {
      oneTime: string;
      monthly: string;
    };
  };
  prices: {
    oneTime: number;
    monthly: number;
  };
  currency: "USD" | "EUR";
}

export const PRODUCT_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    description: "Perfect for trying out Atlas",
    isPopular: false,
    features: [
      { name: "1M Tokens per month", included: true },
      { name: "Basic conversation", included: true },
      { name: "Terminal agent connections", included: true },
      { name: "Web search", included: false },
      { name: "Memory persistence", included: false },
    ],
    pricing: {
      creem: {
        oneTime: "free",
        monthly: "free",
      },
    },
    prices: {
      oneTime: 0,
      monthly: 0,
    },
    currency: "USD",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For serious users who need reliability",
    isPopular: true,
    features: [
      { name: "5M Tokens per month", included: true },
      { name: "Full conversation memory", included: true },
      { name: "Terminal agent connections", included: true },
      { name: "Web search", included: true },
      { name: "Priority support", included: true },
    ],
    pricing: {
      creem: {
        oneTime: "pro_monthly",
        monthly: "pro_monthly",
      },
    },
    prices: {
      oneTime: 5,
      monthly: 5,
    },
    currency: "USD",
  },
];

export const getProductTierById = (id: string): PricingTier | undefined => {
  return PRODUCT_TIERS.find((tier) => tier.id === id);
};

export const getProductTierByProductId = (
  productId: string,
): PricingTier | undefined => {
  for (const tier of PRODUCT_TIERS) {
    if (Object.values(tier.pricing.creem).includes(productId)) {
      return tier;
    }
  }
  return undefined;
};
