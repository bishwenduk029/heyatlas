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
    description: "Meet Atlas, but with a bad memory",
    isPopular: false,
    features: [
      { name: "1M Tokens per month", included: true },
      { name: "Atlas Forgets Everything", included: true },
      {
        name: "Atlas can talk to your terminal coding agents (Claude Code, OpenCode, Goose)",
        included: true,
      },
      { name: "Atlas uses web search", included: false },
      { name: "Cloud desktop for Atlas", included: false },
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
    description: "Atlas actually remembers your name",
    isPopular: false,
    features: [
      { name: "5M Tokens per month", included: true },
      { name: "Atlas has memory", included: true },
      {
        name: "Atlas can talk to your terminal coding agents (Claude Code, OpenCode, Goose)",
        included: true,
      },
      { name: "Atlas uses web search", included: true },
      { name: "Atlas has a cloud desktop", included: false },
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
  {
    id: "max",
    name: "Max",
    description: "Atlas has perfect memory + computer",
    isPopular: false,
    features: [
      { name: "20M Tokens per month", included: true },
      { name: "Atlas has memory", included: true },
      {
        name: "Atlas can talk to your terminal coding agents (Claude Code, OpenCode, Goose)",
        included: true,
      },
      { name: "Atlas uses web search", included: true },
      { name: "Atlas has a cloud desktop", included: true },
    ],
    pricing: {
      creem: {
        oneTime: "max_monthly",
        monthly: "max_monthly",
      },
    },
    prices: {
      oneTime: 15,
      monthly: 15,
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
