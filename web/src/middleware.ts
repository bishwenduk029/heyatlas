import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export default async function authMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 定义认证相关页面（用户不应在登录状态下访问）
  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth/sent");

  

  // 使用 better-auth 推荐的辅助函数检查会话 cookie
  const sessionCookie = getSessionCookie(request);
  const hasSession = !!sessionCookie;

  // 如果用户已登录但尝试访问认证页面，则重定向到语音助手页面
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/voice", request.url));
  }

  // 其他情况，允许请求继续
  return NextResponse.next();
}

export const config = {
  // 中间件仅在以下匹配的路径上运行，以提高性能
  matcher: ["/login", "/signup", "/auth/sent"],
};
