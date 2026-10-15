import { assertSameOrigin, authJson, getHiggsfieldSession } from "../../../../lib/pdp-server/higgsfield-auth";
import type { PdpGenerateImageRequest } from "@runacademy/shared";
import { PdpController } from "../../../../lib/pdp-server/pdp.controller";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pdpController = new PdpController();

export async function POST(request: Request) {
  const body = (await request.json()) as PdpGenerateImageRequest;
  const geminiApiKeyOverride = request.headers.get("x-gemini-api-key") ?? undefined;
  const openAiApiKeyOverride = request.headers.get("x-openai-api-key") ?? undefined;
  const usingHiggsfield = body.options?.aiProvider === "higgsfield";
  if (usingHiggsfield) {
    try { assertSameOrigin(request); } catch { return Response.json({ ok: false, code: "INVALID_REQUEST", message: "다른 사이트에서 시작한 생성 요청은 허용되지 않습니다." }, { status: 403 }); }
  }
  const session = usingHiggsfield ? await getHiggsfieldSession(request) : null;
  const response = await pdpController.generateImage(body, geminiApiKeyOverride, openAiApiKeyOverride, session?.accessToken);
  if (usingHiggsfield) return authJson(request, session, response, response.ok ? 200 : mapErrorCodeToStatus(response.code));

  return Response.json(response, {
    status: response.ok ? 200 : mapErrorCodeToStatus(response.code)
  });
}

function mapErrorCodeToStatus(code?: string) {
  switch (code) {
    case "INVALID_IMAGE_PAYLOAD":
    case "INVALID_REQUEST":
      return 400;
    case "HIGGSFIELD_AUTH_REQUIRED":
    case "GEMINI_API_KEY_MISSING":
    case "GEMINI_API_KEY_INVALID":
    case "OPENAI_API_KEY_MISSING":
    case "OPENAI_API_KEY_INVALID":
      return 401;
    case "GEMINI_MODEL_ACCESS_DENIED":
    case "OPENAI_MODEL_ACCESS_DENIED":
      return 403;
    case "GEMINI_QUOTA_EXCEEDED":
    case "OPENAI_QUOTA_EXCEEDED":
      return 429;
    case "HIGGSFIELD_CREDITS_REQUIRED": return 402;
    case "HIGGSFIELD_GENERATION_PENDING": return 504;
    case "HIGGSFIELD_REQUEST_FAILED": return 502;
    default:
      return 500;
  }
}
