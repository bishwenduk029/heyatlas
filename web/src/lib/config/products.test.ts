import { describe, it, expect } from "@jest/globals";
import {
  PRODUCT_TIERS,
  getProductTierById,
  getProductTierByProductId,
  type PricingTier,
  type ProductFeature,
} from "./products";

describe("Product Configuration", () => {
  describe("PRODUCT_TIERS", () => {
    it("should have at least one product tier", () => {
      expect(PRODUCT_TIERS).toBeDefined();
      expect(Array.isArray(PRODUCT_TIERS)).toBe(true);
      expect(PRODUCT_TIERS.length).toBeGreaterThan(0);
    });

    it("should have valid tier structure", () => {
      PRODUCT_TIERS.forEach((tier) => {
        expect(tier).toHaveProperty("id");
        expect(tier).toHaveProperty("name");
        expect(tier).toHaveProperty("description");
        expect(tier).toHaveProperty("isPopular");
        expect(tier).toHaveProperty("features");
        expect(tier).toHaveProperty("pricing");
        expect(tier).toHaveProperty("prices");
        expect(tier).toHaveProperty("currency");

        expect(typeof tier.id).toBe("string");
        expect(typeof tier.name).toBe("string");
        expect(typeof tier.description).toBe("string");
        expect(typeof tier.isPopular).toBe("boolean");
        expect(Array.isArray(tier.features)).toBe(true);
        expect(typeof tier.pricing).toBe("object");
        expect(typeof tier.prices).toBe("object");
        expect(["USD", "EUR"]).toContain(tier.currency);
      });
    });

    it("should have valid pricing structure", () => {
      PRODUCT_TIERS.forEach((tier) => {
        expect(tier.pricing).toHaveProperty("creem");
        expect(tier.pricing.creem).toHaveProperty("oneTime");
        expect(tier.pricing.creem).toHaveProperty("monthly");

        expect(typeof tier.pricing.creem.oneTime).toBe("string");
        expect(typeof tier.pricing.creem.monthly).toBe("string");

        // Should not be empty strings
        expect(tier.pricing.creem.oneTime.length).toBeGreaterThan(0);
        expect(tier.pricing.creem.monthly.length).toBeGreaterThan(0);
      });
    });

    it("should have valid prices structure", () => {
      PRODUCT_TIERS.forEach((tier) => {
        expect(tier.prices).toHaveProperty("oneTime");
        expect(tier.prices).toHaveProperty("monthly");

        expect(typeof tier.prices.oneTime).toBe("number");
        expect(typeof tier.prices.monthly).toBe("number");

        // Prices should be non-negative (free tier has 0)
        expect(tier.prices.oneTime).toBeGreaterThanOrEqual(0);
        expect(tier.prices.monthly).toBeGreaterThanOrEqual(0);
      });
    });

    it("should have valid features structure", () => {
      PRODUCT_TIERS.forEach((tier) => {
        expect(tier.features.length).toBeGreaterThan(0);

        tier.features.forEach((feature: ProductFeature) => {
          expect(feature).toHaveProperty("name");
          expect(feature).toHaveProperty("included");
          expect(typeof feature.name).toBe("string");
          expect(typeof feature.included).toBe("boolean");
          expect(feature.name.length).toBeGreaterThan(0);

          if (feature.description) {
            expect(typeof feature.description).toBe("string");
          }
        });
      });
    });

    it("should have unique tier IDs", () => {
      const ids = PRODUCT_TIERS.map((tier) => tier.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have at most one popular tier", () => {
      const popularTiers = PRODUCT_TIERS.filter((tier) => tier.isPopular);
      expect(popularTiers.length).toBeLessThanOrEqual(1);
    });

    it("should contain expected tiers", () => {
      const tierIds = PRODUCT_TIERS.map((tier) => tier.id);
      expect(tierIds).toContain("free");
      expect(tierIds).toContain("pro");
      expect(tierIds).toContain("max");
    });

    it("should have correct pricing for each tier", () => {
      const freeTier = getProductTierById("free");
      const proTier = getProductTierById("pro");
      const maxTier = getProductTierById("max");

      expect(freeTier?.prices.monthly).toBe(0);
      expect(proTier?.prices.monthly).toBe(5);
      expect(maxTier?.prices.monthly).toBe(15);
    });
  });

  describe("getProductTierById", () => {
    it("should return correct tier for valid ID", () => {
      const freeTier = getProductTierById("free");
      expect(freeTier).toBeDefined();
      expect(freeTier?.id).toBe("free");
      expect(freeTier?.name).toBe("Free");

      const proTier = getProductTierById("pro");
      expect(proTier).toBeDefined();
      expect(proTier?.id).toBe("pro");
      expect(proTier?.name).toBe("Pro");

      const maxTier = getProductTierById("max");
      expect(maxTier).toBeDefined();
      expect(maxTier?.id).toBe("max");
      expect(maxTier?.name).toBe("Max");
    });

    it("should return undefined for invalid ID", () => {
      expect(getProductTierById("nonexistent")).toBeUndefined();
      expect(getProductTierById("")).toBeUndefined();
      expect(getProductTierById("invalid")).toBeUndefined();
      expect(getProductTierById("FREE")).toBeUndefined(); // Case sensitive
    });

    it("should handle edge cases", () => {
      expect(getProductTierById("")).toBeUndefined();
      expect(getProductTierById(" ")).toBeUndefined();
      expect(getProductTierById("null")).toBeUndefined();
      expect(getProductTierById("undefined")).toBeUndefined();
    });

    it("should return the full tier object with all properties", () => {
      const tier = getProductTierById("pro");
      expect(tier).toBeDefined();
      if (tier) {
        expect(tier).toHaveProperty("id", "pro");
        expect(tier).toHaveProperty("name", "Pro");
        expect(tier).toHaveProperty("description");
        expect(tier).toHaveProperty("isPopular", false);
        expect(tier).toHaveProperty("features");
        expect(tier).toHaveProperty("pricing");
        expect(tier).toHaveProperty("prices");
        expect(tier).toHaveProperty("currency", "USD");
      }
    });
  });

  describe("getProductTierByProductId", () => {
    it("should return correct tier for valid Creem product IDs", () => {
      // Test with known product IDs from the configuration
      const freeTier = getProductTierByProductId("free");
      expect(freeTier).toBeDefined();
      expect(freeTier?.id).toBe("free");

      const proTierMonthly = getProductTierByProductId("pro_monthly");
      expect(proTierMonthly).toBeDefined();
      expect(proTierMonthly?.id).toBe("pro");

      const maxTierMonthly = getProductTierByProductId("max_monthly");
      expect(maxTierMonthly).toBeDefined();
      expect(maxTierMonthly?.id).toBe("max");
    });

    it("should return undefined for invalid product ID", () => {
      expect(getProductTierByProductId("prod_invalid")).toBeUndefined();
      expect(getProductTierByProductId("")).toBeUndefined();
      expect(getProductTierByProductId("not_a_product_id")).toBeUndefined();
    });

    it("should handle edge cases", () => {
      expect(getProductTierByProductId("")).toBeUndefined();
      expect(getProductTierByProductId(" ")).toBeUndefined();
      expect(getProductTierByProductId("null")).toBeUndefined();
      expect(getProductTierByProductId("undefined")).toBeUndefined();
    });

    it("should find tiers by billing cycle product IDs", () => {
      // Test that we can find tiers by oneTime and monthly product IDs
      PRODUCT_TIERS.forEach((tier) => {
        const foundByOneTime = getProductTierByProductId(
          tier.pricing.creem.oneTime,
        );
        const foundByMonthly = getProductTierByProductId(
          tier.pricing.creem.monthly,
        );

        // Each product ID should find a tier
        expect(foundByOneTime).toBeDefined();
        expect(foundByMonthly).toBeDefined();

        // At least verify we get back valid tier objects
        if (foundByOneTime) expect(foundByOneTime.id).toBeTruthy();
        if (foundByMonthly) expect(foundByMonthly.id).toBeTruthy();
      });
    });

    it("should return the full tier object with all properties", () => {
      const tier = getProductTierByProductId("free");
      expect(tier).toBeDefined();
      if (tier) {
        expect(tier).toHaveProperty("id");
        expect(tier).toHaveProperty("name");
        expect(tier).toHaveProperty("description");
        expect(tier).toHaveProperty("isPopular");
        expect(tier).toHaveProperty("features");
        expect(tier).toHaveProperty("pricing");
        expect(tier).toHaveProperty("prices");
        expect(tier).toHaveProperty("currency");
      }
    });
  });

  describe("Type definitions", () => {
    it("should export correct TypeScript interfaces", () => {
      // This tests that the types are exportable and structured correctly
      const mockFeature: ProductFeature = {
        name: "Test Feature",
        included: true,
        description: "Test description",
      };

      const mockTier: PricingTier = {
        id: "test",
        name: "Test Tier",
        description: "Test description",
        isPopular: false,
        features: [mockFeature],
        pricing: {
          creem: {
            oneTime: "test_one_time",
            monthly: "test_monthly",
          },
        },
        prices: {
          oneTime: 10.99,
          monthly: 5.99,
        },
        currency: "USD",
      };

      expect(mockFeature.name).toBe("Test Feature");
      expect(mockTier.id).toBe("test");
    });
  });

  describe("Data integrity", () => {
    it("should have valid feature names", () => {
      const allFeatures = PRODUCT_TIERS.flatMap((tier) => tier.features);
      allFeatures.forEach((feature) => {
        expect(feature.name.trim()).toBe(feature.name); // No leading/trailing whitespace
        expect(feature.name).not.toBe(""); // Not empty
      });
    });

    it("should have reasonable price ranges", () => {
      PRODUCT_TIERS.forEach((tier) => {
        // Prices should be reasonable (between $0 and $10000)
        expect(tier.prices.oneTime).toBeGreaterThanOrEqual(0);
        expect(tier.prices.oneTime).toBeLessThan(10000);

        expect(tier.prices.monthly).toBeGreaterThanOrEqual(0);
        expect(tier.prices.monthly).toBeLessThan(1000);
      });
    });

    it("should have non-empty descriptions", () => {
      PRODUCT_TIERS.forEach((tier) => {
        expect(tier.description.trim()).toBe(tier.description);
        expect(tier.description).not.toBe("");
        expect(tier.description.length).toBeGreaterThan(5);
      });
    });
  });
});
