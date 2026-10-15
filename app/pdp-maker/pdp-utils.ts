import { loadPdpClientSettings } from "./pdp-settings";
import { normalizeOpenAiImageModel } from "@runacademy/shared";
import type { AspectRatio, PdpAnalysisImageMetadata, PdpValidateApiKeyResponse } from "@runacademy/shared";
import { resolveGeminiApiKeyHeaderValue, resolveOpenAiApiKeyHeaderValue } from "./pdp-settings";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export const RATIO_OPTIONS: Array<{
  value: AspectRatio;
  label: string;
  description: string;
  icon: "square" | "portrait" | "phone" | "landscape" | "wide";
}> = [
  { value: "1:1", label: "정방형", description: "썸네일, 마켓 대표 이미지", icon: "square" },
  { value: "3:4", label: "일반 세로", description: "상세페이지 기본형", icon: "portrait" },
  { value: "9:16", label: "모바일 세로", description: "모바일 집중형 상세페이지", icon: "phone" },
  { value: "4:3", label: "일반 가로", description: "배너, 중간 섹션 컷", icon: "landscape" },
  { value: "16:9", label: "와이드", description: "히어로 배너형", icon: "wide" }
];

export const TONE_OPTIONS = [
  "AI 자동 추천",
  "프리미엄",
  "모던",
  "테크",
  "미니멀",
  "팝아트",
  "인스타감성",
  "레트로"
];

// Default request timeout. Generation calls (analyze/images/customer-reviews) pass
// GENERATION_API_TIMEOUT_MS because paid image generation can legitimately take minutes.
export const DEFAULT_API_TIMEOUT_MS = 120_000;
export const GENERATION_API_TIMEOUT_MS = 240_000;
export const HIGGSFIELD_GENERATION_API_TIMEOUT_MS = 600_000;
export const MAX_PDP_REQUEST_BYTES = 3_800_000;

export class PdpRequestError extends Error {
  constructor(message: string, public readonly outcomeUnknown: boolean) {
    super(message);
    this.name = "PdpRequestError";
  }
}

/** Optimize transport copies only; saved images and export pixels stay untouched. */
export async function preparePdpImageRequestBody(body: string) {
  const payload = JSON.parse(body);
  const options = payload.options ?? {};
  const fields = [
    { owner: payload, key: 'originalImageBase64', mime: 'originalImageMimeType' },
    { owner: options, key: 'baseImageBase64', mime: '' },
    { owner: options, key: 'referenceModelImageBase64', mime: 'referenceModelImageMimeType' }
  ].filter(field => typeof field.owner[field.key] === 'string' && field.owner[field.key]);
  if (new TextEncoder().encode(body).length <= MAX_PDP_REQUEST_BYTES) return body;
  const metadata = JSON.parse(body);
  delete metadata.originalImageBase64;
  if (metadata.options) { delete metadata.options.baseImageBase64; delete metadata.options.referenceModelImageBase64; }
  const available = MAX_PDP_REQUEST_BYTES - new TextEncoder().encode(JSON.stringify(metadata)).length - 20000;
  if (available < 300000 || !fields.length) throw new PdpRequestError('수정 지시나 구성 정보가 너무 깁니다. 내용을 줄여 다시 시도해 주세요. 이미지 요청은 전송하지 않았습니다.', false);
  const budget = Math.floor(available * 0.74 / fields.length);
  for (const field of fields) {
    const value = field.owner[field.key];
    const match = value.match(/^data:(image\/[^;]+);base64,([\s\S]+)$/);
    const base64 = match ? match[2] : value;
    const mimeType = match ? match[1] : field.owner[field.mime] || 'image/png';
    if (base64.length * 0.75 <= budget) continue;
    const compressed = await compressPreparedImagePayload({base64, mimeType, fileName: 'generation-reference'}, {allowLongPageSampling:false, analysisByteBudget:budget, generationByteBudget:budget, preserveGeneration:false});
    const next = compressed.generationBase64 ?? compressed.base64;
    const mime = compressed.generationMimeType ?? compressed.mimeType;
    field.owner[field.key] = field.mime ? next : toDataUrl(mime, next);
    if (field.mime) field.owner[field.mime] = mime;
  }
  const result = JSON.stringify(payload);
  if (new TextEncoder().encode(result).length > MAX_PDP_REQUEST_BYTES) throw new PdpRequestError('이미지 전송용 최적화를 완료하지 못했습니다. 원본과 현재 결과는 보존했으며 생성 요청은 전송하지 않았습니다.', false);
  return result;
}

