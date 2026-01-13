import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import env from "@/env";

export async function GET() {
  try {
    // Verify authentication via better-auth
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Construct WebSocket URL with token embedded
    // Note: Query param is required since browsers can't set custom headers for WebSocket
    const wsUrl = (env.NEXT_PUBLIC_ATLAS_AGENT_URL || "wss://atlas.heyatlas.ai")
      .replace(/^https:/, "wss:")
      .replace(/^http:/, "ws:");

    return Response.json({
      url: `${wsUrl}/agents/atlas-agent/${session.user.id}?token=${session.session.token}`,
      userId: session.user.id,
    });
  } catch (error) {
    console.error("Error getting agent WebSocket URL:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
