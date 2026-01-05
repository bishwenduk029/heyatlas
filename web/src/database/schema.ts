import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  uuid,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// Define user role enum
export const userRoleEnum = pgEnum("user_role", [
  "user",
  "admin",
  "super_admin",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("user"),
  bifrostApiKey: text("bifrostApiKey"),
  paymentProviderCustomerId: text("paymentProviderCustomerId").unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  // Pre-parsed userAgent fields for performance optimization
  os: text("os"),
  browser: text("browser"),
  deviceType: text("deviceType"),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
  },
  (table) => {
    return {
      userIdx: index("accounts_userId_idx").on(table.userId),
    };
  },
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

// Subscription table to store user subscription information
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerId: text("customerId").notNull(),
    subscriptionId: text("subscriptionId").notNull().unique(),
    productId: text("productId").notNull(),
    status: text("status").notNull(),
    currentPeriodStart: timestamp("currentPeriodStart"),
    currentPeriodEnd: timestamp("currentPeriodEnd"),
    canceledAt: timestamp("canceledAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => {
    return {
      userIdx: index("subscriptions_userId_idx").on(table.userId),
      customerIdIdx: index("subscriptions_customerId_idx").on(table.customerId),
    };
  },
);

// Payment records table to store payment history
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerId: text("customerId").notNull(),
    subscriptionId: text("subscriptionId"),
    productId: text("productId").notNull(),
    paymentId: text("paymentId").notNull().unique(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull(),
    paymentType: text("paymentType").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => {
    return {
      userIdx: index("payments_userId_idx").on(table.userId),
    };
  },
);

// Webhook events table to ensure idempotency
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("eventId").notNull().unique(), // Unique identifier from webhook provider
    eventType: text("eventType").notNull(),
    provider: text("provider").notNull().default("creem"), // Support multiple providers
    processed: boolean("processed").notNull().default(true),
    processedAt: timestamp("processedAt").notNull().defaultNow(),
    payload: text("payload"), // Store original payload for debugging
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => {
    return {
      eventIdIdx: index("webhook_events_eventId_idx").on(table.eventId),
      providerIdx: index("webhook_events_provider_idx").on(table.provider),
    };
  },
);

// File uploads table to store uploaded file metadata
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileKey: text("fileKey").notNull(), // Key in R2 storage
    url: text("url").notNull(), // Public access URL
    fileName: text("fileName").notNull(), // Original file name
    fileSize: integer("fileSize").notNull(), // File size in bytes
    contentType: text("contentType").notNull(), // MIME type
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => {
    return {
      userIdx: index("uploads_userId_idx").on(table.userId),
      fileKeyIdx: index("uploads_fileKey_idx").on(table.fileKey),
    };
  },
);

// Device authorization codes for CLI authentication (RFC 8628)
export const deviceCodes = pgTable(
  "device_codes",
  {
    id: text("id").primaryKey(),
    deviceCode: text("device_code").notNull(),
    userCode: text("user_code").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id"),
    scope: text("scope"),
    status: text("status").notNull().default("pending"), // pending, approved, denied
    expiresAt: timestamp("expires_at").notNull(),
    lastPolledAt: timestamp("last_polled_at"),
    pollingInterval: integer("polling_interval").notNull().default(5),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      deviceCodeIdx: index("device_codes_device_code_idx").on(table.deviceCode),
      userCodeIdx: index("device_codes_user_code_idx").on(table.userCode),
    };
  },
);

// MCP Configuration table to store agent configurations
export const mcpConfigs = pgTable(
  "mcp_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentType: text("agentType").notNull(), // 'goose' or 'opencode'
    config: text("config").notNull(), // JSON string or YAML string
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => {
    return {
      userIdx: index("mcp_configs_userId_idx").on(table.userId),
      // Ensure one config per agent type per user
      uniqueConfig: index("mcp_configs_unique_idx").on(table.userId, table.agentType),
    };
  },
);
