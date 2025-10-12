import { auth } from "@/lib/auth/server";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";

// Add CORS preflight handling
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

export const { GET, POST } = toNextJsHandler(auth.handler);
