import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import env from "@/env";

export async function POST(request: Request) {
  // Verify authentication
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { agentId, apiKey } = body as { agentId: string; apiKey?: string };

    if (!agentId) {
      return Response.json({ success: false, error: "Missing agentId" }, { status: 400 });
    }

    // Call Atlas agent via HTTP (not WebSocket) to connect cloud agent
    // The Atlas agent will create the sandbox with the API key as env var
    // Convert wss:// to https:// for HTTP fetch
    const atlasUrl = (env.NEXT_PUBLIC_ATLAS_AGENT_URL || "https://atlas.heyatlas.ai")
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:");
    const response = await fetch(`${atlasUrl}/agents/${session.user.id}/connect-cloud-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Session token for Atlas authentication
        "X-Atlas-Session-Token": session.session.token,
      },
      body: JSON.stringify({ agentId, apiKey }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[connect-cloud] Atlas error:", errorText);
      return Response.json(
        { success: false, error: "Failed to connect cloud agent" },
        { status: response.status }
      );
    }

    const result = await response.json();
    return Response.json(result);
  } catch (error) {
    console.error("[connect-cloud] Error:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
