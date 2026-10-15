// Keep provider requests and the model names shown in the UI in sync.
// https://developers.openai.com/api/docs/guides/image-generation
// https://ai.google.dev/gemini-api/docs/image-generation
export const PDP_IMAGE_MODELS = {
  openai: {
    id: "gpt-image-2.5-sunburst",
    label: "OpenAI Image 2.5",
    name: "GPT Image 2.5 Sunburst"
  },
  gemini: {
    id: "gemini-3.1-flash-image",
    label: "Gemini Nano Banana 2",
    name: "Nano Banana 2 (Gemini 3.1 Flash Image)"
  }
} as const;

export const OPENAI_IMAGE_MODEL_OPTIONS = [
  { value: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst", description: "제품 원본을 살리는 정교한 이미지 편집에 적합합니다." },
  { value: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare", description: "빠른 속도로 다양한 이미지를 만들 때 적합합니다." }
] as const;

export const OPENAI_IMAGE_QUALITY_OPTIONS = [
  { value: "auto", label: "자동 · Auto" },
  { value: "low", label: "빠르게 · Low" },
  { value: "medium", label: "표준 · Medium" },
  { value: "high", label: "고품질 · High" },
  { value: "xhigh", label: "더 높은 품질 · XHigh" },
  { value: "max", label: "최고 품질 · Max" }
] as const;

export type OpenAiImageModel = typeof OPENAI_IMAGE_MODEL_OPTIONS[number]["value"];
export type OpenAiImageQuality = typeof OPENAI_IMAGE_QUALITY_OPTIONS[number]["value"];

export interface OpenAiImagePreferences {
  openAiImageModel: OpenAiImageModel;
  openAiImageQuality: OpenAiImageQuality;
}

export const DEFAULT_OPENAI_IMAGE_PREFERENCES: OpenAiImagePreferences = {
  openAiImageModel: "gpt-image-2.5-sunburst",
  openAiImageQuality: "medium"
};

export function normalizeOpenAiImageModel(value: unknown): OpenAiImageModel {
  return OPENAI_IMAGE_MODEL_OPTIONS.find((option) => option.value === value)?.value
    ?? DEFAULT_OPENAI_IMAGE_PREFERENCES.openAiImageModel;
}

export function normalizeOpenAiImageQuality(value: unknown): OpenAiImageQuality {
  return OPENAI_IMAGE_QUALITY_OPTIONS.find((option) => option.value === value)?.value
    ?? DEFAULT_OPENAI_IMAGE_PREFERENCES.openAiImageQuality;
}

export function getOpenAiImageModelName(value: unknown) {
  const model = normalizeOpenAiImageModel(value);
  return OPENAI_IMAGE_MODEL_OPTIONS.find((option) => option.value === model)!.label;
}

export const GEMINI_IMAGE_MODEL_OPTIONS = [
  { value: "gemini-3.1-flash-image", label: "Nano Banana 2", description: "빠르고 저렴한 기본 모델입니다." },
  { value: "gemini-3-pro-image-preview", label: "Nano Banana Pro", description: "글자·디테일 표현이 더 정교하고 비용이 높습니다." }
] as const;
export type GeminiImageModel = typeof GEMINI_IMAGE_MODEL_OPTIONS[number]["value"];
export interface GeminiImagePreferences { geminiImageModel: GeminiImageModel; }
export const DEFAULT_GEMINI_IMAGE_PREFERENCES: GeminiImagePreferences = { geminiImageModel: "gemini-3.1-flash-image" };
export function normalizeGeminiImageModel(value: unknown): GeminiImageModel {
  return GEMINI_IMAGE_MODEL_OPTIONS.find((option) => option.value === value)?.value ?? DEFAULT_GEMINI_IMAGE_PREFERENCES.geminiImageModel;
}
export function getGeminiImageModelName(value: unknown) {
  return GEMINI_IMAGE_MODEL_OPTIONS.find((option) => option.value === normalizeGeminiImageModel(value))!.label;
}

