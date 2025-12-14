import { NextResponse } from "next/server";
import { db } from "@/database";
import * as tables from "@/database/tables";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    // 1. Security Check
    const authHeader = request.headers.get("NIRMANUS_API_KEY");
    if (!authHeader || authHeader !== process.env.NIRMANUS_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get User ID from Query Params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId parameter" }, { status: 400 });
    }

    // 3. Fetch User's Virtual Key
    const user = await db.query.users.findFirst({
      where: eq(tables.users.id, userId),
      columns: { bifrostApiKey: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.bifrostApiKey) {
        // Alternatively, we could generate one here if missing?
        // For now, return null or specific error.
        return NextResponse.json({ key: null, message: "Key not generated yet" });
    }

    return NextResponse.json({ key: user.bifrostApiKey });
  } catch (error) {
    console.error("Error fetching virtual key:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
