import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";

export const revalidate = 0;

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Return the session token (which acts as the bearer token)
    return NextResponse.json({
      token: session.session.token,
      userId: session.user.id,
    });
  } catch (error) {
    console.error("Error fetching agent token:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
