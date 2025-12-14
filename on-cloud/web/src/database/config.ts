import { defineConfig } from "drizzle-kit";
import env from "@/env";

// Drizzle configuration
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./database/migrations/development",
  verbose: true,
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  // Only manage tables explicitly defined in our schema
  // This prevents dropping tables managed by other services (e.g., mem0)
  tablesFilter: [
    "users",
    "sessions",
    "accounts",
    "verifications",
    "subscriptions",
    "payments",
    "webhook_events",
    "uploads",
    "mcp_configs",
  ],
});
