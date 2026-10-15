"use client";

import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { AlertCircle, Bot, ChevronDown, Clock3, Copy, FileText, FolderOpen, Info, KeyRound, Loader2, Lock, Menu, RectangleHorizontal, RectangleVertical, Settings2, Smartphone, Sparkles, Square, Trash2, Upload, Wand2, X } from "lucide-react";
import { DEFAULT_HIGGSFIELD_IMAGE_PREFERENCES, DEFAULT_OPENAI_IMAGE_PREFERENCES, PDP_IMAGE_MODELS, getPdpSectionImageDefaults } from "@runacademy/shared";
import type {
  AspectRatio,
  HiggsfieldImagePreferences,
  OpenAiImagePreferences,
  GeneratedResult,
  PdpAiProvider,
  PdpAnalyzeCustomerReviewsResponse,
  PdpCustomerReviewAnalysis,
  PdpCustomerReviewSource,
  PdpDraftPlan,
  PdpGenerateImageResponse,
  PdpOutputMode,
  PdpSourceMaterial,
  ReferenceModelUsage
} from "@runacademy/shared";
import { compressPdpInputs } from "./pdp-input-compression";
import type { PdpAppState, PdpDraftSummary, PdpEditorDraftState, PdpSourceMaterialDraft, PreparedImageDraft } from "./pdp-drafts";
import { exportPdpDraft, importPdpDraft, deletePdpDraft, getPdpDraft, listPdpDrafts, savePdpDraft } from "./pdp-drafts";
import { PdpCostPreview } from "./PdpRevisionControls";
import { PdpDraftBackupControls } from "./PdpDraftBackupControls";
import { PdpBugReportWidget } from "./PdpBugReportWidget";
import { PdpEditor } from "./PdpEditor";
import { PdpSettingsSheet } from "./PdpSettingsSheet";
import { PdpHiggsfieldImageControls, useHiggsfieldConnection, validateHiggsfieldReferenceCount } from "./PdpHiggsfieldImageControls";
import { PdpOpenAiImageControls } from "./PdpOpenAiImageControls";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import styles from "./pdp-maker.module.css";
import { flushPdpUsageLogs, installPdpUsageLogFlushHandlers, logPdpUsage } from "./pdp-usage-log";
import {
  loadPdpClientSettings,
  resolveGeminiApiKeyHeaderValue,
  resolveOpenAiApiKeyHeaderValue,
  savePdpClientSettings,
  type PdpClientSettings
} from "./pdp-settings";
import {
  RATIO_OPTIONS,
  TONE_OPTIONS,
  apiJson,
  GENERATION_API_TIMEOUT_MS,
  HIGGSFIELD_GENERATION_API_TIMEOUT_MS,
  MAX_PDP_REQUEST_BYTES,
  prepareImageFile,
  validateGeminiApiKey,
  validateOpenAiApiKey
} from "./pdp-utils";


// 분할: 컴포넌트 본체와 분리한 타입·상수·순수 함수 (2026-10-15, Claude Code)

export type PreparedImage = PreparedImageDraft;

export type WaitingVideo = {
  videoId: string;
  title: string;
  url: string;
  embedUrl: string;
};

export const DEFAULT_WAITING_VIDEO: WaitingVideo = {
  videoId: "ffsqj3Re33E",
  title: "한이룸 유튜브 추천 영상",
  url: "https://www.youtube.com/watch?v=ffsqj3Re33E",
  embedUrl: "https://www.youtube.com/embed/ffsqj3Re33E?rel=0&modestbranding=1"
};

export type SectionImageBatchResult = {
  result: GeneratedResult;
  failedCount: number;
  errorMessage: string;
  errorDetail: string;
};

export const INITIAL_HERO_SECTION_COUNT = 1;
export const APP_TITLE = "한이룸의 상세페이지 마법사 3.1";



export const MAX_SOURCE_MATERIAL_FILES = 8;
export const MAX_SOURCE_MATERIAL_TEXT_CHARS = 40000;
export const MAX_SOURCE_MATERIAL_TEXT_CHARS_PER_FILE = 12000;
export const MAX_PDF_TEXT_PAGES = 80;
export const MAX_PDF_ANALYSIS_PAGES = 3;
export const PDF_ANALYSIS_RENDER_WIDTH = 900;
export const OUTPUT_MODE_OPTIONS: Array<{
  value: PdpOutputMode;
  label: string;
  description: string;
  badge: string;
  locked?: boolean;
}> = [
  {
    value: "full-image",
    label: "통이미지 모드",
    description: "카피와 디자인까지 이미지 안에 포함된 섹션으로 만듭니다.",
    badge: "Gemini / OpenAI / Higgsfield"
  },
  {
    value: "editable",
    label: "텍스트편집 모드",
    description: "이미지와 텍스트 레이어를 나눠 문구를 직접 수정합니다.",
    badge: "문구 직접 편집"
  }
];
export const EMPTY_CLIENT_SETTINGS: PdpClientSettings = {
  ...DEFAULT_OPENAI_IMAGE_PREFERENCES,
  geminiImageModel: "gemini-3.1-flash-image",
  ...DEFAULT_HIGGSFIELD_IMAGE_PREFERENCES,
  customGeminiApiKey: "",
  customOpenAiApiKey: "",
  preferredAiProvider: ""
};

