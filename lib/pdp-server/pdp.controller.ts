import { HiggsfieldError } from "./higgsfield-mcp";
import { textProviderContext } from "./pdp-codex-cli";
import type { PdpAnalyzeCustomerReviewsRequest, PdpGenerateImageRequest } from "../shared";
import { PdpService, PdpServiceError, toPdpErrorResponse } from "./pdp.service";

export class PdpController {
  constructor(private readonly pdpService = new PdpService()) {}

  async validateApiKey(geminiApiKeyOverride?: string, analysisOnly = false) {
    try {
      const result = await this.pdpService.validateGeminiApiKey(geminiApiKeyOverride, analysisOnly);
      return {
        ok: true as const,
        ...result
      };
    } catch (error) {
      return toPdpErrorResponse(error);
    }
  }

  async validateOpenAiApiKey(openAiApiKeyOverride?: string, imageModel?: string, analysisOnly = false) {
    try {
      const result = await this.pdpService.validateOpenAiApiKey(openAiApiKeyOverride, imageModel, analysisOnly);
      return {
        ok: true as const,
        ...result
      };
    } catch (error) {
      return toPdpErrorResponse(error);
    }
  }

  async analyzeCustomerReviews(body: PdpAnalyzeCustomerReviewsRequest, openAiApiKeyOverride?: string) {
    try {
      const analysis = await this.pdpService.analyzeCustomerReviews(body, openAiApiKeyOverride);
      return {
        ok: true as const,
        analysis,
        model: "gpt-5.4-mini"
      };
    } catch (error) {
      return toPdpErrorResponse(error);
    }
  }

  async writeCopy(body: import('../shared').PdpCopyPlanRequest, geminiKey?: string, openAiKey?: string) {
    try { return { ok: true as const, plan: await textProviderContext.run((body as { textProvider?: string }).textProvider ?? 'api', () => this.pdpService.writeCopyPlan(body, geminiKey, openAiKey)) }; }
    catch (error) { return toPdpErrorResponse(error); }
  }

  async draftSellingPage(body: import('../shared').PdpDraftRequest, geminiKey?: string, openAiKey?: string) {
    try { return { ok: true as const, draft: await textProviderContext.run((body as { textProvider?: string }).textProvider ?? 'api', () => this.pdpService.draftSellingPage(body, geminiKey, openAiKey)) }; }
    catch (error) { return toPdpErrorResponse(error); }
  }

  async reviewDraft(body: import('../shared').PdpDraftReviewRequest, geminiKey?: string, openAiKey?: string) {
    try { return { ok: true as const, review: await textProviderContext.run((body as { textProvider?: string }).textProvider ?? 'api', () => this.pdpService.reviewDraft(body, geminiKey, openAiKey)) }; }
    catch (error) { return toPdpErrorResponse(error); }
  }

  async reviewImage(body: Parameters<PdpService['reviewSectionImage']>[0], geminiKey?: string, openAiKey?: string) {
    try { return { ok: true as const, review: await this.pdpService.reviewSectionImage(body, geminiKey, openAiKey) }; }
    catch (error) { return toPdpErrorResponse(error); }
  }

  async generateImage(body: PdpGenerateImageRequest, geminiApiKeyOverride?: string, openAiApiKeyOverride?: string, higgsfieldToken?: string) {
    try {
      const result = await this.pdpService.generateSectionImage(body, geminiApiKeyOverride, openAiApiKeyOverride, higgsfieldToken);
      return {
        ok: true as const,
        ...result
      };
    } catch (error) {
      return toPdpErrorResponse(
        error instanceof PdpServiceError || error instanceof HiggsfieldError
          ? error
          : new PdpServiceError(
              "PDP_IMAGE_GENERATION_FAILED",
              "이미지 생성 중 오류가 발생했습니다.",
              error instanceof Error ? `${error.name}: ${error.message}` : String(error)
            )
      );
    }
  }
}
