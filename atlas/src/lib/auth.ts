/**
 * Authentication for Atlas Agent
 */
import type { Env } from "../types";

const DEFAULT_AUTH_BASE = "https://www.heyatlas.app";

interface AuthUser {
  id: string;
  email?: string;
  tier?: string;
  virtualKey?: { apiKey: string; apiUrl: string };
}

type AuthHeaders = {
  userId: string;
  email: string;
  apiKey: string;
  apiUrl: string;
  tier: string;
};

function setAuthHeaders(request: Request, auth: AuthHeaders): Request {
  const headers = new Headers(request.headers);
  headers.set("X-User-ID", auth.userId);
  headers.set("X-User-Email", auth.email);
  headers.set("X-Provider-API-Key", auth.apiKey);
  headers.set("X-Provider-API-URL", auth.apiUrl);
  headers.set("X-Atlas-Tier", auth.tier);
  return new Request(request, { headers });
}

export async function authenticate(
  request: Request,
  env: Env
): Promise<Request | Response> {
  const url = new URL(request.url);
  const tierParam = url.searchParams.get("tier") || "genin";

  // Extract token from Authorization header or query param
  const authHeader = request.headers.get("Authorization");
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const tokenFromQuery = url.searchParams.get("token");
  const token = tokenFromHeader || tokenFromQuery;

  // Voice agent auth (server-to-server) via X-Api-Key header
  const serverApiKey = request.headers.get("X-Api-Key");
  const agentRole = request.headers.get("X-Agent-Role");

  if (serverApiKey && agentRole === "voice") {
    if (serverApiKey !== env.NIRMANUS_API_KEY) {
      return new Response("Unauthorized", { status: 401 });
    }
    // token contains user's virtual key (bifrost key) for LLM access
    return setAuthHeaders(request, {
      userId: "voice-agent",
      email: "",
      apiKey: token || env.HEYATLAS_PROVIDER_API_KEY || "",
      apiUrl: env.HEYATLAS_PROVIDER_API_URL || "",
      tier: tierParam,
    });
  }

  // Bearer token auth (from header or query param)
  if (!token) {
    return new Response("Unauthorized: Missing token", { status: 401 });
  }

  try {
    const apiBase = env.AUTH_API_BASE || DEFAULT_AUTH_BASE;
    const res = await fetch(`${apiBase}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return new Response("Unauthorized", { status: 401 });
    }

    const user = (await res.json()) as AuthUser;
    return setAuthHeaders(request, {
      userId: user.id,
      email: user.email || "",
      apiKey: user.virtualKey?.apiKey || env.HEYATLAS_PROVIDER_API_KEY || "",
      apiUrl: user.virtualKey?.apiUrl || env.HEYATLAS_PROVIDER_API_URL || "",
      tier: tierParam || user.tier || "genin",
    });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}

export async function validateSandboxToken(
  token: string,
  roomId: string,
  env: Env
): Promise<boolean> {
  const apiBase = env.AUTH_API_BASE || DEFAULT_AUTH_BASE;
  const res = await fetch(`${apiBase}/api/user/virtual-key/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sandboxToken: token, roomId }),
  });
  return res.ok;
}