export async function apiJson<T>(
  path: string,
  init?: RequestInit,
  options?: { geminiApiKey?: string | null; openAiApiKey?: string | null; timeoutMs?: number }
): Promise<T> {
  if (path === "/pdp/images" && typeof init?.body === "string") init = { ...init, body: await preparePdpImageRequestBody(init.body) };
  // 로컬 테스트 전용 텍스트 공급자(Codex CLI)를 텍스트 작업 요청에만 실어 보낸다.
  if (["/pdp/draft", "/pdp/draft-review", "/pdp/copy"].includes(path) && typeof init?.body === "string") {
    const textProvider = loadPdpClientSettings().textProvider ?? "api";
    if (textProvider === "codex-cli") init = { ...init, body: JSON.stringify({ ...JSON.parse(init.body), textProvider }) };
  }
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");

  const customGeminiApiKey =
    typeof options?.geminiApiKey === "string"
      ? resolveGeminiApiKeyHeaderValue({
          customGeminiApiKey: options.geminiApiKey
        })
      : resolveGeminiApiKeyHeaderValue();
  if (customGeminiApiKey) {
    headers.set("X-Gemini-Api-Key", customGeminiApiKey);
  }

  const customOpenAiApiKey =
    typeof options?.openAiApiKey === "string"
      ? resolveOpenAiApiKeyHeaderValue({
          customOpenAiApiKey: options.openAiApiKey
        })
      : resolveOpenAiApiKeyHeaderValue();
  if (customOpenAiApiKey) {
    headers.set("X-OpenAI-Api-Key", customOpenAiApiKey);
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new PdpRequestError(`요청이 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않았습니다. 공급자에서 처리되었을 수 있어 자동 재요청하지 않습니다. 결과와 사용량을 확인한 뒤 다시 시도해 주세요.`, true));
    }, timeoutMs);
  });
  const abort = () => controller.abort();
  init?.signal?.addEventListener("abort", abort, { once: true });
  if (init?.signal?.aborted) abort();
  try {
    if (typeof init?.body === "string" && new TextEncoder().encode(init.body).length > MAX_PDP_REQUEST_BYTES) {
      throw new PdpRequestError("자료 전체의 전송 용량이 큽니다. 추가 자료를 일부 삭제하거나 작은 이미지로 교체해 주세요.", false);
    }
    return await Promise.race([expired, (async () => {
      const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, signal: controller.signal });
      const rawBody = await response.text();
      try {
        return JSON.parse(rawBody) as T;
      } catch {
        throw new PdpRequestError(`API 응답을 확인하지 못했습니다 (HTTP ${response.status}). 공급자 결과와 사용량을 확인해 주세요.`, response.status >= 500 || response.ok);
      }
    })()]);
  } catch (error) {
    if (error instanceof PdpRequestError) throw error;
    throw new PdpRequestError(error instanceof Error ? error.message : "API 서버와 통신하지 못했습니다.", true);
  } finally {
    clearTimeout(timeoutId!);
    init?.signal?.removeEventListener("abort", abort);
  }
}

export async function validateGeminiApiKey(geminiApiKey: string, analysisOnly = false) {
  return apiJson<PdpValidateApiKeyResponse>(
    `/pdp/validate-key${analysisOnly ? "?scope=analysis" : ""}`,
    {
      method: "GET"
    },
    { geminiApiKey }
  );
}

export async function validateOpenAiApiKey(openAiApiKey: string, imageModel?: string, analysisOnly = false) {
  return apiJson<PdpValidateApiKeyResponse>(
    `/pdp/validate-openai-key?imageModel=${encodeURIComponent(normalizeOpenAiImageModel(imageModel))}${analysisOnly ? "&scope=analysis" : ""}`,
    {
      method: "GET"
    },
    { openAiApiKey }
  );
}

