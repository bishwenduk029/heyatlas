import * as schema from "@/database/schema";

/**
 * Declare business tables you want to manage through the universal table manager.
 * key: Table URL path name (e.g., 'uploads')
 * value: Drizzle table object exported from @/database/schema (e.g., schema.uploads)
 */
export const enabledTablesMap = {
  uploads: schema.uploads,
  sessions: schema.sessions,
  payments: schema.payments,
  subscriptions: schema.subscriptions,
  users: schema.users,
  verifications: schema.verifications,
  // Example: If you have a "products" table, add it here:
  // products: schema.products,
} as const;

export type EnabledTableKeys = keyof typeof enabledTablesMap;
export type EnabledTable = (typeof enabledTablesMap)[EnabledTableKeys];
