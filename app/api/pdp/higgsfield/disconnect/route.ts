import { assertSameOrigin, authJson } from "../../../../../lib/pdp-server/higgsfield-auth";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { assertSameOrigin(request); return authJson(request, null, { ok: true, connected: false }); }
  catch { return Response.json({ ok: false, message: "연결 해제 요청 출처를 확인하지 못했습니다." }, { status: 403 }); }
}
