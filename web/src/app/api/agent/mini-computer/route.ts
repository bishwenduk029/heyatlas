import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import env from "@/env";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { enabled } = body as { enabled: boolean };

    // Call Atlas agent to toggle mini computer
    const atlasUrl = (env.NEXT_PUBLIC_ATLAS_AGENT_URL || "https://atlas.heyatlas.ai")
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:");
    
    const response = await fetch(`${atlasUrl}/agents/${session.user.id}/mini-computer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Atlas-Session-Token": session.session.token,
      },
      body: JSON.stringify({ enabled }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[mini-computer] Atlas error:", errorText);
      return Response.json(
        { success: false, error: "Failed to toggle mini computer" },
        { status: response.status }
      );
    }

    const result = await response.json();
    return Response.json(result);
  } catch (error) {
    console.error("[mini-computer] Error:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
