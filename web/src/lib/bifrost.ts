import env from "@/env";

export interface BifrostVirtualKeyResponse {
  key: string;
  user_id: string;
  org_id?: string;
  max_budget?: number; // amount in USD or tokens
  models?: string[];
}

class BifrostService {
  private baseUrl: string;
  private adminKey: string;

  constructor() {
    this.baseUrl = env.BIFROST_URL || "http://localhost:4000";
    // Remove trailing /v1 if present as the governance API is at the root
    if (this.baseUrl.endsWith("/v1")) {
      this.baseUrl = this.baseUrl.substring(0, this.baseUrl.length - 3);
    }
    this.adminKey = env.BIFROST_ADMIN_KEY || "";
  }

  /**
   * Create a new virtual key for a user
   * @param userId - The internal user ID
   * @param email - User's email (for metadata)
   * @param budgetLimit - Optional budget limit (in tokens or USD depending on Bifrost config)
   */
  async createVirtualKey(
    userId: string,
    email: string,
    budgetLimit?: number,
  ): Promise<string | null> {
    console.log(`[Bifrost] Creating virtual key for user ${userId} (${email})`);
    try {
      const response = await fetch(
        `${this.baseUrl}/api/governance/virtual-keys`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: email || `user-${userId}`,
            provider_configs: [
              {
                provider: "Basten",
                weight: 0.33,
                allowed_models: [],
              },
            ],
            mcp_configs: [],
            key_ids: ["c5c5f39a-571d-4af6-a0ab-2e9fbf77a295"],
            is_active: true,
            rate_limit: {
              token_max_limit: budgetLimit || 2000000,
              token_reset_duration: "1M",
              request_reset_duration: "1h",
            },
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        console.error(
          `[Bifrost] Failed to create key: ${response.status} ${error}`,
        );
        return null;
      }

      const data = await response.json();
      const key = data.virtual_key?.value;
      console.log(`[Bifrost] Key created successfully: ${key ? "yes" : "no"}`);
      return key;
    } catch (error) {
      console.error("[Bifrost] Error creating key:", error);
      return null;
    }
  }

  /**
   * Update an existing virtual key (e.g. for plan upgrade)
   * @param key - The virtual key to update
   * @param budgetLimit - New budget limit
   */
  async updateVirtualKey(key: string, budgetLimit: number): Promise<boolean> {
    if (!this.adminKey) {
      console.error("BIFROST_ADMIN_KEY is not set");
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/key/update`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.adminKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: key,
          max_budget: budgetLimit,
        }),
      });

      if (!response.ok) {
        console.error(`Failed to update Bifrost key: ${response.statusText}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error updating Bifrost key:", error);
      return false;
    }
  }

  /**
   * Get virtual key info including token usage
   * @param key - The virtual key to query
   * @returns Virtual key info with usage stats or null
   */
  async getVirtualKeyInfo(key: string): Promise<{
    key: string;
    tokensUsed: number;
    tokensLimit: number;
    tokensRemaining: number;
  } | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/governance/virtual-keys/${key}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        console.error(`Failed to get key info: ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      // Extract usage information
      const tokensLimit = data.rate_limit?.token_max_limit || 0;
      const tokensUsed = data.usage?.tokens_used || 0;
      const tokensRemaining = Math.max(0, tokensLimit - tokensUsed);

      return {
        key: data.virtual_key?.value || key,
        tokensUsed,
        tokensLimit,
        tokensRemaining,
      };
    } catch (error) {
      console.error("Error getting key info:", error);
      return null;
    }
  }
}

export const bifrost = new BifrostService();
