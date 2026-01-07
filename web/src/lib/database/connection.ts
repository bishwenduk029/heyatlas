import env from "@/env";

/**
 * Gets the database connection configuration optimized for Cloudflare Workers
 * Uses WebSocket connections via @neondatabase/serverless
 */
export function getConnectionConfig() {
  return {
    // Maximum connections per instance (keep low for serverless)
    max: 1,

    // Close idle connections after 20 seconds
    idle_timeout: 20,

    // Maximum connection lifetime (30 minutes)
    max_lifetime: 60 * 30,

    // Connection timeout (30 seconds)
    connect_timeout: 30,

    // Enable prepared statements for performance
    prepare: true,

    // Handle connection errors gracefully
    onnotice: () => {},
  };
}

/**
 * Gets the current environment type for logging and monitoring
 */
export function getEnvironmentType(): "serverless" | "traditional" {
  return "serverless";
}

// Flag to ensure configuration is only logged once
let configValidated = false;

/**
 * Validates the database configuration
 */
export function validateDatabaseConfig(): void {
  // Only validate and log once to avoid spam
  if (configValidated) {
    return;
  }

  const config = getConnectionConfig();
  const envType = getEnvironmentType();

  console.log(`Database configuration loaded for ${envType} environment.`);
  console.log(`- Max connections: ${config.max}`);
  console.log(`- Idle timeout: ${config.idle_timeout}s`);
  console.log(`- Connect timeout: ${config.connect_timeout}s`);

  // Mark as validated to prevent repeated logging
  configValidated = true;
}

/**
 * Resets the configuration validation flag (for testing purposes)
 */
export function resetConfigValidation(): void {
  configValidated = false;
}