export function toDataUrl(mimeType: string, base64: string) {
  return `data:${mimeType};base64,${base64}`;
}

const STANDARD_ANALYSIS_MAX_DIMENSION = 1024;
const STANDARD_GENERATION_MAX_DIMENSION = 2048;
const OVERSIZED_STANDARD_MIN_PIXELS = 20_000_000;
const OVERSIZED_STANDARD_MAX_DIMENSION = 4096;
const LONG_DETAIL_MIN_HEIGHT = 3200;
const LONG_DETAIL_MIN_RATIO = 4.5;
const LONG_DETAIL_CANVAS_WIDTH = 1024;
const LONG_DETAIL_OVERVIEW_WIDTH = 168;
const LONG_DETAIL_PADDING = 14;
const LONG_DETAIL_GAP = 10;

export async function prepareImageFile(file: File, options?: { allowLongPageSampling?: boolean }) {
  const headerDimensions = await readImageDimensions(file).catch(() => null);
  const allowLongPageSampling = options?.allowLongPageSampling !== false;

  if (
    file.size > 1024 * 1024 ||
    (headerDimensions &&
    (isOversizedStandardImage(headerDimensions.width, headerDimensions.height) ||
      (allowLongPageSampling && isLongDetailPage(headerDimensions.width, headerDimensions.height))))
  ) {
    return optimizeImageFileOnServer(file, allowLongPageSampling);
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const sourceImage = await loadImage(sourceDataUrl);
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  const shouldSampleLongPage = allowLongPageSampling && isLongDetailPage(sourceWidth, sourceHeight);

  if (shouldSampleLongPage) {
    return buildLongDetailPagePayload(sourceImage, file);
  }

  if (isOversizedStandardImage(sourceWidth, sourceHeight)) {
    return buildStandardImagePayload(sourceImage, file);
  }

  return buildOriginalImagePayload(sourceDataUrl, sourceWidth, sourceHeight, file);
}

type PreparedImagePayloadLike = {
  base64: string;
  mimeType: string;
  fileName: string;
  analysisMetadata?: PdpAnalysisImageMetadata;
};

export function needsPreparedImageReoptimization(image: PreparedImagePayloadLike) {
  const metadata = image.analysisMetadata;

  if (!metadata || metadata.mode !== "original") {
    return false;
  }

  return (
    metadata.originalBytes > 1024 * 1024 ||
    isOversizedStandardImage(metadata.originalWidth, metadata.originalHeight) ||
    isOversizedStandardImage(metadata.optimizedWidth, metadata.optimizedHeight)
  );
}

export async function reoptimizePreparedImagePayload(
  image: PreparedImagePayloadLike,
  options?: { allowLongPageSampling?: boolean }
) {
  const blob = base64ToBlob(image.base64, image.mimeType);
  const file = new File([blob], image.fileName || "image", {
    type: image.mimeType
  });

  return prepareImageFile(file, options);
}

export async function compressPreparedImagePayload(
  image: PreparedImagePayloadLike & { generationBase64?: string; generationMimeType?: string },
  options: { allowLongPageSampling: boolean; analysisByteBudget: number; generationByteBudget: number; preserveGeneration?: boolean }
) {
  // A restored draft may contain a smaller analysis image and a full-quality reference.
  // Compress the reference for primary/person images; auxiliary images only need analysis.
  const alreadySampled = image.analysisMetadata?.mode === "long-detail-sampling";
  const sourceBase64 = options.preserveGeneration !== false && !alreadySampled ? image.generationBase64 ?? image.base64 : image.base64;
  const sourceMimeType = options.preserveGeneration !== false && !alreadySampled ? image.generationMimeType ?? image.mimeType : image.mimeType;
  const file = new File([base64ToBlob(sourceBase64, sourceMimeType)], image.fileName || "image", { type: sourceMimeType });
  let next = await optimizeImageFileOnServer(file, options.allowLongPageSampling && !alreadySampled, options);
  if (alreadySampled && options.preserveGeneration !== false && image.generationBase64) {
    // Preserve the overview/sample panel used for analysis and the separate
    // product crop used for generation; one must never replace the other.
    if (estimateBase64Bytes(image.generationBase64) <= options.generationByteBudget) {
      next = { ...next, generationBase64: image.generationBase64, generationMimeType: image.generationMimeType ?? image.mimeType, generationPreviewUrl: toDataUrl(image.generationMimeType ?? image.mimeType, image.generationBase64), analysisMetadata: next.analysisMetadata ? { ...next.analysisMetadata, generationReferenceWidth: image.analysisMetadata?.generationReferenceWidth, generationReferenceHeight: image.analysisMetadata?.generationReferenceHeight } : undefined };
    } else {
      const referenceMime = image.generationMimeType ?? image.mimeType;
      const reference = await optimizeImageFileOnServer(new File([base64ToBlob(image.generationBase64, referenceMime)], image.fileName, { type: referenceMime }), false, options);
      next = { ...next, generationBase64: reference.generationBase64, generationMimeType: reference.generationMimeType, generationPreviewUrl: reference.generationPreviewUrl, analysisMetadata: next.analysisMetadata ? { ...next.analysisMetadata, generationReferenceWidth: reference.analysisMetadata?.generationReferenceWidth, generationReferenceHeight: reference.analysisMetadata?.generationReferenceHeight } : undefined };
    }
  }
  const oldMetadata = image.analysisMetadata;
  const metadata = next.analysisMetadata;
  return {
    ...next,
    analysisMetadata: oldMetadata && metadata ? {
      ...metadata,
      originalWidth: oldMetadata.originalWidth,
      originalHeight: oldMetadata.originalHeight,
      originalBytes: oldMetadata.originalBytes,
      ...(oldMetadata.mode === "long-detail-sampling" ? { mode: oldMetadata.mode, sampleCount: oldMetadata.sampleCount } : {})
    } : metadata
  };
}

async function optimizeImageFileOnServer(file: File, allowLongPageSampling: boolean, budgets?: { analysisByteBudget: number; generationByteBudget: number }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("allowLongPageSampling", String(allowLongPageSampling));
  if (budgets) {
    formData.append("forceCompression", "true");
    formData.append("analysisByteBudget", String(budgets.analysisByteBudget));
    formData.append("generationByteBudget", String(budgets.generationByteBudget));
  }

  const response = await fetch(`${API_BASE_URL}/pdp/optimize-image`, {
    method: "POST",
    body: formData
  });
  const payload = await response.json() as
    | {
        ok: true;
        image: {
          base64: string;
          mimeType: string;
          fileName: string;
          generationBase64?: string;
          generationMimeType?: string;
          analysisMetadata?: PdpAnalysisImageMetadata;
        };
      }
    | { ok: false; message?: string; detail?: string };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "이미지를 최적화하지 못했습니다." : payload.message ?? "이미지를 최적화하지 못했습니다.");
  }

  return {
    ...payload.image,
    previewUrl: toDataUrl(payload.image.mimeType, payload.image.base64),
    generationPreviewUrl:
      payload.image.generationBase64 && payload.image.generationMimeType
        ? toDataUrl(payload.image.generationMimeType, payload.image.generationBase64)
        : undefined
  };
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType || "image/jpeg" });
}

