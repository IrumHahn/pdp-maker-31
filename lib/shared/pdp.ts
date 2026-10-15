import type { OpenAiImageQuality } from "./pdp-image-models";

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
export type PdpImageStyle = "studio" | "lifestyle" | "outdoor";
export type PdpModelGender = "female" | "male";
export type PdpModelAgeRange = "teen" | "20s" | "30s" | "40s" | "50s_plus";
export type PdpModelCountry = "korea" | "japan" | "usa" | "france" | "germany" | "africa";
export type PdpCopyLanguage = "ko" | "en";
export type ReferenceModelUsage = "hero-only" | "all-sections";
export type PdpGuidePriorityMode = "guide-first" | "style-first";
export type PdpAiProvider = "gemini" | "openai" | "higgsfield";
export type PdpSourceMode = "auto" | "product" | "redesign";
export type PdpOutputMode = "editable" | "full-image";
export type PdpAnalysisImageOptimizationMode = "original" | "standard-resize" | "long-detail-sampling";
export type PdpSourceMaterialKind = "image" | "pdf";
export type PdpSourceMaterialRole = "primary" | "supporting";

export interface PdpTokenUsage { inputTokens?: number; outputTokens?: number; totalTokens?: number; }

export interface PdpGenerationRecord {
  usage?: PdpTokenUsage;
  status: "queued" | "running" | "succeeded" | "failed" | "unknown";
  attempts: number;
  updatedAt: string;
  message?: string;
  provider: PdpAiProvider;
  model: string;
  quality: string;
  aspectRatio: AspectRatio;
  outputMode: PdpOutputMode;
  elapsedMs?: number;
}

export interface PdpAnalysisImageMetadata {
  mode: PdpAnalysisImageOptimizationMode;
  originalWidth: number;
  originalHeight: number;
  optimizedWidth: number;
  optimizedHeight: number;
  originalBytes: number;
  optimizedBytes: number;
  sampleCount?: number;
  generationReferenceWidth?: number;
  generationReferenceHeight?: number;
}

export interface ScorecardItem {
  category: string;
  score: string;
  reason: string;
}

export interface SectionBlueprint {
  section_id: string;
  section_name: string;
  goal: string;
  headline: string;
  headline_en: string;
  subheadline: string;
  subheadline_en: string;
  bullets: string[];
  bullets_en: string[];
  trust_or_objection_line: string;
  trust_or_objection_line_en: string;
  CTA: string;
  CTA_en: string;
  layout_notes: string;
  compliance_notes: string;
  image_id: string;
  purpose: string;
  prompt_ko: string;
  prompt_en: string;
  negative_prompt: string;
  style_guide: string;
  reference_usage: string;
  productReference?: { base64: string; mimeType: string; fileName: string };
  generatedImage?: string;
  previousGeneratedImage?: string;
  imageCopySignature?: string;
  qualityReview?: import("./pdp-copy-quality").PdpImageQualityReview;
  copyEvidence?: string[];
  decisionDesign?: import("./pdp-selling-plan").PdpDecisionDesign;
  /** Explicit per-section mode; absent preserves older drafts. */
  copyPresentation?: PdpOutputMode;
  referenceReviewRequired?: boolean;
  originalProduct?: { x: number; y: number; width: number; height: number };
  generation?: PdpGenerationRecord;
}

export interface LandingPageBlueprint {
  executiveSummary: string;
  scorecard: ScorecardItem[];
  blueprintList: string[];
  sections: SectionBlueprint[];
}

export interface GeneratedResult {
  originalImage: string;
  originalImageMimeType?: string;
  originalImageFileName?: string;
  blueprint: LandingPageBlueprint;
}

export interface PdpCustomerReviewAnalysis {
  fileName: string;
  reviewCount: number;
  sampledReviewCount?: number;
  sampleReviews: string[];
  topBenefits: string[];
  painPoints: string[];
  improvementPromises: string[];
  keywordSummary: string[];
}

export interface PdpCustomerReviewInput {
  text: string;
  rating?: number;
}

export interface PdpCustomerReviewSource {
  fileName: string;
  reviewCount: number;
  sampledReviewCount?: number;
  reviews: PdpCustomerReviewInput[];
}

export interface PdpSourceMaterial {
  kind: PdpSourceMaterialKind;
  role?: PdpSourceMaterialRole;
  fileName: string;
  mimeType?: string;
  size?: number;
  pageCount?: number;
  analysisPages?: Array<{ page: number; base64: string; mimeType: string }>;
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  imageOptimization?: PdpAnalysisImageMetadata;
}

