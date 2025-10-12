/**
 * 定义产品特性
 */
export interface ProductFeature {
  name: string;
  included: boolean;
  description?: string;
}

/**
 * 定义一个定价套餐
 */
export interface PricingTier {
  id: string; // 我们系统内部的套餐 ID，如 'free', 'pro', 'enterprise'
  name: string;
  description: string;
  isPopular: boolean;
  features: ProductFeature[];
  pricing: {
    // 针对不同支付提供商的产品ID
    creem: {
      oneTime: string;
      monthly: string;
      yearly: string;
    };
    // stripe: { ... }; // 为未来扩展预留
  };
  prices: {
    oneTime: number;
    monthly: number;
    yearly: number;
  };
  currency: "USD" | "EUR"; // 支持的货币
}

/**
 * 统一定义所有产品套餐
 * 每个计费模式 (one_time, monthly, yearly) 都需要一个唯一的产品ID。
 */
export const PRODUCT_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    description: "Perfect for getting started",
    isPopular: false,
    features: [
      { name: "2M Tokens/month", included: true },
      { name: "Basic Voice Interaction", included: true },
      { name: "Standard Support", included: true },
      { name: "Limited Web Automation", included: false },
      { name: "Priority Processing", included: false },
    ],
    pricing: {
      creem: {
        oneTime: "free",
        monthly: "free",
        yearly: "free",
      },
    },
    prices: {
      oneTime: 0,
      monthly: 0,
      yearly: 0,
    },
    currency: "USD",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For power users and creators",
    isPopular: true,
    features: [
      { name: "20M Tokens/month", included: true },
      { name: "Advanced Voice Models", included: true },
      { name: "Priority Support", included: true },
      { name: "Full Web Automation", included: true },
      { name: "Custom Personas", included: true },
    ],
    pricing: {
      creem: {
        oneTime: "pro_monthly",
        monthly: "pro_monthly",
        yearly: "pro_yearly",
      },
    },
    prices: {
      oneTime: 20,
      monthly: 20,
      yearly: 200,
    },
    currency: "USD",
  },
  {
    id: "max",
    name: "Max",
    description: "Ultimate power for businesses",
    isPopular: false,
    features: [
      { name: "200M Tokens/month", included: true },
      { name: "Dedicated Support", included: true },
      { name: "Unlimited Web Automation", included: true },
      { name: "Custom Integrations", included: true },
      { name: "Early Access Features", included: true },
    ],
    pricing: {
      creem: {
        oneTime: "max_monthly",
        monthly: "max_monthly",
        yearly: "max_yearly",
      },
    },
    prices: {
      oneTime: 100,
      monthly: 100,
      yearly: 1000,
    },
    currency: "USD",
  },
];

/**
 * 根据内部套餐 ID 获取套餐详情
 * @param id - 套餐 ID ('pro', 'enterprise'等)
 * @returns PricingTier | undefined
 */
export const getProductTierById = (id: string): PricingTier | undefined => {
  return PRODUCT_TIERS.find((tier) => tier.id === id);
};

/**
 * 根据支付提供商的产品ID反查套餐详情
 * @param productId - 支付提供商的产品 ID
 * @returns PricingTier | undefined
 */
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
