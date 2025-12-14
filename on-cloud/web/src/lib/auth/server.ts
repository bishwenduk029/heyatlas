import { betterAuth } from "better-auth";
import { createAuthMiddleware, magicLink } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { dodopayments, checkout, portal, webhooks } from "@dodopayments/better-auth";
import DodoPayments from "dodopayments";
import * as tables from "@/database/tables";
import env from "@/env";
import { db } from "@/database";
import { sendMagicLink } from "@/emails/magic-link";
import { APP_NAME } from "@/lib/config/constants";
import { providerConfigs } from "./providers";
import { bifrost } from "@/lib/bifrost";
import { eq } from "drizzle-orm";

// Token limits based on pricing plans
const PLAN_LIMITS = {
  FREE: 2000000, // 2M tokens
  PRO: 20000000, // 20M tokens ($20)
  MAX: 200000000, // 200M tokens ($100)
};

// Create DodoPayments client
export const dodoPayments = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode" || "test_mode",
});

// Dynamically build social providers based on environment variables
const socialProviders: Record<
  string,
  { clientId: string; clientSecret: string }
> = {};

// Build social providers object based on available environment variables using unified configuration
providerConfigs.forEach(({ name, clientIdKey, clientSecretKey }) => {
  const clientId = env[clientIdKey];
  const clientSecret = env[clientSecretKey];

  if (clientId && clientSecret) {
    socialProviders[name] = {
      clientId: clientId as string,
      clientSecret: clientSecret as string,
    };
  }
});

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    env.NEXT_PUBLIC_APP_URL,
    "https://nirmanus.vercel.app",
    "https://heycomputer-me.vercel.app",
    "https://heycomputer.me",
    "https://www.heycomputer.me",
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [])
  ],
  logger: {
    disabled: process.env.NODE_ENV === "production",
    level: "debug",
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    cookieCache: {
      enabled: false,
    },
    additionalFields: {},
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
      },
    },
  },
  socialProviders,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...tables,
    },
    usePlural: true,
  }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github", "linkedin"],
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/get-session")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const returnedData = ctx.context.returned as any;
        // Check if we have a valid session and user in the response
        if (returnedData?.user && returnedData?.session) {
          const userId = returnedData.user.id;
          const userEmail = returnedData.user.email;

          try {
            console.log(`[Auth] Checking DB for user ${userId} key status...`);
            // Check DB to see if user already has a key (since returnedData.user might not show it)
            const user = await db.query.users.findFirst({
              where: eq(tables.users.id, userId),
              columns: { bifrostApiKey: true }
            });

            if (user && !user.bifrostApiKey) {
              const key = await bifrost.createVirtualKey(userId, userEmail, PLAN_LIMITS.FREE);

              if (key) {
                await db.update(tables.users)
                  .set({ bifrostApiKey: key })
                  .where(eq(tables.users.id, userId));
              } else {
                console.error(`[Auth] Failed to generate Bifrost key during backfill`);
              }
            } else if (user) {
                 console.log(`[Auth] User ${userId} already has a key`);
            } else {
                console.warn(`[Auth] User ${userId} not found in DB query!`);
            }
          } catch (error) {
            console.error("[Auth] Failed to check/backfill Bifrost key:", error);
          }
        }
      }
    }),
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }, request) => {
        if (process.env.NODE_ENV === "development") {
          console.log("✨ Magic link: " + url);
        }
        await sendMagicLink(email, url, request);
      },
    }),
    dodopayments({
      client: dodoPayments,
      createCustomerOnSignUp: true,
      use: [
        checkout({
          products: [
            // Add your products here with their Dodo Payments product IDs and slugs
            // Example:
            // {
            //   productId: "pdt_xxxxxxxxxxxxxxxxxxxxx", // Your actual product ID from Dodo Payments
            //   slug: "premium-plan", // Friendly slug for checkout
            // },
          ],
          successUrl: "/voice", // Your success page URL
          authenticatedUsersOnly: true, // Require login for checkout
        }),
        portal(),
        webhooks({
          webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET!,
          // Generic handler for all webhook events
          onPayload: async () => {
            // console.log("Received webhook:", payload.event_type || payload.type);
          },
          // Payment event handlers
          onPaymentSucceeded: async (payload) => {
            console.log("Payment succeeded:", payload);
          },
          onPaymentFailed: async (payload) => {
            console.log("Payment failed:", payload);
          },
          onPaymentProcessing: async (payload) => {
            console.log("Payment processing:", payload);
          },
          onPaymentCancelled: async (payload) => {
            console.log("Payment cancelled:", payload);
          },
          // Refund event handlers
          onRefundSucceeded: async (payload) => {
            console.log("Refund succeeded:", payload);
          },
          onRefundFailed: async (payload) => {
            console.log("Refund failed:", payload);
          },
          // Dispute event handlers
          onDisputeOpened: async (payload) => {
            console.log("Dispute opened:", payload);
          },
          onDisputeExpired: async (payload) => {
            console.log("Dispute expired:", payload);
          },
          onDisputeAccepted: async (payload) => {
            console.log("Dispute accepted:", payload);
          },
          onDisputeCancelled: async (payload) => {
            console.log("Dispute cancelled:", payload);
          },
          onDisputeChallenged: async (payload) => {
            console.log("Dispute challenged:", payload);
          },
          onDisputeWon: async (payload) => {
            console.log("Dispute won:", payload);
          },
          onDisputeLost: async (payload) => {
            console.log("Dispute lost:", payload);
          },
          // Subscription event handlers
          onSubscriptionActive: async (payload) => {
            console.log("Subscription active:", payload);
            try {
              // Determine limit based on amount (heuristic until product IDs are final)
              // DodoPayments amounts are usually in minor units (cents) if currency is USD?
              // Or just check amount field. Assuming 2000 for $20, 10000 for $100 if in cents.
              // If generic amount:
              // @ts-expect-error amount might not exist on all payload types
              const amount = payload.data?.amount || 0;
              let limit = PLAN_LIMITS.FREE;

              if (amount >= 10000) limit = PLAN_LIMITS.MAX; // $100+
              else if (amount >= 2000) limit = PLAN_LIMITS.PRO; // $20+

              // Find user by customer ID
              // @ts-expect-error customer_id might be named differently in some types
              const customerId = payload.data?.customer_id;
              if (customerId) {
                const user = await db.query.users.findFirst({
                   where: eq(tables.users.paymentProviderCustomerId, customerId),
                   columns: { bifrostApiKey: true }
                });

                if (user && user.bifrostApiKey) {
                   await bifrost.updateVirtualKey(user.bifrostApiKey, limit);
                   console.log(`Updated Bifrost limit to ${limit} for customer ${customerId}`);
                }
              }
            } catch (e) {
               console.error("Error handling subscription active:", e);
            }
          },
          onSubscriptionOnHold: async (payload) => {
            console.log("Subscription on hold:", payload);
          },
          onSubscriptionRenewed: async (payload) => {
            console.log("Subscription renewed:", payload);
            // Logic same as active usually, ensuring limit is maintained
          },
          onSubscriptionPlanChanged: async (payload) => {
             console.log("Subscription plan changed:", payload);
             try {
              // @ts-expect-error amount might not exist on all payload types
              const amount = payload.data?.amount || 0;
              let limit = PLAN_LIMITS.FREE;

              if (amount >= 10000) limit = PLAN_LIMITS.MAX;
              else if (amount >= 2000) limit = PLAN_LIMITS.PRO;

              // @ts-expect-error customer_id might be named differently in some types
              const customerId = payload.data?.customer_id;
              if (customerId) {
                const user = await db.query.users.findFirst({
                   where: eq(tables.users.paymentProviderCustomerId, customerId),
                   columns: { bifrostApiKey: true }
                });

                if (user && user.bifrostApiKey) {
                   await bifrost.updateVirtualKey(user.bifrostApiKey, limit);
                   console.log(`Updated Bifrost limit to ${limit} for customer ${customerId}`);
                }
              }
            } catch (e) {
               console.error("Error handling subscription change:", e);
            }
          },
          onSubscriptionCancelled: async (payload) => {
            console.log("Subscription cancelled:", payload);
             try {
              // Downgrade to free
              const limit = PLAN_LIMITS.FREE;
              // @ts-expect-error customer_id might be named differently in some types
              const customerId = payload.data?.customer_id;
              if (customerId) {
                const user = await db.query.users.findFirst({
                   where: eq(tables.users.paymentProviderCustomerId, customerId),
                   columns: { bifrostApiKey: true }
                });

                if (user && user.bifrostApiKey) {
                   await bifrost.updateVirtualKey(user.bifrostApiKey, limit);
                   console.log(`Downgraded Bifrost limit to FREE for customer ${customerId}`);
                }
              }
            } catch (e) {
               console.error("Error handling subscription cancellation:", e);
            }
          },
          onSubscriptionFailed: async (payload) => {
            console.log("Subscription failed:", payload);
          },
          onSubscriptionExpired: async (payload) => {
            console.log("Subscription expired:", payload);
          },
          // License key event handlers
          onLicenseKeyCreated: async (payload) => {
            console.log("License key created:", payload);
          },
        }),
      ],
    }),
  ],
});
