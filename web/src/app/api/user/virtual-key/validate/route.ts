import { NextResponse } from "next/server";
import { db } from "@/database";
import * as tables from "@/database/tables";
import { eq } from "drizzle-orm";
import env from "@/env";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Support both formats: legacy (sandboxToken/roomId) and new (apiKey/userId)
    const { sandboxToken, roomId, apiKey, userId } = body;
    
    const tokenToValidate = apiKey || sandboxToken;
    const userIdToValidate = userId || roomId;

    if (!tokenToValidate || !userIdToValidate) {
      return NextResponse.json(
        { error: "Missing apiKey/userId or sandboxToken/roomId" },
        { status: 400 },
      );
    }

    // Find user and validate the virtual key
    const user = await db.query.users.findFirst({
      where: eq(tables.users.id, userIdToValidate),
      columns: { id: true, bifrostApiKey: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid user not found" },
        { status: 401 },
      );
    }

    // If apiKey format is used, validate it matches the user's virtual key
    if (apiKey && user.bifrostApiKey !== apiKey) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 },
      );
    }

    return NextResponse.json({ 
      valid: true, 
      userId: user.id,
      apiUrl: env.BIFROST_URL,
    });
  } catch (error) {
    console.error("Error validating sandbox token:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