export const AI_PROVIDER_OPTIONS: Array<{
  value: PdpAiProvider;
  label: string;
  description: string;
  badge: string;
}> = [
  {
    value: "gemini",
    label: PDP_IMAGE_MODELS.gemini.label,
    description: "Gemini 분석과 Nano Banana 2 이미지 생성",
    badge: "최신 이미지 모델"
  },
  {
    value: "openai",
    label: PDP_IMAGE_MODELS.openai.label,
    description: "OpenAI 분석과 Image 2.5 이미지 생성",
    badge: "새 실험 경로"
  },
  { value: "higgsfield", label: "Higgsfield", description: "계정 연결로 레퍼런스 이미지 생성", badge: "MCP 연결" }
];

export const PRODUCT_CONTEXT_GUIDANCE_MESSAGE = "상품명이나 카테고리를 함께 적어주시면 상품에 더 잘 맞는 구성과 문구를 만드는 데 도움이 됩니다. 추가 입력 없이도 계속할 수 있어요.";

export type UploadContextGuidance = {
  tone: "warning" | "ready";
  title: string;
  message: string;
  reason: string;
};


export function SavedDraftsSheet({
  drafts,
  isLoadingDraft,
  isLoadingDrafts,
  lastSavedAt,
  onDeleteDraft,
  onLoadDraft,
  onOpenChange,
  open
}: {
  drafts: PdpDraftSummary[];
  isLoadingDraft: boolean;
  isLoadingDrafts: boolean;
  lastSavedAt: string | null;
  onDeleteDraft: (draftId: string) => void;
  onLoadDraft: (draftId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className={`${styles.settingsSheet} ${styles.draftsSheet}`} side="right">
        <SheetHeader className={styles.settingsSheetHeader}>
          <div className={styles.settingsSheetKicker}>
            <FolderOpen size={14} />
            저장된 작업
          </div>
          <SheetTitle className={styles.settingsSheetTitle}>이전 작업 선택</SheetTitle>
          <SheetDescription className={styles.settingsSheetDescription}>
            브라우저에 저장된 초안을 선택해 이어서 작업할 수 있습니다.
          </SheetDescription>
        </SheetHeader>

        <div className={styles.draftsSheetBody}>
          <div className={styles.draftsSheetSummary}>
            <span>저장된 작업</span>
            <strong>{isLoadingDrafts ? "확인 중" : `${drafts.length}개`}</strong>
            {lastSavedAt ? <small>최근 저장 {formatSavedDraftDate(lastSavedAt)}</small> : null}
          </div>

          {isLoadingDrafts ? (
            <div className={styles.savedDraftsEmpty}>
              <Loader2 className={styles.spinIcon} size={16} />
              저장된 작업을 불러오는 중입니다.
            </div>
          ) : drafts.length ? (
            <div className={styles.draftsSheetList}>
              {drafts.map((draft) => (
                <article className={styles.draftsSheetCard} key={draft.id}>
                  <div className={styles.savedDraftPreviewFrame}>
                    {draft.thumbnailUrl ? <img alt={draft.title} src={draft.thumbnailUrl} /> : <Sparkles size={18} />}
                  </div>
                  <div className={styles.savedDraftCopy}>
                    <div className={styles.savedDraftHeaderRow}>
                      <strong title={draft.title}>{draft.title}</strong>
                      <span className={styles.savedDraftCountBadge}>{draft.sectionCount}섹션</span>
                    </div>
                    <p className={styles.savedDraftTimestamp}>{formatSavedDraftDate(draft.updatedAt)}</p>
                    <div className={styles.savedDraftPreviewMeta}>
                      <span className={styles.savedDraftStageBadge}>{draft.stageLabel}</span>
                      <span className={styles.savedDraftAspectBadge}>{draft.aspectRatio}</span>
                    </div>
                    <div className={styles.savedDraftActions}>
                      <button className={styles.inlineButton} disabled={isLoadingDraft} onClick={() => onLoadDraft(draft.id)} type="button">
                        <FolderOpen size={14} />
                        불러오기
                      </button>
                      <button className={styles.inlineDangerButton} onClick={() => onDeleteDraft(draft.id)} type="button">
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.savedDraftsEmpty}>
              <Clock3 size={16} />
              아직 저장된 작업이 없습니다.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function UploadDropzone({
  accept = "image/*",
  compact = false,
  description,
  disabled = false,
  hint,
  multiple = false,
  onSelect,
  selectedFileName,
  title
}: {
  accept?: string;
  compact?: boolean;
  description: string;
  disabled?: boolean;
  hint: string;
  multiple?: boolean;
  onSelect: (files: File[]) => Promise<void>;
  selectedFileName?: string;
  title: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) {
      await onSelect(multiple ? files : files.slice(0, 1));
    }
  };

  return (
    <>
      <input
        accept={accept}
        className={styles.hiddenInput}
        multiple={multiple}
        onChange={async (event) => {
          const files = Array.from(event.target.files || []);
          if (files.length) {
            await onSelect(multiple ? files : files.slice(0, 1));
          }
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />

      <button
        className={`${compact ? styles.dropzoneCompact : ""} ${dragActive ? styles.dropzoneActive : styles.dropzone}`.trim()}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        type="button"
      >
        <div className={styles.dropzoneIcon}>
          <Upload size={24} />
        </div>
        <strong>{title}</strong>
        <p>{description}</p>
        <span className={styles.dropzoneHint}>{selectedFileName ? `선택됨: ${selectedFileName}` : hint}</span>
      </button>
    </>
  );
}

export function renderRatioIcon(icon: "square" | "portrait" | "phone" | "landscape" | "wide") {
  if (icon === "square") {
    return <Square size={18} />;
  }
  if (icon === "portrait") {
    return <RectangleVertical size={18} />;
  }
  if (icon === "phone") {
    return <Smartphone size={18} />;
  }
  if (icon === "wide") {
    return <RectangleHorizontal size={18} style={{ transform: "scaleX(1.2)" }} />;
  }
  return <RectangleHorizontal size={18} />;
}

export function summarizeFileForUsageLog(file: File) {
  return {
    size: file.size,
    type: file.type || "unknown",
    extension: getFileExtension(file.name)
  };
}

export function summarizePreparedImageForUsageLog(image: PreparedImage) {
  const metadata = image.analysisMetadata;
  return {
    mimeType: image.mimeType,
    hasGenerationImage: Boolean(image.generationBase64),
    analysisMode: metadata?.mode ?? "unknown",
    originalWidth: metadata?.originalWidth,
    originalHeight: metadata?.originalHeight,
    optimizedWidth: metadata?.optimizedWidth,
    optimizedHeight: metadata?.optimizedHeight,
    originalBytes: metadata?.originalBytes,
    optimizedBytes: metadata?.optimizedBytes,
    sampleCount: metadata?.sampleCount
  };
}

export function isSupportedSourceMaterialFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type.startsWith("image/")
    || /\.(png|jpe?g|webp|gif|avif)$/i.test(name)
    || file.type === "application/pdf"
    || name.endsWith(".pdf");
}

export async function prepareSourceMaterialFile(file: File): Promise<PdpSourceMaterialDraft> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return preparePdfSourceMaterial(file);
  }

  const preparedImage = await prepareImageFile(file, { allowLongPageSampling: true });
  return {
    id: createSourceMaterialId(file),
    kind: "image",
    role: "supporting",
    fileName: file.name.slice(0, 160),
    mimeType: file.type || preparedImage.mimeType,
    size: file.size,
    preparedImage,
    previewUrl: preparedImage.previewUrl
  };
}

export async function preparePdfSourceMaterial(file: File): Promise<PdpSourceMaterialDraft> {
  const source = await extractPdfSourceData(file);
  return {
    id: createSourceMaterialId(file),
    kind: "pdf",
    role: "supporting",
    fileName: file.name.slice(0, 160),
    mimeType: "application/pdf",
    size: file.size,
    pageCount: source.pageCount,
    analysisPages: source.analysisPages,
    text: source.text.slice(0, MAX_SOURCE_MATERIAL_TEXT_CHARS_PER_FILE),
    preparedImage: source.preparedImage,
    previewUrl: source.preparedImage.previewUrl
  };
}

export async function extractPdfSourceData(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), wasmUrl: "/pdfjs/wasm/" }).promise;
  const textPages: string[] = [];
  const analysisPages: NonNullable<PdpSourceMaterial["analysisPages"]> = [];
  const renderedPages: HTMLCanvasElement[] = [];
  const pageCount = pdf.numPages;
  if (pageCount > MAX_PDF_TEXT_PAGES) throw new Error(`PDF는 ${MAX_PDF_TEXT_PAGES}쪽까지 전체 분석할 수 있습니다. 파일을 나눠 등록해 주세요.`);
  const readPageCount = pageCount;

  for (let pageNumber = 1; pageNumber <= readPageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);

    const rendered = await renderPdfPageToCanvas(page);
    if (pageNumber <= MAX_PDF_ANALYSIS_PAGES) renderedPages.push(rendered);
    const pageBudget = Math.floor(1_250_000 / readPageCount);
    const sample = document.createElement('canvas');
    let width = Math.min(1000, rendered.width), encoded = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      sample.width = width; sample.height = Math.max(1, Math.round(rendered.height * width / rendered.width));
      sample.getContext('2d')!.drawImage(rendered, 0, 0, sample.width, sample.height);
      encoded = sample.toDataURL('image/jpeg', .7).split(',')[1];
      if (estimateBase64Bytes(encoded) <= pageBudget) break;
      width = Math.round(width * .8);
    }
    if (estimateBase64Bytes(encoded) > pageBudget || width < 300) throw new Error('PDF를 읽을 수 있는 크기로 압축하지 못했습니다. 파일을 나눠 등록해 주세요.');
    analysisPages.push({ page: pageNumber, base64: encoded, mimeType: 'image/jpeg' });
    if (pageNumber > MAX_PDF_ANALYSIS_PAGES) { rendered.width = 1; rendered.height = 1; }
    page.cleanup();

    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) {
      textPages.push(`[${file.name} p.${pageNumber}] ${text}`);
    }

    // Continue every visual page even when the text budget has been reached.
  }

  if (!renderedPages.length) {
    throw new Error("PDF 대표 페이지를 이미지로 변환하지 못했습니다.");
  }

  if (!renderedPages.some(canvas => {
    const probe = document.createElement('canvas'); probe.width = 80; probe.height = 80;
    const context = probe.getContext('2d'); if (!context) return false;
    context.drawImage(canvas, 0, 0, 80, 80);
    const pixels = context.getImageData(0, 0, 80, 80).data;
    for (let i = 0; i < pixels.length; i += 4) if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 240) return true;
    return false;
  })) throw new Error('PDF 대표 페이지가 빈 화면으로 변환되었습니다. 상품이 보이는 이미지로 등록하거나 PDF를 다시 저장해 주세요.');
  const combined = combinePdfPageCanvases(renderedPages);
  const dataUrl = combined.canvas.toDataURL("image/jpeg", 0.86);
  const parsed = parseDataUrlParts(dataUrl);
  const optimizedBytes = estimateBase64Bytes(parsed.base64);
  const preparedImage: PreparedImage = {
    base64: parsed.base64,
    mimeType: parsed.mimeType,
    previewUrl: dataUrl,
    fileName: file.name,
    generationBase64: parsed.base64,
    generationMimeType: parsed.mimeType,
    generationPreviewUrl: dataUrl,
    analysisMetadata: {
      mode: "standard-resize",
      originalWidth: combined.width,
      originalHeight: combined.height,
      optimizedWidth: combined.width,
      optimizedHeight: combined.height,
      originalBytes: file.size,
      optimizedBytes
    }
  };

  return {
    pageCount,
    analysisPages,
    text: textPages.join("\n").slice(0, MAX_SOURCE_MATERIAL_TEXT_CHARS_PER_FILE),
    preparedImage
  };
}

