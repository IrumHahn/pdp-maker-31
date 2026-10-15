import { authJson, getHiggsfieldSession } from "../../../../../lib/pdp-server/higgsfield-auth";
import { HiggsfieldError, HiggsfieldMcp } from "../../../../../lib/pdp-server/higgsfield-mcp";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getHiggsfieldSession(request);
  if (!session) return authJson(request, null, { ok: false, message: "설정에서 Higgsfield 계정을 연결하면 공식 비용을 자동으로 조회합니다." }, 401);
  const query = new URL(request.url).searchParams;
  const model = query.get("model") ?? "", aspectRatio = query.get("aspectRatio") ?? "";
  if (!/^[a-z0-9_\-]{1,100}$/.test(model) || !/^\d{1,2}:\d{1,2}$/.test(aspectRatio) || ["quality", "resolution", "variant"].some(name => (query.get(name)?.length ?? 0) > 100)) return authJson(request, session, { ok: false, message: "비용을 조회할 모델과 이미지 옵션을 확인해 주세요." }, 400);
  try {
    const quote = await new HiggsfieldMcp(session.accessToken).estimateCost({ model, aspectRatio, quality: query.get("quality") ?? undefined, resolution: query.get("resolution") ?? undefined, variant: query.get("variant") ?? undefined });
    return authJson(request, session, { ok: true, quote });
  } catch (error) {
    return authJson(request, session, { ok: false, message: error instanceof Error ? error.message : "공식 비용을 조회하지 못했습니다." }, error instanceof HiggsfieldError ? error.status : 502);
  }
}
