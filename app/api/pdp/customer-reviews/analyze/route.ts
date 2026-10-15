import type { PdpAnalyzeCustomerReviewsRequest } from "@runacademy/shared";
import { PdpController } from "../../../../../lib/pdp-server/pdp.controller";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pdpController = new PdpController();

export async function POST(request: Request) {
  const body = (await request.json()) as PdpAnalyzeCustomerReviewsRequest;
  const openAiApiKeyOverride = request.headers.get("x-openai-api-key") ?? undefined;
  const response = await pdpController.analyzeCustomerReviews(body, openAiApiKeyOverride);

  return Response.json(response, {
    status: response.ok ? 200 : mapErrorCodeToStatus(response.code)
  });
}

function mapErrorCodeToStatus(code?: string) {
  switch (code) {
    case "INVALID_REQUEST":
      return 400;
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
