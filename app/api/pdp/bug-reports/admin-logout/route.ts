import { NextResponse } from "next/server";
import { PDP_BUG_REPORT_ADMIN_COOKIE } from "../../../../../lib/pdp-server/pdp-bug-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/pdp-maker/admin/bug-reports", request.url), { status: 303 });

  response.cookies.set(PDP_BUG_REPORT_ADMIN_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/pdp-maker/admin",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
