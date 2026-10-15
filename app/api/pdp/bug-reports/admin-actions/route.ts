import { NextResponse } from "next/server";
import {
  addPdpBugReportMemo,
  isPdpBugReportAdminAuthorized,
  updatePdpBugReportStatus
} from "../../../../../lib/pdp-server/pdp-bug-reports";
import type { PdpBugReportStatus } from "../../../../../lib/shared/pdp-bug-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_RETURN_TO = "/pdp-maker/admin/bug-reports";

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = normalizeReturnTo(formData.get("returnTo"));
  const redirectUrl = new URL(returnTo, request.url);

  if (!isPdpBugReportAdminAuthorized(request)) {
    redirectUrl.searchParams.set("login", "failed");
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  const action = formValue(formData.get("action"));
  const reportId = formValue(formData.get("reportId"));
  const memo = formValue(formData.get("memo"));

  if (!reportId) {
    redirectUrl.searchParams.set("action", "failed");
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  if (action === "status") {
    const status = formValue(formData.get("status")) as PdpBugReportStatus;
    const result = await updatePdpBugReportStatus(reportId, status, { memo });
    redirectUrl.searchParams.set(result.ok ? "updated" : "error", reportId);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  if (action === "memo") {
    const result = await addPdpBugReportMemo(reportId, memo);
    redirectUrl.searchParams.set(result.ok ? "memo" : "error", reportId);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  redirectUrl.searchParams.set("action", "failed");
  return NextResponse.redirect(redirectUrl, { status: 303 });
}

function formValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
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
