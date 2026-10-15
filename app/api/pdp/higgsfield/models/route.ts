import { authJson, getHiggsfieldSession } from "../../../../../lib/pdp-server/higgsfield-auth";
import { HiggsfieldError, HiggsfieldMcp } from "../../../../../lib/pdp-server/higgsfield-mcp";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getHiggsfieldSession(request);
  if (!session) return authJson(request, null, { ok: false, message: "설정에서 Higgsfield 계정을 연결해 주세요." }, 401);
  try { return authJson(request, session, { ok: true, models: await new HiggsfieldMcp(session.accessToken).models() }); }
  catch (error) { return authJson(request, session, { ok: false, message: error instanceof Error ? error.message : "모델 목록을 읽지 못했습니다." }, error instanceof HiggsfieldError ? error.status : 502); }
}
