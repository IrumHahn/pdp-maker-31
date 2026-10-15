import { assertLocalCliRequest, codexCliStatus } from '../../../../lib/pdp-server/pdp-codex-cli';
import { assertSameOrigin } from '../../../../lib/pdp-server/higgsfield-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try { assertSameOrigin(request); assertLocalCliRequest(request); return Response.json(await codexCliStatus()); }
  catch { return Response.json({ok:false,message:'Codex CLI는 이 PC의 로컬 개발 화면에서만 연결할 수 있습니다.'}, {status:403}); }
}
