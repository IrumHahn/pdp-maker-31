import {
  createPdpBugReport,
  isPdpBugReportAdminAuthorized,
  listPdpBugReports
} from "../../../../lib/pdp-server/pdp-bug-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Invalid JSON payload." }, { status: 400 });
  }

  if (isHoneypotFilled(payload)) {
    return Response.json({ ok: true, message: "접수되었습니다." });
  }

  const result = await createPdpBugReport(payload, request);
  if (!result.ok) {
    return Response.json({ ok: false, message: result.message }, { status: 400 });
  }

  return Response.json({
    ok: true,
    id: result.value.id,
    report: {
      id: result.value.id,
      status: result.value.status,
      reporterEmail: result.value.reporterEmail,
      notifications: result.value.notifications ?? [],
      createdAt: result.value.createdAt
    },
    path: result.value.storagePath,
    message: "접수되었습니다. 확인 후 개선하겠습니다."
  });
}

export async function GET(request: Request) {
  if (!isPdpBugReportAdminAuthorized(request)) {
    return Response.json({ ok: false, message: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Number(url.searchParams.get("limit")) || 120;
  const reports = await listPdpBugReports({ status, limit });

  return Response.json({
    ok: true,
    reports
  });
}

function isHoneypotFilled(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return typeof record.website === "string" && record.website.trim().length > 0;
}
