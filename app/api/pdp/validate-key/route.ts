import { PdpController } from "../../../../lib/pdp-server/pdp.controller";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pdpController = new PdpController();

export async function GET(request: Request) {
  const geminiApiKeyOverride = request.headers.get("x-gemini-api-key") ?? undefined;
  const response = await pdpController.validateApiKey(geminiApiKeyOverride, new URL(request.url).searchParams.get("scope") === "analysis");

  return Response.json(response, {
    status: response.ok ? 200 : mapErrorCodeToStatus(response.code)
  });
}

function mapErrorCodeToStatus(code?: string) {
  switch (code) {
    case "GEMINI_API_KEY_MISSING":
    case "GEMINI_API_KEY_INVALID":
      return 401;
    case "GEMINI_MODEL_ACCESS_DENIED":
      return 403;
    default:
      return 500;
  }
}
