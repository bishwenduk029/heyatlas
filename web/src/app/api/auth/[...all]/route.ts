import { auth } from "@/lib/auth/server";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Add dynamic CORS handling
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigins = [
    "https://heyatlas.app",
    "https://www.heyatlas.app",
    "https://heycomputer.me",
    "https://www.heycomputer.me",
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  const corsOrigin = allowedOrigins.includes(origin)
    ? origin
    : "https://heycomputer.me";

  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    },
  });
}

export const { GET, POST } = toNextJsHandler(auth.handler);