export async function renderPdfPageToCanvas(page: any) {
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1.6, PDF_ANALYSIS_RENDER_WIDTH / Math.max(viewport.width, 1));
  const scaledViewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(scaledViewport.width));
  canvas.height = Math.max(1, Math.ceil(scaledViewport.height));
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("PDF 렌더링 캔버스를 만들지 못했습니다.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
  return canvas;
}

export function combinePdfPageCanvases(pages: HTMLCanvasElement[]) {
  const gap = pages.length > 1 ? 18 : 0;
  const width = Math.max(...pages.map((page) => page.width));
  const height = pages.reduce((sum, page) => sum + page.height, 0) + gap * Math.max(0, pages.length - 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("PDF 대표 이미지를 합치지 못했습니다.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  let y = 0;
  pages.forEach((page) => {
    const x = Math.floor((width - page.width) / 2);
    context.drawImage(page, x, y);
    y += page.height + gap;
  });

  return { canvas, width, height };
}

export function parseDataUrlParts(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("분석용 이미지 데이터 형식이 올바르지 않습니다.");
  }

  return {
    mimeType: match[1],
    base64: match[2]
  };
}

export function estimateBase64Bytes(base64: string) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function createSourceMaterialId(file: File) {
  return `${Date.now()}-${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
}

export function markPrimarySourceMaterial(
  materials: PdpSourceMaterialDraft[],
  primaryId: string,
  primaryImage: PreparedImage
) {
  return materials.map((material) => ({
    ...material,
    role: material.id === primaryId ? "primary" as const : "supporting" as const,
    preparedImage: material.id === primaryId ? primaryImage : material.preparedImage,
    previewUrl: material.id === primaryId ? primaryImage.previewUrl : material.previewUrl
  }));
}

export function getVisibleSourceMaterials(materials: PdpSourceMaterialDraft[], preparedImage: PreparedImage | null) {
  if (materials.length) {
    return materials;
  }

  return preparedImage ? [buildFallbackSourceMaterial(preparedImage)] : [];
}

export function buildFallbackSourceMaterial(preparedImage: PreparedImage): PdpSourceMaterialDraft {
  return {
    id: "primary-source-material",
    kind: isPdfPreparedImage(preparedImage) ? "pdf" : "image",
    role: "primary",
    fileName: preparedImage.fileName,
    mimeType: isPdfPreparedImage(preparedImage) ? "application/pdf" : preparedImage.mimeType,
    size: preparedImage.analysisMetadata?.originalBytes ?? 0,
    preparedImage,
    previewUrl: preparedImage.previewUrl
  };
}

export function getSourceMaterialsForDraft(materials: PdpSourceMaterialDraft[], preparedImage: PreparedImage | null) {
  return getVisibleSourceMaterials(materials, preparedImage).slice(0, MAX_SOURCE_MATERIAL_FILES);
}

export function syncSourceMaterialsWithPrimary(materials: PdpSourceMaterialDraft[], primaryImage: PreparedImage) {
  const draftMaterials = getSourceMaterialsForDraft(materials, primaryImage);
  const primaryIndex = Math.max(0, draftMaterials.findIndex((material) => material.role === "primary"));

  return draftMaterials.map((material, index) => ({
    ...material,
    role: index === primaryIndex ? "primary" as const : "supporting" as const,
    kind: index === primaryIndex && isPdfPreparedImage(primaryImage) ? "pdf" as const : material.kind,
    fileName: index === primaryIndex ? primaryImage.fileName : material.fileName,
    mimeType: index === primaryIndex && isPdfPreparedImage(primaryImage) ? "application/pdf" : material.mimeType,
    preparedImage: index === primaryIndex ? primaryImage : material.preparedImage,
    previewUrl: index === primaryIndex ? primaryImage.previewUrl : material.previewUrl
  }));
}

export function buildAnalyzeSourceMaterials(materials: PdpSourceMaterialDraft[]): PdpSourceMaterial[] | undefined {
  let remainingTextBudget = MAX_SOURCE_MATERIAL_TEXT_CHARS;
  const result = materials.slice(0, MAX_SOURCE_MATERIAL_FILES).map((material) => {
    const text = material.text && remainingTextBudget > 0
      ? material.text.slice(0, Math.min(MAX_SOURCE_MATERIAL_TEXT_CHARS_PER_FILE, remainingTextBudget))
      : undefined;
    if (text) {
      remainingTextBudget -= text.length;
    }

    const includeImagePayload = material.role !== "primary" && material.preparedImage;
    return {
      kind: material.kind,
      role: material.role,
      fileName: material.fileName,
      mimeType: material.mimeType,
      size: material.size,
      pageCount: material.pageCount,
      analysisPages: material.analysisPages,
      text,
      imageBase64: includeImagePayload ? material.preparedImage?.base64 : undefined,
      imageMimeType: includeImagePayload ? material.preparedImage?.mimeType : undefined,
      imageOptimization: material.preparedImage?.analysisMetadata
    };
  });

  return result.length ? result : undefined;
}

export function buildSourceMaterialsNotice(materials: PdpSourceMaterialDraft[], skippedCount: number) {
  const summary = summarizeSourceMaterialsForUi(materials);
  const primary = materials.find((material) => material.role === "primary");
  const skipped = skippedCount ? ` 최대 ${MAX_SOURCE_MATERIAL_FILES}개까지만 반영되어 ${skippedCount}개는 제외했습니다.` : "";
  return `${summary}를 준비했습니다. 대표 분석 자료는 ${primary?.fileName ?? "첫 자료"}입니다. PDF 텍스트와 보조 이미지는 상세페이지 분석에 함께 반영합니다.${skipped}`;
}

export function buildUploadContextGuidance(materials: PdpSourceMaterialDraft[], additionalInfo: string): UploadContextGuidance | null {
  if (!materials.length) {
    return null;
  }

  const normalizedAdditionalInfo = normalizeProductContextText(additionalInfo);
  if (hasUsefulProductContext(normalizedAdditionalInfo)) {
    return {
      tone: "ready",
      title: "추가 정보가 판단에 반영됩니다",
      message: "입력한 상품명/카테고리 정보가 분석과 섹션 확장 보조 판단에 함께 반영됩니다.",
      reason: "additional_info_present"
    };
  }

  const extractedTextLength = materials
    .map((material) => normalizeProductContextText(material.text ?? ""))
    .join(" ")
    .replace(/\s/g, "").length;
  const imageOnlyCount = materials.filter((material) => material.kind === "image" && !material.text?.trim()).length;
  const hasTextContext = extractedTextLength >= 36;
  const hasOnlyImageContext = imageOnlyCount === materials.length;

  if (hasOnlyImageContext || !hasTextContext) {
    return {
      tone: "warning",
      title: "상품 정보를 함께 알려주세요",
      message: PRODUCT_CONTEXT_GUIDANCE_MESSAGE,
      reason: hasOnlyImageContext ? "image_only_context" : "weak_text_context"
    };
  }

  return null;
}

export function normalizeProductContextText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function hasUsefulProductContext(value: string) {
  if (value.length < 4) {
    return false;
  }

  return /[가-힣A-Za-z]/.test(value);
}

export function summarizeSourceMaterialsForUi(materials: PdpSourceMaterialDraft[]) {
  const imageCount = materials.filter((material) => material.kind === "image").length;
  const pdfCount = materials.filter((material) => material.kind === "pdf").length;
  const parts = [
    imageCount ? `이미지 ${imageCount}개` : "",
    pdfCount ? `PDF ${pdfCount}개` : ""
  ].filter(Boolean);

  return parts.join(" · ") || `${materials.length}개 자료`;
}

export function formatSourceMaterialKind(material: PdpSourceMaterialDraft) {
  return material.kind === "pdf" ? "PDF 자료" : "보조 이미지";
}

export function formatSourceMaterialDetail(material: PdpSourceMaterialDraft) {
  if (material.kind === "pdf") {
    const pageLabel = material.pageCount ? `${material.pageCount}p` : "PDF";
    return `${pageLabel} · ${material.analysisPages?.length ?? 0}쪽 이미지 분석${material.text ? " · 텍스트 포함" : ""}${!material.analysisPages?.length ? " · 전체 분석은 PDF 재등록 필요" : ""}`;
  }

  return material.preparedImage
    ? `${formatAnalysisMode(material.preparedImage)} · ${formatOptimizedDimensions(material.preparedImage)}`
    : formatBytes(material.size ?? 0);
}

export type CustomerReviewRow = {
  text: string;
  rating?: number;
};

export const CUSTOMER_REVIEW_ANALYSIS_SAMPLE_SIZE = 250;
export const CUSTOMER_REVIEW_TEXT_HEADER = /(후기|리뷰|상품평|구매평|내용|평가|comment|review|message|opinion|content|body)/i;
export const CUSTOMER_REVIEW_RATING_HEADER = /(평점|별점|점수|rating|score|star)/i;

export function isSupportedCustomerReviewFile(file: File) {
  return /\.(xlsx|csv|tsv|txt)$/i.test(file.name)
    || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || file.type === "text/csv"
    || file.type === "text/tab-separated-values"
    || file.type === "text/plain";
}

export async function extractCustomerReviewRows(file: File): Promise<CustomerReviewRow[]> {
  const name = file.name.toLowerCase();
  const matrix = name.endsWith(".xlsx") || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ? await extractXlsxMatrix(file)
    : parseDelimitedText(await file.text(), name.endsWith(".tsv") ? "\t" : undefined);

  return matrixToCustomerReviewRows(matrix);
}

export async function extractXlsxMatrix(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sharedStrings = await extractXlsxSharedStrings(zip);
  const worksheetPaths = Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  for (const path of worksheetPaths) {
    const xml = await zip.file(path)?.async("text");
    if (!xml) {
      continue;
    }

    const rows = parseXlsxWorksheet(xml, sharedStrings);
    if (rows.some((row) => row.some(Boolean))) {
      return rows;
    }
  }

  return [];
}

export async function extractXlsxSharedStrings(zip: JSZip) {
  const xml = await zip.file("xl/sharedStrings.xml")?.async("text");
  if (!xml) {
    return [];
  }

  const doc = parseXmlDocument(xml);
  return Array.from(doc.getElementsByTagName("si")).map((item) =>
    Array.from(item.getElementsByTagName("t"))
      .map((node) => node.textContent || "")
      .join("")
  );
}

export function parseXlsxWorksheet(xml: string, sharedStrings: string[]) {
  const doc = parseXmlDocument(xml);
  return Array.from(doc.getElementsByTagName("row")).map((row) => {
    const cells: string[] = [];

    Array.from(row.getElementsByTagName("c")).forEach((cell, fallbackIndex) => {
      const cellReference = cell.getAttribute("r") || "";
      const columnName = cellReference.replace(/\d+/g, "");
      const columnIndex = columnName ? getSpreadsheetColumnIndex(columnName) : fallbackIndex;
      const cellType = cell.getAttribute("t") || "";
      const rawValue = cell.getElementsByTagName("v")[0]?.textContent || "";
      let value = rawValue;

      if (cellType === "s") {
        value = sharedStrings[Number(rawValue)] || "";
      } else if (cellType === "inlineStr") {
        value = Array.from(cell.getElementsByTagName("t"))
          .map((node) => node.textContent || "")
          .join("");
      }

      cells[columnIndex] = normalizeReviewCell(value);
    });

    return cells.map((cell) => cell || "");
  });
}

export function parseXmlDocument(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("엑셀 파일 구조를 읽지 못했습니다. 파일을 다시 저장한 뒤 업로드해 주세요.");
  }
  return doc;
}

export function getSpreadsheetColumnIndex(columnName: string) {
  return columnName
    .toUpperCase()
    .split("")
    .reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export function parseDelimitedText(text: string, forcedDelimiter?: string) {
  const delimiter = forcedDelimiter ?? (text.includes("\t") ? "\t" : ",");
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(normalizeReviewCell(currentCell));
      currentCell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(normalizeReviewCell(currentCell));
      if (currentRow.some(Boolean)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(normalizeReviewCell(currentCell));
  if (currentRow.some(Boolean)) {
    rows.push(currentRow);
  }

  return rows;
}

export function matrixToCustomerReviewRows(matrix: string[][]): CustomerReviewRow[] {
  const rows = matrix
    .map((row) => row.map(normalizeReviewCell))
    .filter((row) => row.some(Boolean));
  const headerIndex = rows.findIndex((row) => row.some((cell) => CUSTOMER_REVIEW_TEXT_HEADER.test(cell)));
  const header = headerIndex >= 0 ? rows[headerIndex] : [];
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
  const reviewColumnIndexes = header
    .map((cell, index) => CUSTOMER_REVIEW_TEXT_HEADER.test(cell) ? index : -1)
    .filter((index) => index >= 0);
  const ratingColumnIndexes = header
    .map((cell, index) => CUSTOMER_REVIEW_RATING_HEADER.test(cell) ? index : -1)
    .filter((index) => index >= 0);
  const inferredReviewIndexes = reviewColumnIndexes.length ? reviewColumnIndexes : inferLikelyReviewColumns(dataRows);

  return dataRows
    .map((row) => {
      const textCells = inferredReviewIndexes.length
        ? inferredReviewIndexes.map((index) => row[index]).filter(Boolean)
        : row.filter((cell) => isLikelyReviewText(cell));
      const text = normalizeReviewText(textCells.join(" "));
      const rating = ratingColumnIndexes
        .map((index) => parseReviewRating(row[index]))
        .find((value): value is number => typeof value === "number")
        ?? row.map(parseReviewRating).find((value): value is number => typeof value === "number");

      return { text, rating };
    })
    .filter((row) => row.text.length >= 4);
}

export function inferLikelyReviewColumns(rows: string[][]) {
  const maxColumns = Math.max(0, ...rows.map((row) => row.length));
  const scores = Array.from({ length: maxColumns }, (_, columnIndex) => {
    const cells = rows.map((row) => row[columnIndex] || "").filter(isLikelyReviewText);
    const averageLength = cells.length ? cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length : 0;
    return { columnIndex, score: cells.length * 4 + averageLength };
  });

  return scores
    .filter((item) => item.score > 16)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((item) => item.columnIndex);
}

export function uniqueReviewRows(rows: CustomerReviewRow[]) {
  const seen = new Set<string>();
  const result: CustomerReviewRow[] = [];

  rows.forEach((row) => {
    const text = normalizeReviewText(row.text);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push({ text, rating: row.rating });
  });

  return result;
}

export function sampleCustomerReviewRowsEvenly(rows: CustomerReviewRow[], maxCount: number) {
  if (rows.length <= maxCount) {
    return rows;
  }

  if (maxCount <= 1) {
    return rows.slice(0, Math.max(0, maxCount));
  }

  const result: CustomerReviewRow[] = [];
  const usedIndexes = new Set<number>();
  const maxIndex = rows.length - 1;

  for (let sampleIndex = 0; sampleIndex < maxCount; sampleIndex += 1) {
    const rowIndex = Math.round((sampleIndex * maxIndex) / (maxCount - 1));

    if (usedIndexes.has(rowIndex)) {
      continue;
    }

    usedIndexes.add(rowIndex);
    result.push(rows[rowIndex]);
  }

  return result;
}

export function normalizeReviewCell(value: string | undefined) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeReviewText(value: string) {
  return normalizeReviewCell(value)
    .replace(/^(후기|리뷰|내용|comment|review)\s*[:：-]?\s*/i, "")
    .trim();
}

export function isLikelyReviewText(value: string | undefined) {
  const text = normalizeReviewCell(value);
  return text.length >= 8 && /[가-힣A-Za-z]/.test(text) && !CUSTOMER_REVIEW_TEXT_HEADER.test(text);
}

export function parseReviewRating(value: string | undefined) {
  const text = normalizeReviewCell(value);
  const match = text.match(/([1-5](?:\.\d)?)/);
  if (!match) {
    return undefined;
  }
  const rating = Number(match[1]);
  return rating >= 1 && rating <= 5 ? rating : undefined;
}


export function getFileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "none";
}

export function createDefaultEditorDraftState(result: GeneratedResult, outputMode: PdpOutputMode): PdpEditorDraftState {
  const isHeroOnly = result.blueprint.sections.length === 1;

  return {
    currentSectionIndex: 0,
    sections: result.blueprint.sections.map((section) => ({ ...section })),
    sectionOptions: {},
    overlaysBySection: {},
    defaultCopyLanguage: "ko",
    notice: isHeroOnly
      ? "상품 맞춤 판매 기획에서 구매 질문과 근거를 확인하고 필요한 구간을 선택하세요."
      : outputMode === "full-image"
        ? "통이미지 모드 전체 섹션을 확인하고, 필요한 컷만 이미지 옵션에서 다시 조정할 수 있습니다."
        : "전체 섹션 컷과 기본 텍스트 레이아웃을 확인한 뒤 바로 편집하거나 다운로드할 수 있습니다.",
    workbenchTab: "image",
    workbenchState: {
      x: 756,
      y: 24,
      width: 332,
      height: 500,
      isOpen: true
    }
  };
}

export function clientPreferredProvider(settings: PdpClientSettings): PdpAiProvider {
  if (settings.preferredAiProvider) {
    return settings.preferredAiProvider;
  }

  if (settings.customOpenAiApiKey.trim() && !settings.customGeminiApiKey.trim()) {
    return "openai";
  }

  return "gemini";
}













export function formatDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  if (!minutes) {
    return `${seconds}초`;
  }

  return `${minutes}분 ${String(seconds).padStart(2, "0")}초`;
}

export function buildPreparedImageNotice(fileName: string, image: PreparedImage) {
  const metadata = image.analysisMetadata;

  if (isPdfPreparedImage(image)) {
    return `${fileName} PDF에서 텍스트와 대표 페이지 이미지를 추출했습니다. 다른 이미지/PDF와 함께 상세페이지 분석에 반영할 수 있습니다.`;
  }

  if (metadata?.mode === "long-detail-sampling") {
    return `${fileName} 상세페이지를 분석용으로 ${metadata.sampleCount ?? 0}컷 샘플링했습니다. LLM에는 ${formatDimensions(metadata.optimizedWidth, metadata.optimizedHeight)} / ${formatBytes(metadata.optimizedBytes)}만 전송합니다.`;
  }

  if (metadata?.mode === "standard-resize") {
    return `${fileName} 이미지가 매우 커서 분석용 ${formatDimensions(metadata.optimizedWidth, metadata.optimizedHeight)} / 생성참조 ${formatDimensions(metadata.generationReferenceWidth ?? 0, metadata.generationReferenceHeight ?? 0)}로 정리했습니다.`;
  }

  return `${fileName} 이미지는 원본 품질로 준비했습니다. 초대형 이미지나 긴 상세페이지일 때만 분석용으로 줄입니다.`;
}

export function formatAnalysisMode(image: PreparedImage) {
  const metadata = image.analysisMetadata;

  if (isPdfPreparedImage(image)) {
    return "PDF 대표 화면";
  }

  if (metadata?.mode === "long-detail-sampling") {
    return `장문 샘플 ${metadata.sampleCount ?? 0}컷`;
  }

  if (metadata?.mode === "standard-resize") {
    return "분석용 JPEG";
  }

  return "원본 이미지";
}

export function isLongDetailSampling(image: PreparedImage) {
  return image.analysisMetadata?.mode === "long-detail-sampling";
}

export function isOriginalImage(image: PreparedImage) {
  return image.analysisMetadata?.mode === "original";
}

export function formatOptimizationSavings(image: PreparedImage) {
  const metadata = image.analysisMetadata;

  if (isPdfPreparedImage(image)) {
    return "PDF 텍스트 반영";
  }

  if (!metadata) {
    return "원본 유지";
  }

  if (isOriginalImage(image)) {
    return "원본 유지";
  }

  if (metadata?.mode === "standard-resize") {
    return "분석용 축소";
  }

  if (!metadata?.originalBytes || !metadata.optimizedBytes) {
    return "상세페이지만 절감";
  }

  const ratio = metadata.originalBytes / metadata.optimizedBytes;

  if (ratio < 1.05) {
    return "상세페이지만 절감";
  }

  return `${ratio.toFixed(ratio >= 10 ? 0 : 1)}배 절감`;
}

export function formatGenerationReference(image: PreparedImage) {
  const metadata = image.analysisMetadata;

  if (isPdfPreparedImage(image)) {
    return "PDF 대표 페이지";
  }

  if (metadata?.mode === "long-detail-sampling" && metadata.generationReferenceWidth && metadata.generationReferenceHeight) {
    return `상단 ${formatDimensions(metadata.generationReferenceWidth, metadata.generationReferenceHeight)}`;
  }

  if (metadata?.mode === "standard-resize" && metadata.generationReferenceWidth && metadata.generationReferenceHeight) {
    return formatDimensions(metadata.generationReferenceWidth, metadata.generationReferenceHeight);
  }

  return "원본 이미지";
}

export function formatOptimizedDimensions(image: PreparedImage) {
  const metadata = image.analysisMetadata;

  if (!metadata) {
    return "원본 전송";
  }

  return `${formatDimensions(metadata.optimizedWidth, metadata.optimizedHeight)} · ${formatBytes(metadata.optimizedBytes)}`;
}

export function isPdfPreparedImage(image: PreparedImage) {
  return image.fileName.toLowerCase().endsWith(".pdf");
}

export function formatDimensions(width: number, height: number) {
  return `${Math.max(0, Math.round(width))}x${Math.max(0, Math.round(height))}`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "크기 미상";
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function formatSavedDraftDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "방금";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatCompactFileName(fileName: string, maxBaseLength = 30) {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return fileName;
  }

  const lastDotIndex = trimmed.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < trimmed.length - 1;
  const extension = hasExtension ? trimmed.slice(lastDotIndex) : "";
  const baseName = hasExtension ? trimmed.slice(0, lastDotIndex) : trimmed;

  if (baseName.length <= maxBaseLength) {
    return trimmed;
  }

  const leadingLength = Math.max(14, Math.floor(maxBaseLength * 0.58));
  const trailingLength = Math.max(8, maxBaseLength - leadingLength);
  return `${baseName.slice(0, leadingLength)}…${baseName.slice(-trailingLength)}${extension}`;
}

export function pickGenerationPreferences(settings: PdpClientSettings) {
  return {
    openAiImageModel: settings.openAiImageModel, openAiImageQuality: settings.openAiImageQuality,
    higgsfieldImageModel: settings.higgsfieldImageModel, higgsfieldImageQuality: settings.higgsfieldImageQuality,
    higgsfieldImageResolution: settings.higgsfieldImageResolution, higgsfieldImageVariant: settings.higgsfieldImageVariant
  };
}

