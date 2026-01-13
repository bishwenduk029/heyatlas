import { betterAuth } from "better-auth";
import {
  createAuthMiddleware,
  magicLink,
  deviceAuthorization,
  bearer,
} from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  dodopayments,
  checkout,
  portal,
  webhooks,
} from "@dodopayments/better-auth";
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
  FREE: 1000000, // 1M tokens
  PRO: 5000000, // 5M tokens ($5)
};

// Create DodoPayments client
export const dodoPayments = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment:
    (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ||
    "test_mode",
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
    "https://heyatlas.app",
    "https://www.heyatlas.app",
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
      trustedProviders: ["google", "github"],
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
            // Check DB to see if user already has a key (since returnedData.user might not show it)
            const user = await db.query.users.findFirst({
              where: eq(tables.users.id, userId),
              columns: { bifrostApiKey: true },
            });

            if (user && !user.bifrostApiKey) {
              const key = await bifrost.createVirtualKey(
                userId,
                userEmail,
                PLAN_LIMITS.FREE,
              );

              if (key) {
                await db
                  .update(tables.users)
                  .set({ bifrostApiKey: key })
                  .where(eq(tables.users.id, userId));
              }
            }
          } catch {
            // Silently handle Bifrost key errors
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await sendMagicLink(email, url, request as any);
      },
    }),
    deviceAuthorization({
      verificationUri: "/device",
    }),
    bearer(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dodopayments as any)({
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
          successUrl: "/chat", // Your success page URL
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
          onPaymentSucceeded: async () => {},
          onPaymentFailed: async () => {},
          onPaymentProcessing: async () => {},
          onPaymentCancelled: async () => {},
          // Refund event handlers
          onRefundSucceeded: async () => {},
          onRefundFailed: async () => {},
          // Dispute event handlers
          onDisputeOpened: async () => {},
          onDisputeExpired: async () => {},
          onDisputeAccepted: async () => {},
          onDisputeCancelled: async () => {},
          onDisputeChallenged: async () => {},
          onDisputeWon: async () => {},
          onDisputeLost: async () => {},
          // Subscription event handlers
          onSubscriptionActive: async (payload) => {
            try {
              // @ts-expect-error amount might not exist on all payload types
              const amount = payload.data?.amount || 0;
              let limit = PLAN_LIMITS.FREE;

              if (amount >= 2000) limit = PLAN_LIMITS.PRO;

              // @ts-expect-error customer_id might be named differently in some types
              const customerId = payload.data?.customer_id;
              if (customerId) {
                const user = await db.query.users.findFirst({
                  where: eq(tables.users.paymentProviderCustomerId, customerId),
                  columns: { bifrostApiKey: true },
                });

                if (user && user.bifrostApiKey) {
                  await bifrost.updateVirtualKey(user.bifrostApiKey, limit);
                }
              }
            } catch {
              // Silently handle errors
            }
          },
          onSubscriptionOnHold: async () => {},
          onSubscriptionRenewed: async () => {},
          onSubscriptionPlanChanged: async (payload) => {
            try {
              // @ts-expect-error amount might not exist on all payload types
              const amount = payload.data?.amount || 0;
              let limit = PLAN_LIMITS.FREE;

              if (amount >= 2000) limit = PLAN_LIMITS.PRO;

              // @ts-expect-error customer_id might be named differently in some types
              const customerId = payload.data?.customer_id;
              if (customerId) {
                const user = await db.query.users.findFirst({
                  where: eq(tables.users.paymentProviderCustomerId, customerId),
                  columns: { bifrostApiKey: true },
                });

                if (user && user.bifrostApiKey) {
                  await bifrost.updateVirtualKey(user.bifrostApiKey, limit);
                }
              }
            } catch {
              // Silently handle errors
            }
          },
          onSubscriptionCancelled: async (payload) => {
            try {
              const limit = PLAN_LIMITS.FREE;
              // @ts-expect-error customer_id might be named differently in some types
              const customerId = payload.data?.customer_id;
              if (customerId) {
                const user = await db.query.users.findFirst({
                  where: eq(tables.users.paymentProviderCustomerId, customerId),
                  columns: { bifrostApiKey: true },
                });

                if (user && user.bifrostApiKey) {
                  await bifrost.updateVirtualKey(user.bifrostApiKey, limit);
                }
              }
            } catch {
              // Silently handle errors
            }
          },
          onSubscriptionFailed: async () => {},
          onSubscriptionExpired: async () => {},
          // License key event handlers
          onLicenseKeyCreated: async () => {},
        }),
      ],
    }),
  ],
});
