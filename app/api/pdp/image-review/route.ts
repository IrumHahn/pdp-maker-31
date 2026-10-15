import { assertSameOrigin } from "../../../../lib/pdp-server/higgsfield-auth";
import { PdpController } from "../../../../lib/pdp-server/pdp.controller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
const controller = new PdpController();
export async function POST(request: Request) {
  try { assertSameOrigin(request); }
  catch { return Response.json({ ok: false, code: "INVALID_REQUEST", message: "다른 사이트에서 시작한 요청은 허용되지 않습니다." }, { status: 403 }); }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > 46000000) return Response.json({ ok: false, code: "INVALID_REQUEST", message: "자료 용량이 큽니다. 전체 자료 압축 후 다시 시도해 주세요." }, { status: 413 });
  let body;
  try { body = JSON.parse(text); if (!body || typeof body !== "object") throw new Error(); }
  catch { return Response.json({ ok: false, code: "INVALID_REQUEST", message: "요청 내용을 읽지 못했습니다." }, { status: 400 }); }
  const result = await controller.reviewImage(body, request.headers.get("x-gemini-api-key") ?? undefined, request.headers.get("x-openai-api-key") ?? undefined);
  return Response.json(result, { status: result.ok ? 200 : result.code?.includes("KEY") ? 401 : result.code === "INVALID_REQUEST" ? 400 : 502 });
}
