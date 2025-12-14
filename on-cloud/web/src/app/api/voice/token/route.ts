import { NextResponse } from "next/server";
import { AccessToken, type AccessTokenOptions } from "livekit-server-sdk";
import { RoomConfiguration, RoomAgentDispatch } from "@livekit/protocol";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
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

    // Get the authenticated session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    const rawUserId = session?.user?.id;

    if (typeof rawUserId !== "string" || rawUserId.trim().length === 0) {
      throw new Error("User ID is missing");
    }

    const userId = rawUserId.trim();
    const userName = session?.user?.name || "User";

    // Generate unique room name for this session
    const roomName = `voice_${userId}_${Date.now()}`;

    // Create participant token with agent dispatch
    const participantToken = await createParticipantTokenWithAgent(
      {
        identity: userId,
        name: userName,
      },
      roomName,
      "heycomputer-agent-dev",
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

async function createParticipantTokenWithAgent(
  userInfo: AccessTokenOptions,
  roomName: string,
  agentName: string,
  userId: string,
): Promise<string> {
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

  // Configure agent dispatch with user_id and party_room in metadata
  // We use the userId as the party_room name
  const metadata = JSON.stringify({
    user_id: userId,
    party_room: userId, // Using user ID as the private party room
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