export interface ImageGenOptions {
  style: PdpImageStyle;
  withModel: boolean;
  aiProvider?: PdpAiProvider;
  outputMode?: PdpOutputMode;
  imageModel?: string;
  imageQuality?: OpenAiImageQuality;
  higgsfieldImageQuality?: string;
  higgsfieldImageResolution?: string;
  higgsfieldImageVariant?: string;
  modelGender?: PdpModelGender;
  modelAgeRange?: PdpModelAgeRange;
  modelCountry?: PdpModelCountry;
  guidePriorityMode?: PdpGuidePriorityMode;
  headline?: string;
  subheadline?: string;
  isRegeneration?: boolean;
  editInstruction?: string;
  preserveConstraints?: string;
  baseImageBase64?: string;
  referenceModelImageBase64?: string;
  referenceModelImageMimeType?: string;
  referenceModelImageFileName?: string;
}

export interface PdpAnalyzeRequest {
  aiProvider?: PdpAiProvider;
  imageModel?: string;
  imageQuality?: OpenAiImageQuality;
  higgsfieldImageQuality?: string;
  higgsfieldImageResolution?: string;
  higgsfieldImageVariant?: string;
  sourceMode?: PdpSourceMode;
  outputMode?: PdpOutputMode;
  imageBase64: string;
  mimeType: string;
  generationImageBase64?: string;
  generationImageMimeType?: string;
  imageOptimization?: PdpAnalysisImageMetadata;
  sourceMaterials?: PdpSourceMaterial[];
  modelImageBase64?: string;
  modelImageMimeType?: string;
  modelImageFileName?: string;
  additionalInfo?: string;
  customerReviewAnalysis?: PdpCustomerReviewAnalysis;
  desiredTone?: string;
  aspectRatio: AspectRatio;
  sectionCount?: number;
  benefits?: string[];
}

export interface PdpAnalyzeSuccessResponse {
  ok: true;
  result: GeneratedResult;
}

export interface PdpAnalyzeCustomerReviewsRequest {
  source: PdpCustomerReviewSource;
  productContext?: string;
  desiredTone?: string;
}

export interface PdpAnalyzeCustomerReviewsSuccessResponse {
  ok: true;
  analysis: PdpCustomerReviewAnalysis;
  model: string;
}

export interface PdpGenerateImageRequest {
  originalImageBase64: string;
  originalImageMimeType?: string;
  originalImageFileName?: string;
  section: SectionBlueprint;
  aspectRatio: AspectRatio;
  desiredTone?: string;
  options?: ImageGenOptions;
}

export interface PdpGenerateImageSuccessResponse {
  ok: true;
  qualityReview?: import("./pdp-copy-quality").PdpImageQualityReview;
  reviewRequired?: boolean;
  usage?: PdpTokenUsage;
  imageBase64: string;
  mimeType: string;
}

export interface PdpValidateApiKeySuccessResponse {
  ok: true;
  message: string;
  analyzeModel: string;
  imageModel: string;
}

export type PdpErrorCode =
  | "HIGGSFIELD_AUTH_REQUIRED"
  | "HIGGSFIELD_CREDITS_REQUIRED"
  | "HIGGSFIELD_REQUEST_FAILED"
  | "HIGGSFIELD_GENERATION_PENDING"
  | "GEMINI_API_KEY_MISSING"
  | "GEMINI_API_KEY_INVALID"
  | "GEMINI_MODEL_ACCESS_DENIED"
  | "OPENAI_API_KEY_MISSING"
  | "OPENAI_API_KEY_INVALID"
  | "OPENAI_MODEL_ACCESS_DENIED"
  | "INVALID_IMAGE_PAYLOAD"
  | "INVALID_REQUEST"
  | "GEMINI_QUOTA_EXCEEDED"
  | "OPENAI_QUOTA_EXCEEDED"
  | "GEMINI_RESPONSE_INVALID"
  | "OPENAI_RESPONSE_INVALID"
  | "PDP_ANALYZE_FAILED"
  | "PDP_IMAGE_GENERATION_FAILED";

export interface PdpErrorResponse {
  ok: false;
  code: PdpErrorCode;
  message: string;
  detail?: string;
}

export type PdpAnalyzeResponse = PdpAnalyzeSuccessResponse | PdpErrorResponse;
export type PdpAnalyzeCustomerReviewsResponse = PdpAnalyzeCustomerReviewsSuccessResponse | PdpErrorResponse;
export type PdpGenerateImageResponse = PdpGenerateImageSuccessResponse | PdpErrorResponse;
export type PdpValidateApiKeyResponse = PdpValidateApiKeySuccessResponse | PdpErrorResponse;