function buildOriginalImagePayload(sourceDataUrl: string, sourceWidth: number, sourceHeight: number, file: File) {
  const parsed = parseImageDataUrl(sourceDataUrl, file);
  const analysisMetadata: PdpAnalysisImageMetadata = {
    mode: "original",
    originalWidth: sourceWidth,
    originalHeight: sourceHeight,
    optimizedWidth: sourceWidth,
    optimizedHeight: sourceHeight,
    originalBytes: file.size,
    optimizedBytes: file.size
  };

  return {
    base64: parsed.base64,
    mimeType: parsed.mimeType,
    previewUrl: sourceDataUrl,
    fileName: file.name,
    generationBase64: parsed.base64,
    generationMimeType: parsed.mimeType,
    generationPreviewUrl: sourceDataUrl,
    analysisMetadata
  };
}

function buildStandardImagePayload(sourceImage: HTMLImageElement, file: File) {
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  const analysisPayload = resizeImageToJpegPayload(sourceImage, STANDARD_ANALYSIS_MAX_DIMENSION, 0.84);
  const generationReference = resizeImageToJpegPayload(sourceImage, STANDARD_GENERATION_MAX_DIMENSION, 0.9);
  const analysisMetadata: PdpAnalysisImageMetadata = {
    mode: "standard-resize",
    originalWidth: sourceWidth,
    originalHeight: sourceHeight,
    optimizedWidth: analysisPayload.width,
    optimizedHeight: analysisPayload.height,
    originalBytes: file.size,
    optimizedBytes: analysisPayload.bytes,
    generationReferenceWidth: generationReference.width,
    generationReferenceHeight: generationReference.height
  };

  return {
    base64: analysisPayload.base64,
    mimeType: "image/jpeg" as const,
    previewUrl: analysisPayload.previewUrl,
    fileName: file.name,
    generationBase64: generationReference.base64,
    generationMimeType: "image/jpeg" as const,
    generationPreviewUrl: generationReference.previewUrl,
    analysisMetadata
  };
}

