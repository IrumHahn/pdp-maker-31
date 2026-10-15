import { NextResponse } from "next/server";
import {
  createPdpBugReportAdminSessionValue,
  isPdpBugReportAdminPageAuthorized,
  PDP_BUG_REPORT_ADMIN_COOKIE
} from "../../../../../lib/pdp-server/pdp-bug-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_RETURN_TO = "/pdp-maker/admin/bug-reports";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

export async function POST(request: Request) {
  const formData = await request.formData();
  const tokenValue = formData.get("token");
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
  const returnTo = normalizeReturnTo(formData.get("returnTo"));

  if (!isPdpBugReportAdminPageAuthorized(token)) {
    const failedUrl = new URL(returnTo, request.url);
    failedUrl.searchParams.set("login", "failed");
    return NextResponse.redirect(failedUrl, { status: 303 });
  }

  const response = NextResponse.redirect(new URL(returnTo, request.url), { status: 303 });
  const sessionValue = createPdpBugReportAdminSessionValue();

  if (sessionValue) {
    response.cookies.set(PDP_BUG_REPORT_ADMIN_COOKIE, sessionValue, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: "/pdp-maker/admin",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
  }

  return response;
}

function normalizeReturnTo(value: FormDataEntryValue | null) {
  if (
    typeof value !== "string" ||
    (value !== DEFAULT_RETURN_TO && !value.startsWith(`${DEFAULT_RETURN_TO}?`))
  ) {
    return DEFAULT_RETURN_TO;
  }

  if (value.startsWith("//") || value.includes("://")) {
    return DEFAULT_RETURN_TO;
  }

  return value;
}
