import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import env from "@/env";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;

    // Convert ws:// to http:// for the fetch
    // Use same path format as WebSocket: /agents/atlas-agent/{userId}
    const wsHost = env.NEXT_PUBLIC_ATLAS_AGENT_URL || "ws://agent.heyatlas.app";
    const httpHost = wsHost.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
    const url = `${httpHost}/agents/atlas-agent/${userId}/get-messages`;

    console.log("[API] Fetching messages from:", url);

    const res = await fetch(url);
    if (!res.ok) {
      console.log("[API] Fetch failed:", res.status);
      return NextResponse.json([]);
    }

    const messages = await res.json();
    console.log("[API] Got messages:", messages?.length || 0);

    return NextResponse.json(messages);
  } catch (error) {
    console.error("[API] Error fetching messages:", error);
    return NextResponse.json([]);
  }
}
