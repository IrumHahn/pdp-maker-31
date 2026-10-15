import { authJson, getHiggsfieldSession } from "../../../../../lib/pdp-server/higgsfield-auth";
import { HiggsfieldMcp } from "../../../../../lib/pdp-server/higgsfield-mcp";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getHiggsfieldSession(request);
  if (!session) return authJson(request, null, { ok: true, connected: false });
  try {
    const balance = await new HiggsfieldMcp(session.accessToken).call("balance", {});
    return authJson(request, session, { ok: true, connected: true, credits: balance.credits, plan: balance.subscription_plan_type });
  } catch { return authJson(request, session, { ok: false, connected: false, message: "Higgsfield 연결 상태를 확인하지 못했습니다. 다시 연결하거나 잠시 후 확인해 주세요." }, 502); }
}