function parseImageDataUrl(sourceDataUrl: string, file: File) {
  const match = sourceDataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error("이미지 데이터를 읽지 못했습니다.");
  }

  return {
    mimeType: file.type.startsWith("image/") ? file.type : match[1],
    base64: match[2]
  };
}

function buildLongDetailPagePayload(sourceImage: HTMLImageElement, file: File) {
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  const sampleCount = getLongDetailSampleCount(sourceHeight);
  const detailStartX = LONG_DETAIL_PADDING + LONG_DETAIL_OVERVIEW_WIDTH + LONG_DETAIL_GAP;
  const detailWidth = Math.floor(
    (LONG_DETAIL_CANVAS_WIDTH - detailStartX - LONG_DETAIL_PADDING - LONG_DETAIL_GAP) / 2
  );
  const detailHeight = Math.round(detailWidth * 1.35);
  const rows = Math.ceil(sampleCount / 2);
  const canvasHeight = LONG_DETAIL_PADDING * 2 + rows * detailHeight + Math.max(0, rows - 1) * LONG_DETAIL_GAP;

  const canvas = document.createElement("canvas");
  canvas.width = LONG_DETAIL_CANVAS_WIDTH;
  canvas.height = canvasHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지 캔버스를 초기화하지 못했습니다.");
  }

  context.fillStyle = "#f7f3e8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(LONG_DETAIL_PADDING, LONG_DETAIL_PADDING, LONG_DETAIL_OVERVIEW_WIDTH, canvasHeight - LONG_DETAIL_PADDING * 2);
  context.drawImage(
    sourceImage,
    0,
    0,
    sourceWidth,
    sourceHeight,
    LONG_DETAIL_PADDING,
    LONG_DETAIL_PADDING,
    LONG_DETAIL_OVERVIEW_WIDTH,
    canvasHeight - LONG_DETAIL_PADDING * 2
  );

  const cropHeight = Math.min(sourceHeight, Math.round(sourceWidth * (detailHeight / detailWidth)));
  const maxCropTop = Math.max(0, sourceHeight - cropHeight);

  for (let index = 0; index < sampleCount; index += 1) {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const targetX = detailStartX + column * (detailWidth + LONG_DETAIL_GAP);
    const targetY = LONG_DETAIL_PADDING + row * (detailHeight + LONG_DETAIL_GAP);
    const sourceY = Math.round((maxCropTop * index) / (sampleCount - 1));

    context.fillStyle = "#ffffff";
    context.fillRect(targetX, targetY, detailWidth, detailHeight);
    context.drawImage(
      sourceImage,
      0,
      sourceY,
      sourceWidth,
      cropHeight,
      targetX,
      targetY,
      detailWidth,
      detailHeight
    );
  }

  const analysisPayload = canvasToJpegPayload(canvas, 0.82);
  const generationReference = buildGenerationReferencePayload(sourceImage);
  const analysisMetadata: PdpAnalysisImageMetadata = {
    mode: "long-detail-sampling",
    originalWidth: sourceWidth,
    originalHeight: sourceHeight,
    optimizedWidth: analysisPayload.width,
    optimizedHeight: analysisPayload.height,
    originalBytes: file.size,
    optimizedBytes: analysisPayload.bytes,
    sampleCount,
    generationReferenceWidth: generationReference.width,
    generationReferenceHeight: generationReference.height
  };

  return {
    base64: analysisPayload.base64,
    mimeType: "image/jpeg" as const,
    previewUrl: analysisPayload.previewUrl,
    fileName: file.name,
    generationBase64: generationReference.base64,
    generationMimeType: "image/jpeg" as const,
    generationPreviewUrl: generationReference.previewUrl,
    analysisMetadata
  };
}

