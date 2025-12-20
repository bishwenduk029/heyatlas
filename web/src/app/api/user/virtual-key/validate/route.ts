import { NextResponse } from "next/server";
import { db } from "@/database";
import * as tables from "@/database/tables";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sandboxToken, roomId } = body;

    if (!sandboxToken || !roomId) {
      return NextResponse.json(
        { error: "Missing sandboxToken or roomId" },
        { status: 400 },
      );
    }

    // Validate that the roomId corresponds to a valid user
    // The roomId is the userId in our system
    const user = await db.query.users.findFirst({
      where: eq(tables.users.id, roomId),
      columns: { id: true, bifrostApiKey: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid room - user not found" },
        { status: 401 },
      );
    }

    // User exists and has an active sandbox session
    // For now, we trust that the sandbox was launched by our system
    // TODO: Implement proper token storage/validation for enhanced security
    return NextResponse.json({ valid: true, userId: user.id });
  } catch (error) {
    console.error("Error validating sandbox token:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
