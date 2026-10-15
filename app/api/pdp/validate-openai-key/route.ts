import { PdpController } from "../../../../lib/pdp-server/pdp.controller";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pdpController = new PdpController();

export async function GET(request: Request) {
  const openAiApiKeyOverride = request.headers.get("x-openai-api-key") ?? undefined;
  const imageModel = new URL(request.url).searchParams.get("imageModel") ?? undefined;
  const response = await pdpController.validateOpenAiApiKey(openAiApiKeyOverride, imageModel, new URL(request.url).searchParams.get("scope") === "analysis");

  return Response.json(response, {
    status: response.ok ? 200 : mapErrorCodeToStatus(response.code)
  });
}

function mapErrorCodeToStatus(code?: string) {
  switch (code) {
    case "OPENAI_API_KEY_MISSING":
    case "OPENAI_API_KEY_INVALID":
      return 401;
    case "OPENAI_MODEL_ACCESS_DENIED":
      return 403;
    case "OPENAI_QUOTA_EXCEEDED":
      return 429;
    default:
      return 500;
  }
}