async function buildLongDetailPagePayloadFromFile(file: File, sourceWidth: number, sourceHeight: number) {
  const sampleCount = getLongDetailSampleCount(sourceHeight);
  const detailStartX = LONG_DETAIL_PADDING + LONG_DETAIL_OVERVIEW_WIDTH + LONG_DETAIL_GAP;
  const detailWidth = Math.floor(
    (LONG_DETAIL_CANVAS_WIDTH - detailStartX - LONG_DETAIL_PADDING - LONG_DETAIL_GAP) / 2
  );
  const detailHeight = Math.round(detailWidth * 1.35);
  const rows = Math.ceil(sampleCount / 2);
  const canvasHeight = LONG_DETAIL_PADDING * 2 + rows * detailHeight + Math.max(0, rows - 1) * LONG_DETAIL_GAP;
  const overviewHeight = canvasHeight - LONG_DETAIL_PADDING * 2;
  const cropHeight = Math.min(sourceHeight, Math.round(sourceWidth * (detailHeight / detailWidth)));
  const maxCropTop = Math.max(0, sourceHeight - cropHeight);

  const canvas = document.createElement("canvas");
  canvas.width = LONG_DETAIL_CANVAS_WIDTH;
  canvas.height = canvasHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지 캔버스를 초기화하지 못했습니다.");
  }

  context.fillStyle = "#f7f3e8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(LONG_DETAIL_PADDING, LONG_DETAIL_PADDING, LONG_DETAIL_OVERVIEW_WIDTH, overviewHeight);

  for (let index = 0; index < sampleCount; index += 1) {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const targetX = detailStartX + column * (detailWidth + LONG_DETAIL_GAP);
    const targetY = LONG_DETAIL_PADDING + row * (detailHeight + LONG_DETAIL_GAP);
    const sourceY = Math.round((maxCropTop * index) / (sampleCount - 1));
    const bitmap = await createImageBitmap(file, 0, sourceY, sourceWidth, cropHeight, {
      resizeWidth: detailWidth,
      resizeHeight: detailHeight,
      resizeQuality: "high"
    });
    const overviewY = LONG_DETAIL_PADDING + Math.round((sourceY / Math.max(sourceHeight, 1)) * overviewHeight);
    const overviewSliceHeight = Math.max(8, Math.round((cropHeight / Math.max(sourceHeight, 1)) * overviewHeight));

    context.fillStyle = "#ffffff";
    context.fillRect(targetX, targetY, detailWidth, detailHeight);
    context.drawImage(bitmap, targetX, targetY, detailWidth, detailHeight);
    context.drawImage(
      bitmap,
      LONG_DETAIL_PADDING,
      Math.min(LONG_DETAIL_PADDING + overviewHeight - overviewSliceHeight, overviewY),
      LONG_DETAIL_OVERVIEW_WIDTH,
      overviewSliceHeight
    );
    bitmap.close();
  }

  const analysisPayload = canvasToJpegPayload(canvas, 0.82);
  const generationReference = await buildGenerationReferencePayloadFromFile(file, sourceWidth, sourceHeight);
  const analysisMetadata: PdpAnalysisImageMetadata = {
    mode: "long-detail-sampling",
    originalWidth: sourceWidth,
    originalHeight: sourceHeight,
    optimizedWidth: analysisPayload.width,
    optimizedHeight: analysisPayload.height,
    originalBytes: file.size,
    optimizedBytes: analysisPayload.bytes,
    sampleCount,
    generationReferenceWidth: generationReference.width,
    generationReferenceHeight: generationReference.height
  };

  return {
    base64: analysisPayload.base64,
    mimeType: "image/jpeg" as const,
    previewUrl: analysisPayload.previewUrl,
    fileName: file.name,
    generationBase64: generationReference.base64,
    generationMimeType: "image/jpeg" as const,
    generationPreviewUrl: generationReference.previewUrl,
    analysisMetadata
  };
}

