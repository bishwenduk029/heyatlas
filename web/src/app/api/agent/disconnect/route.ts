import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import env from "@/env";

export async function POST() {
  // Verify authentication
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Call Atlas agent via HTTP to disconnect
    const atlasUrl = (env.NEXT_PUBLIC_ATLAS_AGENT_URL || "https://atlas.heyatlas.ai")
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:");
    const response = await fetch(`${atlasUrl}/agents/${session.user.id}/disconnect-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Atlas-Session-Token": session.session.token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[disconnect-agent] Atlas error:", errorText);
      return Response.json(
        { success: false, error: "Failed to disconnect agent" },
        { status: response.status }
      );
    }

    const result = await response.json();
    return Response.json(result);
  } catch (error) {
    console.error("[disconnect-agent] Error:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
