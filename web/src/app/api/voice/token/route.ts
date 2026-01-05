import { NextResponse } from "next/server";
import { AccessToken, type AccessTokenOptions } from "livekit-server-sdk";
import { RoomConfiguration, RoomAgentDispatch } from "@livekit/protocol";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { db } from "@/database";
import * as tables from "@/database/tables";
import { eq } from "drizzle-orm";
import { bifrost } from "@/lib/bifrost";
import env from "@/env";

const LIVEKIT_API_KEY = env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = env.LIVEKIT_URL;

export const revalidate = 0;

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

export async function POST() {
  "use workflow";

  try {
    if (!LIVEKIT_URL) {
      throw new Error("LIVEKIT_URL is not configured");
    }
    if (!LIVEKIT_API_KEY) {
      throw new Error("LIVEKIT_API_KEY is not configured");
    }
    if (!LIVEKIT_API_SECRET) {
      throw new Error("LIVEKIT_API_SECRET is not configured");
    }

    const session = await getAuthSession();
    const rawUserId = session?.user?.id;

    if (typeof rawUserId !== "string" || rawUserId.trim().length === 0) {
      throw new Error("User ID is missing");
    }

    const userId = rawUserId.trim();
    const userName = session?.user?.name || "User";

    const usageCheck = await checkUsageLimits(userId);

    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: usageCheck.reason,
          upgradeRequired: true,
        },
        { status: 403 },
      );
    }

    const roomName = `voice_${userId}_${Date.now()}`;
    const participantToken = await createParticipantTokenWithAgent(
      {
        identity: userId,
        name: userName,
      },
      roomName,
      "heyatlas-agent-dev",
      userId,
    );

    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken,
      participantName: userName,
    };

    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
    });

    return NextResponse.json(data, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error generating voice token:", error);
      return new NextResponse(error.message, { status: 500 });
    }
    return new NextResponse("Internal server error", { status: 500 });
  }
}

async function getAuthSession() {
  "use step";
  return auth.api.getSession({
    headers: await headers(),
  });
}

async function createParticipantTokenWithAgent(
  userInfo: AccessTokenOptions,
  roomName: string,
  agentName: string,
  userId: string,
): Promise<string> {
  "use step";

  const at = new AccessToken(env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!, {
    ...userInfo,
    ttl: "15m",
  });

  at.identity = userId;

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  const metadata = JSON.stringify({
    user_id: userId,
    party_room: userId,
  });

  at.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName,
        metadata,
      }),
    ],
  });

  return await at.toJwt();
}

/**
 * Check if user has sufficient credits/subscription to start a voice session
 */
async function checkUsageLimits(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  tier: string;
  tokensRemaining?: number;
}> {
  "use step";

  try {
    const user = await fetchUser(userId);

    if (!user || !user.bifrostApiKey) {
      return {
        allowed: false,
        tier: "genin",
        reason: "API key not found. Please refresh the page.",
      };
    }

    const keyInfo = await checkBifrostBalance(user.bifrostApiKey);

    if (!keyInfo) {
      console.error("Failed to fetch Bifrost key info");
      return { allowed: true, tier: "genin" };
    }

    if (keyInfo.tokensRemaining <= 0) {
      return {
        allowed: false,
        tier: "genin",
        tokensRemaining: 0,
        reason: `Token limit reached (${keyInfo.tokensUsed.toLocaleString()}/${keyInfo.tokensLimit.toLocaleString()} used). Upgrade to continue.`,
      };
    }

    const percentRemaining =
      (keyInfo.tokensRemaining / keyInfo.tokensLimit) * 100;
    if (percentRemaining < 10) {
      console.warn(
        `User ${userId} has ${percentRemaining.toFixed(1)}% tokens remaining`,
      );
    }

    const subscription = await fetchSubscription(userId);

    let tier = "genin";
    if (subscription && subscription.status === "active") {
      const productId = subscription.productId;
      if (productId === "pro_monthly") {
        tier = "jonin";
      }
    }

    return {
      allowed: true,
      tier,
      tokensRemaining: keyInfo.tokensRemaining,
    };
  } catch (error) {
    console.error("Error checking usage limits:", error);
    return { allowed: true, tier: "genin" };
  }
}

async function fetchUser(userId: string) {
  "use step";
  return db.query.users.findFirst({
    where: eq(tables.users.id, userId),
    columns: { bifrostApiKey: true },
  });
}

async function checkBifrostBalance(apiKey: string) {
  "use step";
  return bifrost.getVirtualKeyInfo(apiKey);
}

async function fetchSubscription(userId: string) {
  "use step";
  return db.query.subscriptions.findFirst({
    where: eq(tables.subscriptions.userId, userId),
    columns: { productId: true, status: true },
    orderBy: (subscriptions, { desc }) => [desc(subscriptions.createdAt)],
  });
}