function buildGenerationReferencePayload(sourceImage: HTMLImageElement) {
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  const cropHeight = Math.min(sourceHeight, Math.round(sourceWidth * 1.35));
  const targetWidth = Math.min(STANDARD_ANALYSIS_MAX_DIMENSION, sourceWidth);
  const targetHeight = Math.max(1, Math.round((cropHeight * targetWidth) / Math.max(sourceWidth, 1)));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지 캔버스를 초기화하지 못했습니다.");
  }

  context.drawImage(sourceImage, 0, 0, sourceWidth, cropHeight, 0, 0, targetWidth, targetHeight);

  return canvasToJpegPayload(canvas, 0.88);
}

async function buildGenerationReferencePayloadFromFile(file: File, sourceWidth: number, sourceHeight: number) {
  const cropHeight = Math.min(sourceHeight, Math.round(sourceWidth * 1.35));
  const targetWidth = Math.min(STANDARD_ANALYSIS_MAX_DIMENSION, sourceWidth);
  const targetHeight = Math.max(1, Math.round((cropHeight * targetWidth) / Math.max(sourceWidth, 1)));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지 캔버스를 초기화하지 못했습니다.");
  }

  const bitmap = await createImageBitmap(file, 0, 0, sourceWidth, cropHeight, {
    resizeWidth: targetWidth,
    resizeHeight: targetHeight,
    resizeQuality: "high"
  });
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  return canvasToJpegPayload(canvas, 0.88);
}

function resizeImageToJpegPayload(sourceImage: HTMLImageElement, maxDimension: number, quality: number) {
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight, 1));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지 캔버스를 초기화하지 못했습니다.");
  }

  context.drawImage(sourceImage, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

  return canvasToJpegPayload(canvas, quality);
}

function isLongDetailPage(width: number, height: number) {
  return height >= LONG_DETAIL_MIN_HEIGHT && height / Math.max(width, 1) >= LONG_DETAIL_MIN_RATIO;
}

function isOversizedStandardImage(width: number, height: number) {
  return width * height >= OVERSIZED_STANDARD_MIN_PIXELS || Math.max(width, height) >= OVERSIZED_STANDARD_MAX_DIMENSION;
}

function getLongDetailSampleCount(height: number) {
  if (height >= 30000) {
    return 16;
  }
  if (height >= 16000) {
    return 14;
  }
  if (height >= 8000) {
    return 12;
  }

  return 10;
}

function canvasToJpegPayload(canvas: HTMLCanvasElement, quality: number) {
  const previewUrl = canvas.toDataURL("image/jpeg", quality);
  const base64 = previewUrl.split(",")[1] ?? "";

  if (!base64) {
    throw new Error("이미지 변환 결과가 비어 있습니다.");
  }

  return {
    base64,
    previewUrl,
    width: canvas.width,
    height: canvas.height,
    bytes: estimateBase64Bytes(base64)
  };
}

function estimateBase64Bytes(base64: string) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

async function readImageDimensions(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());

  if (isPng(bytes)) {
    return {
      width: readUint32(bytes, 16),
      height: readUint32(bytes, 20)
    };
  }

  if (isJpeg(bytes)) {
    const dimensions = readJpegDimensions(bytes);
    if (dimensions) {
      return dimensions;
    }
  }

  return null;
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function readJpegDimensions(bytes: Uint8Array) {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0x01) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const segmentLength = readUint16(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      break;
    }

    if (isJpegStartOfFrame(marker)) {
      return {
        height: readUint16(bytes, offset + 3),
        width: readUint16(bytes, offset + 5)
      };
    }

    offset += segmentLength;
  }

  return null;
}

function isJpegStartOfFrame(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readUint16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 256 ** 3 +
    bytes[offset + 1] * 256 ** 2 +
    bytes[offset + 2] * 256 +
    bytes[offset + 3]
  );
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}
