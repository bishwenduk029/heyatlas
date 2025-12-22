import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/database";
import * as tables from "@/database/tables";
import { eq } from "drizzle-orm";
import env from "@/env";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Fetch user's virtual key for LLM access
  const user = await db.query.users.findFirst({
    where: eq(tables.users.id, session.user.id),
    columns: { bifrostApiKey: true },
  });

  // Build virtual key info if available
  const virtualKey = user?.bifrostApiKey
    ? {
        apiKey: user.bifrostApiKey,
        apiUrl: env.BIFROST_URL || "https://bifrost.heyatlas.app",
      }
    : null;

  return NextResponse.json({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    roomId: session.user.id, // Room ID = User ID
    virtualKey,
  });
}
