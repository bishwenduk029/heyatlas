import { drizzle } from "drizzle-orm/postgres-js";
import neon from "@neondatabase/serverless";
import env from "@/env";
import * as tables from "./tables";
import {
  getConnectionConfig,
  validateDatabaseConfig,
} from "@/lib/database/connection";

// Use unified database URL
const databaseUrl = env.DATABASE_URL;

// Get environment-appropriate connection configuration
const connectionConfig = getConnectionConfig();

// Validate and log configuration in development
if (process.env.NODE_ENV === "development") {
  validateDatabaseConfig();
}

// Always use @neondatabase/serverless - works in both local dev and Cloudflare Workers
const sql = neon(databaseUrl, connectionConfig);

// Initialize the database with drizzle and schema
export const db = drizzle(sql, { schema: { ...tables } });

// Export the sql client for direct queries if needed
export { sql };

// Neon HTTP uses stateless connections, no cleanup needed
export const closeDatabase = async () => {};
