/**
 * Device authentication for HeyAtlas CLI
 * Uses OAuth 2.0 Device Authorization Grant (RFC 8628)
 */

import { join } from "path";
import { homedir } from "os";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";

const CONFIG_DIR = join(homedir(), ".heyatlas");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");
const API_BASE = process.env.HEYATLAS_API || "https://www.heyatlas.app";
const CLIENT_ID = "heyatlas-cli";

interface Credentials {
  accessToken: string;
  userId: string;
  email: string;
}

// Ensure config directory exists
function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Load saved credentials
export function loadCredentials(): Credentials | null {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      const data = readFileSync(CREDENTIALS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    // Invalid credentials file
  }
  return null;
}

// Save credentials
function saveCredentials(credentials: Credentials) {
  ensureConfigDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
}

// Request device code
async function requestDeviceCode(): Promise<{
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  interval: number;
}> {
  const response = await fetch(`${API_BASE}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: "openid profile email",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get device code: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete,
    interval: data.interval || 5,
  };
}

// Poll for token
async function pollForToken(
  deviceCode: string,
  interval: number
): Promise<{ accessToken: string; user: { id: string; email: string } }> {
  let pollInterval = interval;

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000));

    const response = await fetch(`${API_BASE}/api/auth/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: CLIENT_ID,
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      if (process.env.DEBUG) {
        console.log("Token response:", JSON.stringify(data, null, 2));
      }

      // Get user info from /api/me using the access token
      let userId = "unknown";
      let email = "unknown";

      try {
        const meResponse = await fetch(`${API_BASE}/api/me`, {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
          },
        });
        if (meResponse.ok) {
          const me = await meResponse.json();
          if (process.env.DEBUG) {
            console.log("User info:", JSON.stringify(me, null, 2));
          }
          userId = me.id || me.roomId;
          email = me.email;
        }
      } catch {
        // Fallback to unknown
      }

      return {
        accessToken: data.access_token,
        user: { id: userId, email: email },
      };
    }

    if (data.error) {
      switch (data.error) {
        case "authorization_pending":
          // Continue polling
          break;
        case "slow_down":
          pollInterval += 5;
          break;
        case "access_denied":
          throw new Error("Access denied by user");
        case "expired_token":
          throw new Error("Device code expired. Please try again.");
        default:
          throw new Error(data.error_description || data.error);
      }
    }
  }
}

// Main login flow
export async function login(): Promise<Credentials> {
  const existing = loadCredentials();
  if (existing) {
    return existing;
  }
  
  // Request device code
  const { deviceCode, userCode, verificationUri, verificationUriComplete, interval } =
    await requestDeviceCode();

  // Format user code with dash for readability
  const formattedCode = userCode.length === 8
    ? `${userCode.slice(0, 4)}-${userCode.slice(4)}`
    : userCode;

  console.log(`🔐 Enter code: ${formattedCode}`);
  console.log(`   at ${verificationUri}\n`);

  // Open browser
  const urlToOpen = verificationUriComplete || `${verificationUri}?code=${userCode}`;

  try {
    const { execSync } = await import("child_process");
    if (process.platform === "darwin") {
      execSync(`open "${urlToOpen}"`, { stdio: "ignore" });
    } else if (process.platform === "win32") {
      execSync(`start "" "${urlToOpen}"`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open "${urlToOpen}"`, { stdio: "ignore" });
    }
  } catch {
    // Browser open failed silently
  }

  console.log("⏳ Waiting for you to authorize...");

  // Poll for token
  const { accessToken, user } = await pollForToken(deviceCode, interval);

  // Save credentials
  const credentials: Credentials = {
    accessToken,
    userId: user.id,
    email: user.email,
  };
  saveCredentials(credentials);

  console.log(`✅ Welcome, ${user.email}!\n`);
  return credentials;
}

// Get current user ID (for room)
export function getUserId(): string | null {
  const creds = loadCredentials();
  return creds?.userId || null;
}
