import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export default async function authMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define authentication pages (users should not access these when logged in)
  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth/sent");

  // Use better-auth recommended helper function to check session cookie
  const sessionCookie = getSessionCookie(request);
  const hasSession = !!sessionCookie;

  // If user is logged in but tries to access auth pages, redirect to voice assistant page
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/voice", request.url));
  }

  // Other cases, allow request to continue
  return NextResponse.next();
}

export const config = {
  // Middleware only runs on matched paths for performance optimization
  matcher: ["/login", "/signup", "/auth/sent"],
};
