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
      return NextResponse.json({ key: null, message: "Key not generated yet" });
    }

    // 4. Fetch User's Active Subscription to determine pricing plan
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(tables.subscriptions.userId, userId),
      columns: { productId: true, status: true },
      orderBy: (subscriptions, { desc }) => [desc(subscriptions.createdAt)],
    });

    // 5. Map productId to assistant tier (genin, chunin, jonin)
    let assistantTier = "genin"; // Default to free tier
    if (subscription && subscription.status === "active") {
      const productId = subscription.productId;
      // Map product IDs to assistant tiers
      if (productId === "max_monthly") {
        assistantTier = "jonin"; // Full features: memory + web search + cloud desktop
      } else if (productId === "pro_monthly") {
        assistantTier = "chunin"; // Mid tier: memory + web search, no cloud desktop
      } else if (productId === "free") {
        assistantTier = "genin"; // Basic: no memory, no web search, no cloud desktop
      }
    }

    return NextResponse.json({
      key: user.bifrostApiKey,
      assistantTier: assistantTier,
      productId: subscription?.productId || "free"
    });
  } catch (error) {
    console.error("Error fetching virtual key:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
