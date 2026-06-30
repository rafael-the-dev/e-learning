import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/config";
import { NextResponse } from "next/server";
import { getPostLoginRedirect } from "./app/login/actions";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/register", "/api/auth", "/set-password"];

export default auth( async (req) => {
  const { pathname } = req.nextUrl;
  // The marketing landing page lives at the root and is public. Match it
  // exactly — a prefix match on "/" would make every path public.
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Only bounce real browser navigations (GET) away from /login. Server Action
  // POSTs also target the current URL (/login) and would otherwise be caught
  // here — returning a plain redirect to a Server Action request breaks the
  // RSC response contract and surfaces as "An unexpected response was received
  // from the server." in the client.
  if (req.auth && pathname === "/login" && req.method === "GET") {
    const destination = await getPostLoginRedirect();
    return NextResponse.redirect(new URL(destination, req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
