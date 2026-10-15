"use client";

import { buildPdpStoryContext } from "../../lib/shared/pdp-story-context";

import { getPdpSectionReference, runPdpImageQueue, toGenerationSection } from "./pdp-generation";
import { friendlyPdpError } from "./pdp-friendly-error";
import { createPlanningPlaceholder } from "@runacademy/shared";
import type { PdpCopyPlanRequest } from "@runacademy/shared";
import { preparePdpReviewImage } from "./pdp-review-input";
import { getPdpSectionOutputMode, getSellingSectionRatio, getPdpCopyIssues, getPdpImageCopySignature, isPdpImageCopyStale, type PdpCopyPlan, type PdpImageQualityReview, type PdpSourceMaterial } from "@runacademy/shared";
import { PdpRevisionControls, PdpCostPreview } from "./PdpRevisionControls";

import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy as CopyIcon,
  Download,
  Globe2,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Info,
  Lock,
  Menu,
  Palette,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Type,
  User,
  X
} from "lucide-react";
import { Rnd } from "react-rnd";
import type {
  AspectRatio,
  GeneratedResult,
  ImageGenOptions,
  HiggsfieldImagePreferences,
  OpenAiImageModel,
  OpenAiImageQuality,
  OpenAiImagePreferences,
  PdpAiProvider,
  PdpCopyLanguage,
  PdpCustomerReviewAnalysis,
  PdpOutputMode,
  PdpGenerateImageResponse,
  ReferenceModelUsage
} from "@runacademy/shared";
import { DEFAULT_HIGGSFIELD_IMAGE_PREFERENCES, DEFAULT_OPENAI_IMAGE_PREFERENCES, getPdpSectionImageDefaults, normalizePdpReviewBenefitSalesCopyList } from "@runacademy/shared";
import type {
  CanvasLayer,
  FloatingWorkbenchState,
  OverlayTextAlign,
  PdpEditorDraftState,
  PreparedImageDraft,
  ShapeLayer,
  TextOverlay,
  WorkbenchTab
} from "./pdp-drafts";
import { PdpBugReportWidget } from "./PdpBugReportWidget";
import { PdpHiggsfieldImageControls, validateHiggsfieldReferenceCount } from "./PdpHiggsfieldImageControls";
import { PdpOpenAiImageControls } from "./PdpOpenAiImageControls";
import styles from "./pdp-maker.module.css";
import { logPdpUsage } from "./pdp-usage-log";
import { PdpRequestError, apiJson, prepareImageFile, GENERATION_API_TIMEOUT_MS, HIGGSFIELD_GENERATION_API_TIMEOUT_MS, toDataUrl } from "./pdp-utils";
import { toPdpImageSource } from "./pdp-image-source";


// 분할: 컴포넌트 본체와 분리한 타입·상수·순수 함수 (2026-10-15, Claude Code)

export interface PdpEditorProps {
  initialResult: GeneratedResult;
  aspectRatio: AspectRatio;
  aiProvider?: PdpAiProvider;
  higgsfieldPreferences?: HiggsfieldImagePreferences;
  onHiggsfieldImageSettingsChange?: (preferences: HiggsfieldImagePreferences) => void;
  openAiImageModel?: OpenAiImageModel;
  geminiImageModel?: import("@runacademy/shared").GeminiImageModel;
  openAiImageQuality?: OpenAiImageQuality;
  onOpenAiImageSettingsChange?: (preferences: OpenAiImagePreferences) => void;
  outputMode?: PdpOutputMode;
  onOutputModeChange?: (mode: PdpOutputMode) => void;
  geminiApiKey?: string | null;
  openAiApiKey?: string | null;
  desiredTone: string;
  additionalInfo?: string;
  sourceMaterials?: PdpSourceMaterial[];
  primaryAnalysisImage?: { base64: string; mimeType: string };
  onReviewMaterials?: () => void;
  customerReviewAnalysis?: PdpCustomerReviewAnalysis | null;
  initialDraftState?: PdpEditorDraftState | null;
  lastSavedAt?: string | null;
  manualSaveToastToken?: number;
  onOpenSettings?: () => void;
  onReset: () => void;
  onDraftStateChange?: (draftState: PdpEditorDraftState) => void;
  onManualSave?: () => void;
  apiConnectionLabel?: string;
  referenceModelImage?: PreparedImageDraft | null;
  referenceModelUsage?: ReferenceModelUsage | null;
  saveState?: "idle" | "saving" | "saved" | "error";
  /** 상단 '작업' 메뉴 안에 함께 보여줄 요소 (예: 작업 백업·가져오기). */
  menuExtras?: ReactNode;
}

export interface ImageColorRecommendations {
  photoColors: string[];
  recommendedTextColors: string[];
  recommendedShapeColors: string[];
  accentColor: string;
  darkColor: string;
  lightColor: string;
}

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
export const WAITING_PROGRESS_INTERVAL_MS = 650;
export const WAITING_SINGLE_IMAGE_ESTIMATE_MS = 42000;
export const WAITING_BATCH_IMAGE_ESTIMATE_MS = 32000;
export const WAITING_REGENERATION_ESTIMATE_MS = 52000;
export type PdpSection = GeneratedResult["blueprint"]["sections"][number];
export type TextLayoutTemplateKind =
  | "hero"
  | "question"
  | "concernList"
  | "problem"
  | "bridge"
  | "value"
  | "plan"
  | "proof"
  | "compare"
  | "detail"
  | "lifestyle"
  | "composition"
  | "disclosure"
  | "cta"
  | "generic";

export const FONT_OPTIONS = [
  { label: "Pretendard", value: "'Pretendard', sans-serif" },
  { label: "Noto Sans KR", value: "'Noto Sans KR', sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Monospace", value: "monospace" }
];

export const STYLE_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["style"]>; label: string; description: string }> = [
  { value: "studio", label: "스튜디오컷", description: "정제된 배경과 집중도 높은 제품 연출" },
  { value: "lifestyle", label: "라이프스타일컷", description: "실사용 장면과 감정선이 느껴지는 연출" },
  { value: "outdoor", label: "아웃도어컷", description: "씬이 살아있는 외부 공간 연출" }
];

export const MODEL_GENDER_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["modelGender"]>; label: string }> = [
  { value: "female", label: "여자 모델" },
  { value: "male", label: "남자 모델" }
];

export const MODEL_AGE_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["modelAgeRange"]>; label: string }> = [
  { value: "teen", label: "10대 후반" },
  { value: "20s", label: "20대" },
  { value: "30s", label: "30대" },
  { value: "40s", label: "40대" },
  { value: "50s_plus", label: "50대+" }
];

export const MODEL_COUNTRY_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["modelCountry"]>; label: string }> = [
  { value: "korea", label: "한국" },
  { value: "japan", label: "일본" },
  { value: "usa", label: "미국" },
  { value: "france", label: "프랑스" },
  { value: "germany", label: "독일" },
  { value: "africa", label: "아프리카" }
];

export const FONT_WEIGHT_OPTIONS = [
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "700", label: "Bold" },
  { value: "900", label: "Black" }
];

export const ALIGN_OPTIONS: Array<{ value: OverlayTextAlign; label: string; Icon: typeof AlignLeft }> = [
  { value: "left", label: "왼쪽", Icon: AlignLeft },
  { value: "center", label: "가운데", Icon: AlignCenter },
  { value: "right", label: "오른쪽", Icon: AlignRight }
];

export const DEFAULT_COLOR_RECOMMENDATIONS: ImageColorRecommendations = {
  photoColors: ["#e8ddcb", "#102532", "#7a6b5a", "#d5b692"],
  recommendedTextColors: ["#ffffff", "#102532", "#f4efe6", "#4cb7aa"],
  recommendedShapeColors: ["#102532", "#1d3748", "#f4efe6", "#85735e", "#c8474d"],
  accentColor: "#4cb7aa",
  darkColor: "#102532",
  lightColor: "#f4efe6"
};
export const BASIC_SOLID_COLORS = [
  "#ffffff",
  "#f4efe6",
  "#d9d2c3",
  "#c4b8a0",
  "#c8474d",
  "#e05a63",
  "#102532",
  "#1d3748",
  "#4cb7aa",
  "#cf6f52",
  "#d8b65b",
  "#111111"
];
export const APP_TITLE = "한이룸의 상세페이지 마법사 3.1";
export const EDITOR_CANVAS_BASE_WIDTH = 460;
export const EXPORT_CANVAS_WIDTH = 1080;
export const TEXT_LAYOUT_COLORS = {
  ink: "#102532",
  dark: "#0c161e",
  navy: "#1d3748",
  cream: "#f4efe6",
  surface: "#fbfaf6",
  line: "#d9e1de",
  muted: "#5f6b73",
  white: "#ffffff",
  accent: "#4cb7aa",
  blue: "#2f6bff",
  softBlue: "#eaf1ff",
  coral: "#c8474d",
  gold: "#d8b65b"
};

export const MANUAL_SECTION_OPTIONS = [
  {
    id: "hero",
    idToken: "Hero",
    sectionName: "히어로우",
    goal: "상세페이지의 첫인상을 다시 잡고 제품의 핵심 약속을 가장 크게 보여줍니다.",
    description: "첫 화면용 큰 약속과 제품 대표 장면",
    keyMessage: "이 제품을 볼 이유를 첫 3초 안에 만듭니다."
  },
  {
    id: "problem",
    idToken: "Problem",
    sectionName: "문제제기",
    goal: "고객이 이미 느끼는 불편과 망설임을 먼저 꺼내 다음 장면의 설득력을 높입니다.",
    description: "고객 고민, 불편, 구매 전 망설임",
    keyMessage: "고객의 지금 불편을 제품 필요성으로 연결합니다."
  },
  {
    id: "concernList",
    idToken: "ConcernList",
    sectionName: "고객 고민 리스팅",
    goal: "구매 전 고객이 속으로 묻는 고민을 채팅 말풍선처럼 먼저 보여주어 공감과 몰입을 만듭니다.",
    description: "채팅 말풍선형 고객 고민 청취",
    keyMessage: "고객이 망설이는 말을 먼저 들려주고 다음 설득으로 연결합니다."
  },
  {
    id: "value",
    idToken: "Value",
    sectionName: "제품 특장점",
    goal: "제품이 선택받아야 하는 핵심 장점과 차이를 고객 언어로 압축합니다.",
    description: "기능보다 구매 이유가 보이는 장점",
    keyMessage: "기능을 고객이 얻는 변화로 번역합니다."
  },
  {
    id: "review",
    idToken: "Review",
    sectionName: "고객 후기",
    goal: "등록한 실제 후기 원문만 인용하며 별점과 작성자를 임의로 만들지 않습니다.",
    description: "후기 원문 등록 후 인용 카드 구성",
    keyMessage: "고객의 목소리처럼 읽히는 리뷰로 마지막 의심을 낮춥니다."
  }
] as const;

export type ManualSectionOption = (typeof MANUAL_SECTION_OPTIONS)[number];

export function getWaitingEstimateMs(sectionCount: number, isBatch: boolean, isRegeneration: boolean) {
  if (isRegeneration) {
    return WAITING_REGENERATION_ESTIMATE_MS;
  }

  if (isBatch) {
    return Math.min(180000, Math.max(46000, sectionCount * WAITING_BATCH_IMAGE_ESTIMATE_MS));
  }

  return WAITING_SINGLE_IMAGE_ESTIMATE_MS;
}

export function getWaitingProgressPercent(startedAt: number, durationMs: number, generatedSinceStart: number, targetCount: number) {
  const elapsedRatio = Math.min(1, Math.max(0, (Date.now() - startedAt) / durationMs));
  const easedTimeProgress = 8 + (1 - Math.pow(1 - elapsedRatio, 2.4)) * 84;
  const countProgress = targetCount > 1 ? (generatedSinceStart / targetCount) * 92 : 0;

  return Math.round(Math.min(94, Math.max(easedTimeProgress, countProgress)));
}


export function getAllowedWorkbenchTab(tab: WorkbenchTab, isCompleteMode: boolean): WorkbenchTab {
  if (isCompleteMode && (tab === "layer" || tab === "copy")) {
    return "image";
  }

  return tab;
}

export function getWorkbenchTabLabel(tab: WorkbenchTab, isCompleteMode: boolean) {
  if (tab === "image") {
    return isCompleteMode ? "이미지 수정" : "이미지 옵션";
  }

  if (tab === "layer") {
    return "텍스트 편집";
  }

  if (tab === "copy") {
    return "카피 라이브러리";
  }

  return "섹션 가이드";
}

export function buildOverlayShellStyle(overlay: TextOverlay, scale = 1): CSSProperties {
  const padding = getOverlayPadding(overlay.fontSize);
  const normalizedScale = scale > 0 ? scale : 1;

  return {
    position: "relative",
    width: "100%",
    height: "100%",
    padding: `${padding.vertical * normalizedScale}px ${padding.horizontal * normalizedScale}px`
  };
}

export function buildOverlayBackgroundStyle(overlay: TextOverlay, scale = 1): CSSProperties {
  const normalizedScale = scale > 0 ? scale : 1;

  return {
    backgroundColor: toRgba(overlay.backgroundColor, overlay.backgroundOpacity),
    borderRadius: `${overlay.backgroundRadius * normalizedScale}px`
  };
}

export function buildShapeLayerStyle(layer: ShapeLayer, scale = 1): CSSProperties {
  const normalizedScale = scale > 0 ? scale : 1;

  return {
    width: "100%",
    height: "100%",
    backgroundColor: toRgba(layer.fillColor, layer.fillOpacity),
    borderRadius: `${layer.borderRadius * normalizedScale}px`,
    ...(layer.shadowEnabled === false ? { boxShadow: "none", border: "none" } : {})
  };
}

export function shiftIndexedRecordForInsert<T>(record: Record<number, T>, insertIndex: number, insertedValue?: T): Record<number, T> {
  const nextRecord: Record<number, T> = {};

  for (const [key, value] of Object.entries(record)) {
    const index = Number(key);
    if (!Number.isFinite(index)) {
      continue;
    }

    nextRecord[index >= insertIndex ? index + 1 : index] = value;
  }

  if (typeof insertedValue !== "undefined") {
    nextRecord[insertIndex] = insertedValue;
  }

  return nextRecord;
}

export function shiftIndexedRecordForDelete<T>(record: Record<number, T>, deleteIndex: number): Record<number, T> {
  const nextRecord: Record<number, T> = {};

  for (const [key, value] of Object.entries(record)) {
    const index = Number(key);
    if (!Number.isFinite(index) || index === deleteIndex) {
      continue;
    }

    nextRecord[index > deleteIndex ? index - 1 : index] = value;
  }

  return nextRecord;
}

export function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

export function moveIndexedRecordItem<T>(record: Record<number, T>, fromIndex: number, toIndex: number, itemCount: number): Record<number, T> {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= itemCount || toIndex >= itemCount) {
    return record;
  }

  const orderedValues = Array.from({ length: itemCount }, (_, index) => record[index]);
  const [movedValue] = orderedValues.splice(fromIndex, 1);
  orderedValues.splice(toIndex, 0, movedValue);

  return orderedValues.reduce<Record<number, T>>((nextRecord, value, index) => {
    if (typeof value !== "undefined") {
      nextRecord[index] = value;
    }

    return nextRecord;
  }, {});
}

export function getIndexAfterMove(currentIndex: number, fromIndex: number, toIndex: number) {
  if (currentIndex === fromIndex) {
    return toIndex;
  }

  if (fromIndex < toIndex && currentIndex > fromIndex && currentIndex <= toIndex) {
    return currentIndex - 1;
  }

  if (fromIndex > toIndex && currentIndex >= toIndex && currentIndex < fromIndex) {
    return currentIndex + 1;
  }

  return currentIndex;
}

export function cloneCanvasLayer(layer: CanvasLayer): CanvasLayer {
  return normalizeCanvasLayer({
    ...layer,
    id: crypto.randomUUID(),
    x: layer.x + 12,
    y: layer.y + 12
  });
}

export async function buildExportNode(input: {
  imageSrc: string;
  width: number;
  layers: CanvasLayer[];
  originalProduct?: PdpSection["originalProduct"];
  originalImage?: string;
  layerScale?: number;
  reviewEditorialHeight?: number;
}) {
  const image = await loadImage(input.imageSrc);
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.reviewEditorialHeight ? input.reviewEditorialHeight * width / EDITOR_CANVAS_BASE_WIDTH : (image.naturalHeight / Math.max(image.naturalWidth, 1)) * width));
  const layerScale = input.layerScale && input.layerScale > 0 ? input.layerScale : 1;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.background = "transparent";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "-1";

  const imageEl = document.createElement("img");
  imageEl.src = input.imageSrc;
  imageEl.alt = "";
  imageEl.draggable = false;
  imageEl.style.display = "block";
  imageEl.style.width = "100%";
  imageEl.style.height = "100%";
  imageEl.style.objectFit = "cover";
  if (input.reviewEditorialHeight) {
    container.style.background = '#fff';
    const boxWidth = width * 0.46;
    const boxHeight = height * 0.45;
    const fit = Math.min(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight);
    const photoWidth = image.naturalWidth * fit;
    const photoHeight = image.naturalHeight * fit;
    Object.assign(imageEl.style, { position: 'absolute', left: `${width * 0.052 + (boxWidth - photoWidth) / 2}px`, top: `${height * 0.19 + (boxHeight - photoHeight) / 2}px`, width: `${photoWidth}px`, height: `${photoHeight}px`, objectFit: 'fill', borderRadius: `${8 * layerScale}px` });
  }
  container.appendChild(imageEl);

  if (input.originalProduct && input.originalImage) {
    const original = document.createElement("img");
    await loadImage(input.originalImage);
    original.src = input.originalImage; original.alt = "";
    Object.assign(original.style, { position: "absolute", left: `${input.originalProduct.x * layerScale}px`, top: `${input.originalProduct.y * layerScale}px`, width: `${input.originalProduct.width * layerScale}px`, height: `${input.originalProduct.height * layerScale}px`, objectFit: "contain" });
    container.appendChild(original);
  }

  const shapeLayers = input.layers.filter(isShapeLayer);
  const textLayers = input.layers.filter(isTextLayer);

  for (const layer of [...shapeLayers, ...textLayers]) {
    const layerEl = document.createElement("div");
    layerEl.style.position = "absolute";
    layerEl.style.left = `${layer.x * layerScale}px`;
    layerEl.style.top = `${layer.y * layerScale}px`;
    layerEl.style.width = `${toNumericSize(layer.width, width) * layerScale}px`;
    layerEl.style.height = `${toNumericSize(layer.height, height) * layerScale}px`;

    if (isShapeLayer(layer)) {
      const shapeSurface = document.createElement("div");
      shapeSurface.style.width = "100%";
      shapeSurface.style.height = "100%";
      shapeSurface.style.backgroundColor = toRgba(layer.fillColor, layer.fillOpacity);
      shapeSurface.style.borderRadius = `${layer.borderRadius * layerScale}px`;
      shapeSurface.style.border = layer.shadowEnabled === false ? "none" : "1px solid rgba(255, 255, 255, 0.18)";
      shapeSurface.style.boxShadow = layer.shadowEnabled === false ? "none" : "inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 12px 28px rgba(8, 16, 28, 0.18)";
      layerEl.appendChild(shapeSurface);
    } else {
      const shell = document.createElement("div");
      const shellStyle = buildOverlayShellStyle(layer, layerScale);
      applyInlineStyle(shell, shellStyle);
      shell.style.overflow = "visible";

      if (layer.backgroundEnabled) {
        const backdrop = document.createElement("div");
        backdrop.style.position = "absolute";
        backdrop.style.inset = "0";
        const backdropStyle = buildOverlayBackgroundStyle(layer, layerScale);
        applyInlineStyle(backdrop, backdropStyle);
        shell.appendChild(backdrop);
      }

      const textEl = document.createElement("div");
      textEl.textContent = layer.text;
      const textStyle = buildOverlayTextStyle(layer, layerScale);
      applyInlineStyle(textEl, textStyle);
      textEl.style.position = "relative";
      textEl.style.zIndex = "1";
      shell.appendChild(textEl);
      layerEl.appendChild(shell);
    }

    container.appendChild(layerEl);
  }

  return container;
}

export function applyInlineStyle(target: HTMLElement, style: CSSProperties) {
  Object.entries(style).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const cssKey = key.replace(/[A-Z]/g, (segment) => `-${segment.toLowerCase()}`);
    target.style.setProperty(cssKey, String(value));
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function sanitizeSectionFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

export function buildOverlayTextStyle(overlay: TextOverlay, scale = 1): CSSProperties {
  const normalizedScale = scale > 0 ? scale : 1;

  return {
    display: "block",
    width: "100%",
    height: "100%",
    color: overlay.color,
    fontFamily: overlay.fontFamily,
    fontSize: `${overlay.fontSize * normalizedScale}px`,
    fontWeight: overlay.fontWeight,
    lineHeight: overlay.lineHeight,
    textAlign: overlay.textAlign,
    whiteSpace: "pre-wrap",
    wordBreak: "keep-all",
    textShadow: overlay.shadowEnabled
      ? `0px ${overlay.shadowOffsetY * normalizedScale}px ${overlay.shadowBlur * normalizedScale}px ${toRgba(overlay.shadowColor, overlay.shadowOpacity)}`
      : "none"
  };
}

export function normalizeOverlayRecord(record: Record<number, CanvasLayer[]>) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, overlays]) => [
      Number(key),
      (Array.isArray(overlays) ? overlays : []).map((overlay) => normalizeCanvasLayer(overlay))
    ])
  ) as Record<number, CanvasLayer[]>;
}

export function normalizeCanvasLayer(layer: Partial<CanvasLayer> & Pick<CanvasLayer, "id" | "x" | "y" | "width" | "height">) {
  if (layer.kind === "shape") {
    return normalizeShapeLayer(layer as Partial<ShapeLayer> & Pick<ShapeLayer, "id" | "x" | "y" | "width" | "height">);
  }

  return normalizeTextOverlay(
    layer as Partial<TextOverlay> &
      Pick<TextOverlay, "id" | "text" | "x" | "y" | "width" | "height" | "fontSize" | "color" | "fontFamily" | "fontWeight" | "textAlign" | "lineHeight" | "backgroundColor">
  );
}

export function normalizeTextOverlay(overlay: Partial<TextOverlay> & Pick<TextOverlay, "id" | "text" | "x" | "y" | "width" | "height" | "fontSize" | "color" | "fontFamily" | "fontWeight" | "textAlign" | "lineHeight" | "backgroundColor">): TextOverlay {
  const hasLegacyBackground = Boolean(overlay.backgroundColor && overlay.backgroundColor !== "transparent");
  const translations = normalizeOverlayTranslations(overlay.translations, overlay.text);
  const language = overlay.language === "en" ? "en" : "ko";

  return {
    ...overlay,
    kind: "text",
    language,
    text: translations[language] || translations.ko,
    translations,
    color: overlay.color ?? "#ffffff",
    backgroundColor: overlay.backgroundColor === "transparent" ? "#102532" : overlay.backgroundColor,
    backgroundEnabled: overlay.backgroundEnabled ?? hasLegacyBackground,
    backgroundOpacity: overlay.backgroundOpacity ?? 0.72,
    backgroundRadius: overlay.backgroundRadius ?? 18,
    shadowEnabled: overlay.shadowEnabled ?? false,
    shadowColor: overlay.shadowColor ?? "#102532",
    shadowOpacity: overlay.shadowOpacity ?? 0.4,
    shadowBlur: overlay.shadowBlur ?? 18,
    shadowOffsetY: overlay.shadowOffsetY ?? 6
  };
}

export function applyLanguageToTextOverlay(overlay: TextOverlay, nextLanguage: PdpCopyLanguage): TextOverlay {
  const translations = normalizeOverlayTranslations(
    {
      ...overlay.translations,
      [overlay.language]: overlay.text
    },
    overlay.text
  );
  const nextText = translations[nextLanguage] || translations.ko;

  return normalizeTextOverlay({
    ...overlay,
    language: nextLanguage,
    text: nextText,
    translations: {
      ...translations,
      [nextLanguage]: nextText
    }
  });
}

export function normalizeShapeLayer(layer: Partial<ShapeLayer> & Pick<ShapeLayer, "id" | "x" | "y" | "width" | "height">): ShapeLayer {
  return {
    ...layer,
    kind: "shape",
    fillColor: layer.fillColor ?? "#102532",
    fillOpacity: layer.fillOpacity ?? 1,
    borderRadius: layer.borderRadius ?? 0
  };
}

export function getOverlayPadding(fontSize: number) {
  return {
    horizontal: clampValue(Math.round(fontSize * 0.32), 10, 24),
    vertical: clampValue(Math.round(fontSize * 0.18), 8, 18)
  };
}

export function normalizeOverlayTranslations(
  translations: Partial<Record<PdpCopyLanguage, string>> | undefined,
  fallbackText: string
) {
  const ko = translations?.ko?.trim() ? translations.ko : fallbackText;
  const en = translations?.en?.trim() ? translations.en : ko;

  return {
    ko,
    en
  } satisfies Record<PdpCopyLanguage, string>;
}

export function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function toNumericSize(value: number | string, fallback: number) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function estimateOverlayBox(
  text: string,
  options: {
    fontSize: number;
    fontWeight: string;
    fontFamily: string;
    lineHeight: number;
    maxWidth: number;
  }
) {
  const horizontalPadding = 20;
  const verticalPadding = 12;
  const availableLineWidth = Math.max(120, options.maxWidth - horizontalPadding);
  const lines = text.split("\n").map((line) => line.trimEnd());
  const measure = createTextMeasure(options);

  let wrappedLineCount = 0;
  let widestLine = 0;

  lines.forEach((line) => {
    const targetLine = line || " ";
    const measuredWidth = measure(targetLine);
    widestLine = Math.max(widestLine, Math.min(measuredWidth, availableLineWidth));
    wrappedLineCount += Math.max(1, Math.ceil(measuredWidth / availableLineWidth));
  });

  const lineHeightPx = options.fontSize * options.lineHeight;

  return {
    width: Math.round(
      clampValue(
        Math.max(widestLine + horizontalPadding, Math.min(options.maxWidth, Math.max(220, options.fontSize * 8))),
        96,
        options.maxWidth
      )
    ),
    height: Math.round(clampValue(wrappedLineCount * lineHeightPx + verticalPadding, 40, 220))
  };
}

export function createTextMeasure(options: { fontSize: number; fontWeight: string; fontFamily: string }) {
  if (typeof document === "undefined") {
    return (text: string) => Math.max(options.fontSize * 1.6, text.length * options.fontSize * 0.58);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return (text: string) => Math.max(options.fontSize * 1.6, text.length * options.fontSize * 0.58);
  }

  context.font = `${options.fontWeight} ${options.fontSize}px ${options.fontFamily}`;
  return (text: string) => context.measureText(text).width;
}

export async function extractImageColorRecommendations(imageSrc: string): Promise<ImageColorRecommendations> {
  if (typeof document === "undefined") {
    return DEFAULT_COLOR_RECOMMENDATIONS;
  }

  try {
    const image = await loadImage(imageSrc);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return DEFAULT_COLOR_RECOMMENDATIONS;
    }

    const width = 48;
    const height = Math.max(48, Math.round((image.naturalHeight / Math.max(image.naturalWidth, 1)) * 48));
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

    for (let index = 0; index < data.length; index += 16) {
      const alpha = data[index + 3];
      if (alpha < 24) {
        continue;
      }

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
      const current = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      current.count += 1;
      current.r += r;
      current.g += g;
      current.b += b;
      buckets.set(key, current);
    }

    const swatches = Array.from(buckets.values())
      .map((bucket) => ({
        count: bucket.count,
        color: {
          r: Math.round(bucket.r / bucket.count),
          g: Math.round(bucket.g / bucket.count),
          b: Math.round(bucket.b / bucket.count)
        }
      }))
      .sort((left, right) => right.count - left.count);

    if (!swatches.length) {
      return DEFAULT_COLOR_RECOMMENDATIONS;
    }

    const dominant = swatches[0]?.color ?? hexToRgb(DEFAULT_COLOR_RECOMMENDATIONS.darkColor);
    const accent =
      swatches
        .slice(0, 8)
        .sort((left, right) => getSaturation(right.color) - getSaturation(left.color))[0]?.color ?? dominant;
    const dark = swatches.find((swatch) => getRelativeLuminance(swatch.color) < 0.34)?.color ?? darkenRgb(dominant, 0.58);
    const light = swatches.find((swatch) => getRelativeLuminance(swatch.color) > 0.72)?.color ?? lightenRgb(dominant, 0.68);

    const accentHex = rgbToHex(boostColorPresence(accent));
    const darkHex = rgbToHex(darkenRgb(dark, 0.08));
    const lightHex = rgbToHex(lightenRgb(light, 0.04));
    const complementHex = rgbToHex(rotateHue(accent, 180));
    const mutedAccentHex = rgbToHex(mixRgb(accent, dark, 0.36));
    const warmTintHex = rgbToHex(lightenRgb(mixRgb(accent, light, 0.5), 0.12));
    const deepContrastHex = rgbToHex(darkenRgb(mixRgb(dominant, accent, 0.22), 0.22));

    return {
      photoColors: uniqueColors(swatches.slice(0, 6).map((swatch) => rgbToHex(swatch.color))),
      recommendedTextColors: uniqueColors([
        "#ffffff",
        getRelativeLuminance(dominant) < 0.48 ? "#f9f7f1" : "#102532",
        lightHex,
        darkHex,
        accentHex
      ]),
      recommendedShapeColors: uniqueColors([
        darkHex,
        mutedAccentHex,
        rgbToHex(mixRgb(light, dark, 0.2)),
        warmTintHex,
        deepContrastHex,
        complementHex
      ]),
      accentColor: accentHex,
      darkColor: darkHex,
      lightColor: lightHex
    };
  } catch {
    return DEFAULT_COLOR_RECOMMENDATIONS;
  }
}

export function sortColorsByContrast(colors: string[], against: string | null) {
  if (!against) {
    return uniqueColors(colors);
  }

  const target = hexToRgb(against);
  return uniqueColors(colors).sort(
    (left, right) => contrastScore(hexToRgb(right), target) - contrastScore(hexToRgb(left), target)
  );
}

export function uniqueColors(colors: string[]) {
  return Array.from(new Set(colors.map((color) => color.toLowerCase())));
}

export function contrastScore(left: { r: number; g: number; b: number }, right: { r: number; g: number; b: number }) {
  return Math.abs(getRelativeLuminance(left) - getRelativeLuminance(right));
}

export function getRelativeLuminance(color: { r: number; g: number; b: number }) {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getSaturation(color: { r: number; g: number; b: number }) {
  const [r, g, b] = [color.r / 255, color.g / 255, color.b / 255];
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function lightenRgb(color: { r: number; g: number; b: number }, amount: number) {
  return {
    r: Math.round(color.r + (255 - color.r) * amount),
    g: Math.round(color.g + (255 - color.g) * amount),
    b: Math.round(color.b + (255 - color.b) * amount)
  };
}

export function darkenRgb(color: { r: number; g: number; b: number }, amount: number) {
  return {
    r: Math.round(color.r * (1 - amount)),
    g: Math.round(color.g * (1 - amount)),
    b: Math.round(color.b * (1 - amount))
  };
}

export function mixRgb(left: { r: number; g: number; b: number }, right: { r: number; g: number; b: number }, ratio: number) {
  return {
    r: Math.round(left.r * (1 - ratio) + right.r * ratio),
    g: Math.round(left.g * (1 - ratio) + right.g * ratio),
    b: Math.round(left.b * (1 - ratio) + right.b * ratio)
  };
}

export function boostColorPresence(color: { r: number; g: number; b: number }) {
  const saturation = getSaturation(color);
  if (saturation > 0.3) {
    return color;
  }

  const max = Math.max(color.r, color.g, color.b);
  const next = { ...color };
  if (max === color.r) {
    next.r = clampValue(next.r + 28, 0, 255);
  } else if (max === color.g) {
    next.g = clampValue(next.g + 28, 0, 255);
  } else {
    next.b = clampValue(next.b + 28, 0, 255);
  }
  return next;
}

export function rotateHue(color: { r: number; g: number; b: number }, degrees: number) {
  const { h, s, l } = rgbToHsl(color);
  return hslToRgb({
    h: (h + degrees + 360) % 360,
    s,
    l
  });
}

export function rgbToHsl(color: { r: number; g: number; b: number }) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }

  return {
    h: h < 0 ? h + 360 : h,
    s,
    l
  };
}

export function hslToRgb(color: { h: number; s: number; l: number }) {
  const c = (1 - Math.abs(2 * color.l - 1)) * color.s;
  const x = c * (1 - Math.abs(((color.h / 60) % 2) - 1));
  const m = color.l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (color.h < 60) {
    rPrime = c;
    gPrime = x;
  } else if (color.h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (color.h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (color.h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (color.h < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255)
  };
}

export function hexToRgb(value: string) {
  const normalized = value.replace("#", "");
  const hex = normalized.length === 3 ? normalized.split("").map((segment) => `${segment}${segment}`).join("") : normalized;
  const numeric = Number.parseInt(hex, 16);

  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255
  };
}

export function rgbToHex(color: { r: number; g: number; b: number }) {
  return `#${[color.r, color.g, color.b]
    .map((channel) => clampValue(channel, 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function toRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clampValue(alpha, 0, 1)})`;
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 색상을 분석하지 못했습니다."));
    image.src = src;
  });
}

export function formatSavedAt(value: string) {
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

export function anchorWorkbenchToOverlay(
  overlay: CanvasLayer,
  canvasEl: HTMLDivElement | null,
  stageEl: HTMLDivElement | null,
  workbench: FloatingWorkbenchState
) {
  const workbenchWidth = workbench.width;
  const workbenchHeight = workbench.height;
  const gap = 18;
  const stageWidth = stageEl?.clientWidth ?? 1240;
  const stageHeight = stageEl?.clientHeight ?? 720;
  const canvasLeft = canvasEl?.offsetLeft ?? 0;
  const canvasTop = canvasEl?.offsetTop ?? 0;
  const overlayWidth = toNumericSize(overlay.width, 320);

  let x = canvasLeft + overlay.x + overlayWidth + gap;
  if (x + workbenchWidth > stageWidth - 16) {
    x = canvasLeft + overlay.x - workbenchWidth - gap;
  }
  if (x < 12) {
    x = clampValue(canvasLeft + overlay.x + 12, 12, Math.max(12, stageWidth - workbenchWidth - 16));
  }

  const y = clampValue(canvasTop + overlay.y, 12, Math.max(12, stageHeight - workbenchHeight - 16));

  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

export function isTextLayer(layer: CanvasLayer): layer is TextOverlay {
  return layer.kind === "text";
}

export function isShapeLayer(layer: CanvasLayer): layer is ShapeLayer {
  return layer.kind === "shape";
}

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function getWorkbenchPosition(stageEl: HTMLDivElement | null) {
  const width = 332;
  const height = 500;
  const stageWidth = stageEl?.clientWidth ?? 1240;
  const stageHeight = stageEl?.clientHeight ?? 720;

  return {
    x: Math.max(16, stageWidth - width - 20),
    y: 20,
    width,
    height: Math.min(height, Math.max(420, stageHeight - 40)),
    isOpen: true
  };
}

export function clampWorkbenchToStage(workbench: FloatingWorkbenchState, stageEl: HTMLDivElement | null) {
  if (!stageEl) {
    return workbench;
  }

  const maxX = Math.max(16, stageEl.clientWidth - workbench.width - 16);
  const maxY = Math.max(16, stageEl.clientHeight - workbench.height - 16);

  return {
    ...workbench,
    x: clampValue(workbench.x, 16, maxX),
    y: clampValue(workbench.y, 16, maxY)
  };
}

export function normalizeImageOptions(
  options: ImageGenOptions | undefined,
  defaults: Pick<ImageGenOptions, "style" | "withModel" | "guidePriorityMode">
): ImageGenOptions & { guidePriorityMode: NonNullable<ImageGenOptions["guidePriorityMode"]> } {
  return {
    style: options?.style ?? defaults.style ?? "studio",
    withModel: options?.withModel ?? defaults.withModel ?? false,
    aiProvider: options?.aiProvider,
    imageModel: options?.imageModel,
    modelGender: options?.modelGender ?? "female",
    modelAgeRange: options?.modelAgeRange ?? "20s",
    modelCountry: options?.modelCountry ?? "korea",
    guidePriorityMode: options?.guidePriorityMode ?? defaults.guidePriorityMode ?? "guide-first",
    headline: options?.headline,
    subheadline: options?.subheadline,
    isRegeneration: options?.isRegeneration,
    editInstruction: options?.editInstruction,
    preserveConstraints: options?.preserveConstraints,
    baseImageBase64: options?.baseImageBase64,
    referenceModelImageBase64: options?.referenceModelImageBase64,
    referenceModelImageMimeType: options?.referenceModelImageMimeType,
    referenceModelImageFileName: options?.referenceModelImageFileName
  };
}

export function normalizeSectionOptions(
  record: Record<number, ImageGenOptions>,
  referenceModelUsage: ReferenceModelUsage | null
) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {} as Record<number, ImageGenOptions>;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, options]) => [
      Number(key),
      normalizeImageOptions(
        options,
        getPdpSectionImageDefaults(null, Number(key), Object.keys(record).length || 1, referenceModelUsage)
      )
    ])
  ) as Record<number, ImageGenOptions>;
}

export const exampleReviewCopy = {
  headline: '매일 쓰는 물건은, 손이 자주 가야 하니까',
  subheadline: '“처음엔 얼마나 자주 쓸까 싶었는데, 이제는 제 일상에 자연스럽게 자리 잡았어요.”',
  bullets: ['“필요할 때 꺼내 쓰다 보니 어느새 익숙해졌어요.”', '“처음 고를 때보다, 일상에서 쓸 때 더 마음에 들어요.”'],
};

export function buildDefaultTextLayout(
  section: PdpSection,
  sectionIndex: number,
  totalSections: number,
  aspectRatio: AspectRatio,
  language: PdpCopyLanguage
): CanvasLayer[] {
  if (section.section_id.startsWith('review_example_')) {
    const h = getCanvasBaseHeight(aspectRatio);
    const scale = h / 818;
    const text = (ko: string, x: number, y: number, width: number, height: number, fontSize: number, color = '#17212E', weight = '500') => createTemplateTextLayer({ ko, en: ko, x, y: y * scale, width, height: height * scale, fontSize: fontSize * Math.min(1, scale), color, fontWeight: weight, lineHeight: 1.45, shadowEnabled: false }, language);
    const quotes = [section.subheadline, ...(section.bullets || [])].filter(Boolean).slice(0, 4);
    const layers: CanvasLayer[] = [
      text('일상 속 작은 변화', 24, 24, 412, 25, 13, '#4268AC', '700'),
      text(section.headline, 24, 58, 412, 64, 26, '#17212E', '900'),
      text('“', 258, 144, 170, 50, 44, '#4268AC', '900'),
      text(quotes[0] || '', 258, 200, 174, 300, 21, '#17212E', '700'),
      createTemplateShapeLayer({ x: 24, y: h * 0.67, width: 412, height: 1, fillColor: '#DFE4EA', fillOpacity: 1, borderRadius: 0 }),
      text('작성 예시', 24, 777, 412, 23, 11, '#65717F')
    ];
    const remaining = quotes.slice(1);
    remaining.forEach((quote, i) => layers.push(text(quote, 24, 566 + i * (198 / Math.max(1, remaining.length)), 412, 188 / Math.max(1, remaining.length), 17)));
    return layers.map((layer, index) => ({ ...layer, id: `review-editorial-${index}-${layer.id}` }));
  }
  if (section.decisionDesign) return buildDecisionTextLayout(section, aspectRatio, language);
  const template = inferTextLayoutTemplate(section, sectionIndex, totalSections);
  const canvasHeight = getCanvasBaseHeight(aspectRatio);
  const compact = canvasHeight < 430;
  const text = (input: TextLayerInput) => createTemplateTextLayer(input, language);
  const shape = (input: ShapeLayerInput) => createTemplateShapeLayer(input);
  const panelHeight = Math.min(compact ? 174 : 232, Math.max(150, canvasHeight - 58));
  const panelY = bottomY(canvasHeight, panelHeight, compact ? 20 : 36);
  const headline = {
    ko: compactText(section.headline, getDisplaySectionName(section), compact ? 52 : 72),
    en: compactText(section.headline_en, section.headline, compact ? 58 : 78)
  };
  const subheadline = {
    ko: compactText(section.subheadline, getDisplaySectionGoal(section), compact ? 70 : 112),
    en: compactText(section.subheadline_en, section.subheadline, compact ? 78 : 122)
  };
  const bulletCopy = {
    ko: formatTemplateBullets(section.bullets, subheadline.ko, compact ? 2 : 3),
    en: formatTemplateBullets(section.bullets_en, subheadline.en, compact ? 2 : 3)
  };
  const stepCopy = {
    ko: formatTemplateSteps(section.bullets, subheadline.ko),
    en: formatTemplateSteps(section.bullets_en, subheadline.en)
  };
  const listCopy = {
    ko: normalizeTemplateList(section.bullets, subheadline.ko, 3),
    en: normalizeTemplateList(section.bullets_en, subheadline.en, 3)
  };
  const trustLine = {
    ko: compactText(section.trust_or_objection_line, subheadline.ko, compact ? 76 : 118),
    en: compactText(section.trust_or_objection_line_en, section.trust_or_objection_line || subheadline.en, compact ? 84 : 128)
  };
  if (template === "hero") {
    const heroHeight = Math.min(compact ? 188 : 246, Math.max(168, canvasHeight - 46));
    const heroY = bottomY(canvasHeight, heroHeight, compact ? 18 : 32);

    return [
      shape({
        x: 26,
        y: heroY,
        width: 408,
        height: heroHeight,
        fillColor: TEXT_LAYOUT_COLORS.dark,
        fillOpacity: 0.76,
        borderRadius: compact ? 20 : 28
      }),
      text({
        ko: getDisplaySectionName(section),
        en: getDisplaySectionName(section),
        x: 50,
        y: heroY + 24,
        width: 310,
        height: compact ? 24 : 28,
        fontSize: compact ? 11 : 12,
        color: TEXT_LAYOUT_COLORS.accent,
        fontWeight: "900",
        lineHeight: 1.15
      }),
      text({
        ...headline,
        x: 48,
        y: heroY + (compact ? 52 : 62),
        width: 354,
        height: compact ? 74 : 108,
        fontSize: compact ? 29 : 42,
        color: TEXT_LAYOUT_COLORS.white,
        fontWeight: "900",
        lineHeight: 1.04
      }),
      text({
        ...subheadline,
        x: 50,
        y: heroY + (compact ? 126 : 174),
        width: 340,
        height: compact ? 44 : 54,
        fontSize: compact ? 14 : 18,
        color: TEXT_LAYOUT_COLORS.cream,
        fontWeight: "500",
        lineHeight: 1.36
      })
    ];
  }

  if (template === "concernList") {
    const bubbleLimit = compact ? 3 : 5;
    const concernItemsKo = uniqueCopyLines([
      ...(section.bullets ?? []),
      section.trust_or_objection_line,
      subheadline.ko
    ].filter((item): item is string => Boolean(item)))
      .map((item) => compactText(item, "구매 전 고민이 남아요", compact ? 26 : 34))
      .slice(0, bubbleLimit);
    const concernItemsEn = uniqueCopyLines([
      ...(section.bullets_en ?? []),
      section.trust_or_objection_line_en,
      subheadline.en
    ].filter((item): item is string => Boolean(item)))
      .map((item) => compactText(item, "I still have questions before buying", compact ? 30 : 40))
      .slice(0, bubbleLimit);
    const chatItems = concernItemsKo.length
      ? concernItemsKo
      : ["정말 효과가 있을지 모르겠어요", "나에게 맞을지 걱정돼요", "꾸준히 쓸 수 있을까요?"];
    const bubbleHeight = compact ? 40 : 58;
    const bubbleGap = compact ? 10 : 22;
    const totalBubbleHeight = chatItems.length * bubbleHeight + Math.max(0, chatItems.length - 1) * bubbleGap;
    const bubbleStartY = clampValue(
      Math.round(canvasHeight * (compact ? 0.42 : 0.37)),
      compact ? 150 : 270,
      Math.max(compact ? 150 : 270, canvasHeight - totalBubbleHeight - (compact ? 22 : 46))
    );

    return [
      shape({
        x: 0,
        y: 0,
        width: 460,
        height: canvasHeight,
        fillColor: "#080a10",
        fillOpacity: 0.98,
        borderRadius: 0
      }),
      text({
        ko: "고객의 고민을 먼저 듣습니다",
        en: "Listen before selling",
        x: 70,
        y: compact ? 48 : 88,
        width: 320,
        height: compact ? 20 : 24,
        fontSize: compact ? 11 : 14,
        color: TEXT_LAYOUT_COLORS.cream,
        fontWeight: "500",
        textAlign: "center",
        lineHeight: 1.16,
        shadowEnabled: false
      }),
      text({
        ...headline,
        ko: compactText(headline.ko, "왜 망설이세요?", compact ? 30 : 42),
        en: compactText(headline.en, "Why are they hesitating?", compact ? 34 : 46),
        x: 36,
        y: compact ? 74 : 126,
        width: 388,
        height: compact ? 54 : 72,
        fontSize: compact ? 31 : 46,
        color: TEXT_LAYOUT_COLORS.white,
        fontWeight: "900",
        textAlign: "center",
        lineHeight: 1.08
      }),
      text({
        ...subheadline,
        x: 72,
        y: compact ? 126 : 208,
        width: 316,
        height: compact ? 22 : 30,
        fontSize: compact ? 10 : 12,
        color: TEXT_LAYOUT_COLORS.gold,
        fontWeight: "900",
        textAlign: "center",
        lineHeight: 1.16,
        shadowEnabled: false
      }),
      ...chatItems.flatMap((item, index) => {
        const isRight = index % 2 === 1;
        const bubbleWidth = compact ? (isRight ? 318 : 330) : (isRight ? 334 : 360);
        const x = isRight ? 460 - bubbleWidth - (compact ? 20 : 30) : compact ? 20 : 34;
        const y = bubbleStartY + index * (bubbleHeight + bubbleGap);

        return [
          shape({
            x,
            y,
            width: bubbleWidth,
            height: bubbleHeight,
            fillColor: TEXT_LAYOUT_COLORS.white,
            fillOpacity: 0.98,
            borderRadius: 999
          }),
          text({
            ko: item,
            en: concernItemsEn[index] ?? item,
            x: x + (compact ? 18 : 24),
            y: y + (compact ? 10 : 15),
            width: bubbleWidth - (compact ? 36 : 48),
            height: bubbleHeight - (compact ? 14 : 20),
            fontSize: compact ? 12 : 17,
            color: TEXT_LAYOUT_COLORS.ink,
            fontWeight: "800",
            textAlign: "center",
            lineHeight: 1.24,
            shadowEnabled: false
          })
        ];
      })
    ];
  }

  if (template === "problem") {
    const problemHeight = Math.min(compact ? 184 : 294, Math.max(170, canvasHeight - 72));

    return [
      shape({
        x: 24,
        y: 36,
        width: 412,
        height: problemHeight,
        fillColor: TEXT_LAYOUT_COLORS.cream,
        fillOpacity: 0.94,
        borderRadius: 24
      }),
      shape({
        x: 24,
        y: 36,
        width: 9,
        height: problemHeight,
        fillColor: TEXT_LAYOUT_COLORS.coral,
        fillOpacity: 1,
        borderRadius: 8
      }),
      text({
        ko: "구매 전 고민",
        en: "Pain point",
        x: 50,
        y: 58,
        width: 220,
        height: 22,
        fontSize: 12,
        color: TEXT_LAYOUT_COLORS.coral,
        fontWeight: "900",
        lineHeight: 1.1
      }),
      text({
        ...headline,
        x: 48,
        y: compact ? 86 : 90,
        width: 352,
        height: compact ? 62 : 92,
        fontSize: compact ? 25 : 34,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "900",
        lineHeight: 1.08
      }),
      text({
        ko: bulletCopy.ko || trustLine.ko,
        en: bulletCopy.en || trustLine.en,
        x: 52,
        y: compact ? 150 : 198,
        width: 340,
        height: compact ? 58 : 84,
        fontSize: compact ? 13 : 16,
        color: TEXT_LAYOUT_COLORS.navy,
        fontWeight: "600",
        lineHeight: 1.42
      })
    ];
  }

  if (template === "question") {
    const questionPanelHeight = Math.min(compact ? 188 : 270, Math.max(172, canvasHeight - 96));
    const questionPanelY = Math.round((canvasHeight - questionPanelHeight) / 2);
    const questionCopy = {
      ko: formatQuestionCopy(headline.ko),
      en: formatQuestionCopy(headline.en)
    };

    return [
      shape({
        x: 28,
        y: questionPanelY,
        width: 404,
        height: questionPanelHeight,
        fillColor: TEXT_LAYOUT_COLORS.surface,
        fillOpacity: 0.94,
        borderRadius: compact ? 24 : 32
      }),
      shape({
        x: 72,
        y: questionPanelY + 30,
        width: 54,
        height: 6,
        fillColor: TEXT_LAYOUT_COLORS.accent,
        fillOpacity: 1,
        borderRadius: 999
      }),
      text({
        ko: "공감 질문",
        en: "Question",
        x: 70,
        y: questionPanelY + (compact ? 48 : 58),
        width: 190,
        height: 24,
        fontSize: compact ? 11 : 12,
        color: TEXT_LAYOUT_COLORS.accent,
        fontWeight: "900",
        lineHeight: 1.12
      }),
      text({
        ...questionCopy,
        x: 66,
        y: questionPanelY + (compact ? 78 : 94),
        width: 328,
        height: compact ? 80 : 112,
        fontSize: compact ? 27 : 39,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "900",
        textAlign: "center",
        lineHeight: 1.08
      }),
      text({
        ...subheadline,
        x: 72,
        y: questionPanelY + (compact ? 160 : 216),
        width: 316,
        height: compact ? 38 : 42,
        fontSize: compact ? 12 : 15,
        color: TEXT_LAYOUT_COLORS.muted,
        fontWeight: "600",
        textAlign: "center",
        lineHeight: 1.38,
        shadowEnabled: false
      })
    ];
  }

  if (template === "bridge") {
    const bridgeY = bottomY(canvasHeight, compact ? 220 : 322, compact ? 18 : 32);
    const bridgeHeight = Math.min(compact ? 220 : 322, Math.max(190, canvasHeight - 48));

    return [
      shape({
        x: 0,
        y: Math.max(0, bridgeY - 34),
        width: 460,
        height: bridgeHeight + 58,
        fillColor: TEXT_LAYOUT_COLORS.dark,
        fillOpacity: 0.76,
        borderRadius: 0
      }),
      shape({
        x: 32,
        y: bridgeY,
        width: 396,
        height: bridgeHeight,
        fillColor: TEXT_LAYOUT_COLORS.ink,
        fillOpacity: 0.84,
        borderRadius: compact ? 22 : 28
      }),
      text({
        ko: "그래서, 직접 고쳤습니다",
        en: "Built to fix it",
        x: 54,
        y: bridgeY + 26,
        width: 230,
        height: 24,
        fontSize: compact ? 12 : 13,
        color: TEXT_LAYOUT_COLORS.gold,
        fontWeight: "900",
        lineHeight: 1.12
      }),
      text({
        ...headline,
        x: 52,
        y: bridgeY + (compact ? 64 : 78),
        width: 348,
        height: compact ? 76 : 116,
        fontSize: compact ? 28 : 40,
        color: TEXT_LAYOUT_COLORS.white,
        fontWeight: "900",
        lineHeight: 1.06
      }),
      text({
        ...subheadline,
        x: 54,
        y: bridgeY + (compact ? 144 : 210),
        width: 326,
        height: compact ? 48 : 66,
        fontSize: compact ? 13 : 17,
        color: TEXT_LAYOUT_COLORS.cream,
        fontWeight: "500",
        lineHeight: 1.44
      })
    ];
  }

  if (template === "value") {
    const panelTop = compact ? 34 : 54;
    const valuePanelHeight = Math.min(compact ? 190 : 314, Math.max(178, canvasHeight - panelTop - 46));

    return [
      shape({
        x: 32,
        y: panelTop,
        width: 258,
        height: valuePanelHeight,
        fillColor: TEXT_LAYOUT_COLORS.ink,
        fillOpacity: 0.8,
        borderRadius: 24
      }),
      shape({
        x: 306,
        y: compact ? 52 : Math.min(canvasHeight - 210, 118),
        width: 112,
        height: 112,
        fillColor: TEXT_LAYOUT_COLORS.accent,
        fillOpacity: 0.88,
        borderRadius: 56
      }),
      text({
        ko: "핵심 포인트",
        en: "Key point",
        x: 54,
        y: panelTop + 24,
        width: 180,
        height: 22,
        fontSize: 12,
        color: TEXT_LAYOUT_COLORS.accent,
        fontWeight: "900",
        lineHeight: 1.1
      }),
      text({
        ...headline,
        x: 52,
        y: panelTop + (compact ? 52 : 62),
        width: 212,
        height: compact ? 62 : 102,
        fontSize: compact ? 25 : 34,
        color: TEXT_LAYOUT_COLORS.white,
        fontWeight: "900",
        lineHeight: 1.06
      }),
      text({
        ko: bulletCopy.ko || subheadline.ko,
        en: bulletCopy.en || subheadline.en,
        x: 54,
        y: panelTop + (compact ? 120 : 184),
        width: 210,
        height: compact ? 58 : 100,
        fontSize: compact ? 12 : 15,
        color: TEXT_LAYOUT_COLORS.cream,
        fontWeight: "500",
        lineHeight: 1.46
      }),
      text({
        ko: "POINT",
        en: "POINT",
        x: 318,
        y: compact ? 86 : Math.min(canvasHeight - 172, 154),
        width: 88,
        height: 34,
        fontSize: compact ? 16 : 18,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "900",
        textAlign: "center",
        lineHeight: 1.1
      })
    ];
  }

  if (template === "plan") {
    const cardY = bottomY(canvasHeight, compact ? 104 : 150, compact ? 24 : 42);
    const cardHeight = compact ? 92 : 136;
    const cardWidth = 122;

    return [
      text({
        ...headline,
        x: 36,
        y: compact ? 30 : 54,
        width: 376,
        height: compact ? 62 : 92,
        fontSize: compact ? 26 : 36,
        color: TEXT_LAYOUT_COLORS.white,
        fontWeight: "900",
        lineHeight: 1.06
      }),
      text({
        ...subheadline,
        x: 38,
        y: compact ? 98 : 152,
        width: 340,
        height: compact ? 42 : 62,
        fontSize: compact ? 13 : 17,
        color: TEXT_LAYOUT_COLORS.cream,
        fontWeight: "500",
        lineHeight: 1.42
      }),
      ...[0, 1, 2].flatMap((index) => {
        const x = 36 + index * 128;
        const step = splitTemplateSteps(stepCopy.ko, stepCopy.en)[index] ?? splitTemplateSteps(stepCopy.ko, stepCopy.en)[0];
        return [
          shape({
            x,
            y: cardY,
            width: cardWidth,
            height: cardHeight,
            fillColor: index === 1 ? TEXT_LAYOUT_COLORS.accent : TEXT_LAYOUT_COLORS.cream,
            fillOpacity: index === 1 ? 0.9 : 0.92,
            borderRadius: 18
          }),
          text({
            ko: step?.ko ?? `${String(index + 1).padStart(2, "0")} ${subheadline.ko}`,
            en: step?.en ?? `${String(index + 1).padStart(2, "0")} ${subheadline.en}`,
            x: x + 12,
            y: cardY + 14,
            width: cardWidth - 24,
            height: cardHeight - 26,
            fontSize: compact ? 11 : 13,
            color: TEXT_LAYOUT_COLORS.ink,
            fontWeight: "800",
            lineHeight: 1.28
          })
        ];
      })
    ];
  }

  if (template === "proof") {
    const proofHeight = Math.min(compact ? 180 : 250, Math.max(164, canvasHeight - 76));
    const proofY = clampValue(Math.round(canvasHeight * 0.28), 38, Math.max(38, canvasHeight - proofHeight - 32));

    return [
      shape({
        x: 32,
        y: proofY,
        width: 396,
        height: proofHeight,
        fillColor: TEXT_LAYOUT_COLORS.white,
        fillOpacity: 0.92,
        borderRadius: 24
      }),
      text({
        ko: "신뢰 근거",
        en: "Trust proof",
        x: 58,
        y: proofY + 24,
        width: 180,
        height: 22,
        fontSize: 12,
        color: TEXT_LAYOUT_COLORS.accent,
        fontWeight: "900",
        lineHeight: 1.1
      }),
      text({
        ...headline,
        x: 56,
        y: proofY + (compact ? 52 : 58),
        width: 340,
        height: compact ? 58 : 82,
        fontSize: compact ? 24 : 32,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "900",
        lineHeight: 1.08
      }),
      text({
        ko: trustLine.ko || bulletCopy.ko,
        en: trustLine.en || bulletCopy.en,
        x: 58,
        y: proofY + (compact ? 114 : 154),
        width: 326,
        height: compact ? 48 : 66,
        fontSize: compact ? 13 : 16,
        color: TEXT_LAYOUT_COLORS.navy,
        fontWeight: "600",
        lineHeight: 1.42
      })
    ];
  }

  if (template === "compare") {
    const columnY = bottomY(canvasHeight, compact ? 102 : 158, compact ? 22 : 40);
    const columnHeight = compact ? 92 : 144;

    return [
      text({
        ...headline,
        x: 36,
        y: compact ? 34 : 58,
        width: 372,
        height: compact ? 62 : 92,
        fontSize: compact ? 25 : 35,
        color: TEXT_LAYOUT_COLORS.white,
        fontWeight: "900",
        lineHeight: 1.06
      }),
      text({
        ...subheadline,
        x: 38,
        y: compact ? 104 : 158,
        width: 338,
        height: compact ? 38 : 56,
        fontSize: compact ? 13 : 16,
        color: TEXT_LAYOUT_COLORS.cream,
        fontWeight: "500",
        lineHeight: 1.4
      }),
      shape({
        x: 32,
        y: columnY,
        width: 188,
        height: columnHeight,
        fillColor: TEXT_LAYOUT_COLORS.cream,
        fillOpacity: 0.94,
        borderRadius: 20
      }),
      shape({
        x: 240,
        y: columnY,
        width: 188,
        height: columnHeight,
        fillColor: TEXT_LAYOUT_COLORS.accent,
        fillOpacity: 0.9,
        borderRadius: 20
      }),
      text({
        ko: firstTemplateBullet(section.bullets, "비슷한 상품과 헷갈리는 지점"),
        en: firstTemplateBullet(section.bullets_en, "Common alternative"),
        x: 50,
        y: columnY + 18,
        width: 150,
        height: columnHeight - 26,
        fontSize: compact ? 12 : 15,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "800",
        lineHeight: 1.32
      }),
      text({
        ko: firstTemplateBullet(section.bullets.slice(1), "이 제품을 선택할 이유"),
        en: firstTemplateBullet(section.bullets_en.slice(1), "Why this product"),
        x: 258,
        y: columnY + 18,
        width: 150,
        height: columnHeight - 26,
        fontSize: compact ? 12 : 15,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "900",
        lineHeight: 1.32
      })
    ];
  }

  if (template === "detail") {
    const calloutY = bottomY(canvasHeight, compact ? 112 : 168, compact ? 22 : 36);
    const calloutHeight = compact ? 46 : 62;

    return [
      shape({
        x: 24,
        y: compact ? 28 : 46,
        width: 248,
        height: compact ? 168 : 250,
        fillColor: TEXT_LAYOUT_COLORS.white,
        fillOpacity: 0.9,
        borderRadius: compact ? 20 : 26
      }),
      text({
        ko: "디테일",
        en: "Detail",
        x: 48,
        y: compact ? 50 : 72,
        width: 160,
        height: 22,
        fontSize: compact ? 11 : 12,
        color: TEXT_LAYOUT_COLORS.blue,
        fontWeight: "900",
        lineHeight: 1.12
      }),
      text({
        ...headline,
        x: 46,
        y: compact ? 78 : 106,
        width: 206,
        height: compact ? 62 : 92,
        fontSize: compact ? 24 : 32,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "900",
        lineHeight: 1.08
      }),
      text({
        ...subheadline,
        x: 48,
        y: compact ? 142 : 206,
        width: 204,
        height: compact ? 38 : 54,
        fontSize: compact ? 12 : 14,
        color: TEXT_LAYOUT_COLORS.muted,
        fontWeight: "600",
        lineHeight: 1.35,
        shadowEnabled: false
      }),
      ...listCopy.ko.slice(0, compact ? 2 : 3).flatMap((item, index) => {
        const y = calloutY + index * (calloutHeight + (compact ? 8 : 12));
        return [
          shape({
            x: 48,
            y,
            width: 364,
            height: calloutHeight,
            fillColor: index === 0 ? TEXT_LAYOUT_COLORS.softBlue : TEXT_LAYOUT_COLORS.surface,
            fillOpacity: 0.94,
            borderRadius: 16
          }),
          text({
            ko: item,
            en: listCopy.en[index] ?? item,
            x: 68,
            y: y + (compact ? 10 : 14),
            width: 324,
            height: calloutHeight - 16,
            fontSize: compact ? 12 : 15,
            color: TEXT_LAYOUT_COLORS.ink,
            fontWeight: index === 0 ? "900" : "700",
            lineHeight: 1.22,
            shadowEnabled: false
          })
        ];
      })
    ];
  }

  if (template === "lifestyle") {
    const lifestyleY = bottomY(canvasHeight, compact ? 190 : 278, compact ? 18 : 34);

    return [
      shape({
        x: 26,
        y: lifestyleY,
        width: 408,
        height: compact ? 190 : 278,
        fillColor: TEXT_LAYOUT_COLORS.cream,
        fillOpacity: 0.92,
        borderRadius: compact ? 24 : 30
      }),
      text({
        ko: "스타일",
        en: "Lifestyle",
        x: 52,
        y: lifestyleY + 24,
        width: 170,
        height: 22,
        fontSize: compact ? 11 : 12,
        color: TEXT_LAYOUT_COLORS.coral,
        fontWeight: "900",
        lineHeight: 1.12
      }),
      text({
        ...headline,
        x: 50,
        y: lifestyleY + (compact ? 54 : 64),
        width: 338,
        height: compact ? 72 : 104,
        fontSize: compact ? 28 : 38,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "900",
        lineHeight: 1.08
      }),
      text({
        ...subheadline,
        x: 52,
        y: lifestyleY + (compact ? 132 : 184),
        width: 316,
        height: compact ? 46 : 58,
        fontSize: compact ? 13 : 16,
        color: TEXT_LAYOUT_COLORS.navy,
        fontWeight: "600",
        lineHeight: 1.42,
        shadowEnabled: false
      }),
      text({
        ko: trustLine.ko,
        en: trustLine.en,
        x: 52,
        y: lifestyleY + (compact ? 172 : 244),
        width: 310,
        height: compact ? 24 : 28,
        fontSize: compact ? 10 : 12,
        color: TEXT_LAYOUT_COLORS.muted,
        fontWeight: "600",
        lineHeight: 1.2,
        shadowEnabled: false
      })
    ];
  }

  if (template === "composition") {
    const cardTop = compact ? 118 : 188;
    const rowHeight = compact ? 48 : 62;

    return [
      shape({
        x: 28,
        y: 34,
        width: 404,
        height: Math.min(canvasHeight - 68, compact ? 256 : 420),
        fillColor: TEXT_LAYOUT_COLORS.white,
        fillOpacity: 0.93,
        borderRadius: compact ? 22 : 28
      }),
      text({
        ko: "제품 구성",
        en: "Configuration",
        x: 52,
        y: compact ? 56 : 68,
        width: 180,
        height: 22,
        fontSize: compact ? 11 : 12,
        color: TEXT_LAYOUT_COLORS.blue,
        fontWeight: "900",
        lineHeight: 1.12
      }),
      text({
        ...headline,
        x: 50,
        y: compact ? 84 : 104,
        width: 340,
        height: compact ? 54 : 78,
        fontSize: compact ? 24 : 32,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "900",
        lineHeight: 1.08,
        shadowEnabled: false
      }),
      ...listCopy.ko.map((item, index) => {
        const y = cardTop + index * (rowHeight + (compact ? 10 : 14));
        return [
          shape({
            x: 52,
            y,
            width: 356,
            height: rowHeight,
            fillColor: index === 0 ? TEXT_LAYOUT_COLORS.softBlue : TEXT_LAYOUT_COLORS.surface,
            fillOpacity: 1,
            borderRadius: 16
          }),
          text({
            ko: item,
            en: listCopy.en[index] ?? item,
            x: 72,
            y: y + (compact ? 13 : 16),
            width: 308,
            height: rowHeight - 18,
            fontSize: compact ? 12 : 15,
            color: TEXT_LAYOUT_COLORS.ink,
            fontWeight: "800",
            lineHeight: 1.2,
            shadowEnabled: false
          })
        ];
      }).flat()
    ];
  }

  if (template === "disclosure") {
    const tableTop = compact ? 116 : 184;
    const rowHeight = compact ? 42 : 58;
    const rows = [
      { ko: "구매 전 확인", en: "Before buying", valueKo: firstTemplateBullet(section.bullets, trustLine.ko), valueEn: firstTemplateBullet(section.bullets_en, trustLine.en) },
      { ko: "구성/주의", en: "Composition", valueKo: listCopy.ko[1] ?? subheadline.ko, valueEn: listCopy.en[1] ?? subheadline.en },
      { ko: "안내", en: "Notice", valueKo: trustLine.ko, valueEn: trustLine.en }
    ];

    return [
      shape({
        x: 24,
        y: 36,
        width: 412,
        height: Math.min(canvasHeight - 72, compact ? 250 : 382),
        fillColor: TEXT_LAYOUT_COLORS.surface,
        fillOpacity: 0.96,
        borderRadius: compact ? 22 : 28
      }),
      text({
        ko: "상품정보 확인",
        en: "Product notice",
        x: 48,
        y: compact ? 58 : 70,
        width: 200,
        height: 22,
        fontSize: compact ? 11 : 12,
        color: TEXT_LAYOUT_COLORS.blue,
        fontWeight: "900",
        lineHeight: 1.12
      }),
      text({
        ...headline,
        x: 46,
        y: compact ? 84 : 104,
        width: 342,
        height: compact ? 52 : 72,
        fontSize: compact ? 23 : 30,
        color: TEXT_LAYOUT_COLORS.ink,
        fontWeight: "900",
        lineHeight: 1.1,
        shadowEnabled: false
      }),
      ...rows.flatMap((row, index) => {
        const y = tableTop + index * rowHeight;
        return [
          shape({
            x: 48,
            y,
            width: 114,
            height: rowHeight,
            fillColor: TEXT_LAYOUT_COLORS.ink,
            fillOpacity: 0.9,
            borderRadius: index === 0 ? 14 : 8
          }),
          shape({
            x: 162,
            y,
            width: 250,
            height: rowHeight,
            fillColor: TEXT_LAYOUT_COLORS.white,
            fillOpacity: 0.92,
            borderRadius: index === 0 ? 14 : 8
          }),
          text({
            ko: row.ko,
            en: row.en,
            x: 60,
            y: y + (compact ? 11 : 15),
            width: 90,
            height: rowHeight - 16,
            fontSize: compact ? 10 : 12,
            color: TEXT_LAYOUT_COLORS.white,
            fontWeight: "900",
            lineHeight: 1.15,
            shadowEnabled: false
          }),
          text({
            ko: row.valueKo,
            en: row.valueEn,
            x: 180,
            y: y + (compact ? 9 : 13),
            width: 210,
            height: rowHeight - 14,
            fontSize: compact ? 10 : 13,
            color: TEXT_LAYOUT_COLORS.ink,
            fontWeight: "700",
            lineHeight: 1.22,
            shadowEnabled: false
          })
        ];
      })
    ];
  }

  if (template === "cta") {
    return [
      shape({
        x: 24,
        y: panelY,
        width: 412,
        height: panelHeight,
        fillColor: TEXT_LAYOUT_COLORS.dark,
        fillOpacity: 0.82,
        borderRadius: compact ? 22 : 30
      }),
      text({
        ko: "마지막 제안",
        en: "Final offer",
        x: 50,
        y: panelY + 24,
        width: 200,
        height: 22,
        fontSize: 12,
        color: TEXT_LAYOUT_COLORS.gold,
        fontWeight: "900",
        lineHeight: 1.1
      }),
      text({
        ...headline,
        x: 48,
        y: panelY + (compact ? 54 : 66),
        width: 354,
        height: compact ? 62 : 94,
        fontSize: compact ? 26 : 36,
        color: TEXT_LAYOUT_COLORS.white,
        fontWeight: "900",
        lineHeight: 1.06
      }),
      text({
        ...subheadline,
        x: 50,
        y: panelY + (compact ? 122 : 168),
        width: 328,
        height: compact ? 38 : 50,
        fontSize: compact ? 13 : 16,
        color: TEXT_LAYOUT_COLORS.cream,
        fontWeight: "500",
        lineHeight: 1.38
      })
    ];
  }

  return [
    shape({
      x: 28,
      y: panelY,
      width: 404,
      height: panelHeight,
      fillColor: TEXT_LAYOUT_COLORS.ink,
      fillOpacity: 0.74,
      borderRadius: 24
    }),
    text({
      ko: getDisplaySectionName(section),
      en: getDisplaySectionName(section),
      x: 52,
      y: panelY + 24,
      width: 220,
      height: 22,
      fontSize: 12,
      color: TEXT_LAYOUT_COLORS.accent,
      fontWeight: "900",
      lineHeight: 1.1
    }),
    text({
      ...headline,
      x: 50,
      y: panelY + (compact ? 54 : 64),
      width: 350,
      height: compact ? 62 : 92,
      fontSize: compact ? 25 : 34,
      color: TEXT_LAYOUT_COLORS.white,
      fontWeight: "900",
      lineHeight: 1.08
    }),
    text({
      ko: bulletCopy.ko || subheadline.ko,
      en: bulletCopy.en || subheadline.en,
      x: 52,
      y: panelY + (compact ? 122 : 170),
      width: 328,
      height: compact ? 44 : 60,
      fontSize: compact ? 13 : 16,
      color: TEXT_LAYOUT_COLORS.cream,
      fontWeight: "500",
      lineHeight: 1.42
    })
  ];
}

export interface TextLayerInput {
  ko: string;
  en: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  fontSize: number;
  color: string;
  fontWeight: string;
  lineHeight: number;
  textAlign?: OverlayTextAlign;
  backgroundEnabled?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  backgroundRadius?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowBlur?: number;
  shadowOffsetY?: number;
}

export interface ShapeLayerInput {
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  fillOpacity: number;
  borderRadius: number;
}

export function createTemplateTextLayer(input: TextLayerInput, language: PdpCopyLanguage): TextOverlay {
  const translations = {
    ko: input.ko || input.en,
    en: input.en || input.ko
  };
  const displayText = translations[language] || translations.ko;
  const height =
    input.height ??
    estimateOverlayBox(displayText, {
      fontSize: input.fontSize,
      fontWeight: input.fontWeight,
      fontFamily: "'Pretendard', sans-serif",
      lineHeight: input.lineHeight,
      maxWidth: input.width
    }).height;

  return normalizeTextOverlay({
    id: createCanvasLayerId("text-template"),
    kind: "text",
    text: displayText,
    language,
    translations,
    x: input.x,
    y: input.y,
    width: input.width,
    height,
    fontSize: input.fontSize,
    color: input.color,
    backgroundColor: input.backgroundColor ?? TEXT_LAYOUT_COLORS.ink,
    backgroundEnabled: input.backgroundEnabled ?? false,
    backgroundOpacity: input.backgroundOpacity ?? 0.72,
    backgroundRadius: input.backgroundRadius ?? 18,
    fontFamily: "'Pretendard', sans-serif",
    fontWeight: input.fontWeight,
    textAlign: input.textAlign ?? "left",
    lineHeight: input.lineHeight,
    shadowEnabled: input.shadowEnabled ?? true,
    shadowColor: input.shadowColor ?? TEXT_LAYOUT_COLORS.dark,
    shadowOpacity: input.shadowOpacity ?? 0.36,
    shadowBlur: input.shadowBlur ?? 14,
    shadowOffsetY: input.shadowOffsetY ?? 5
  });
}

export function createTemplateShapeLayer(input: ShapeLayerInput): ShapeLayer {
  return normalizeShapeLayer({
    id: createCanvasLayerId("shape-template"),
    kind: "shape",
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    fillColor: input.fillColor,
    fillOpacity: input.fillOpacity,
    borderRadius: input.borderRadius
  });
}

export function buildDecisionTextLayout(section: PdpSection, aspectRatio: AspectRatio, language: PdpCopyLanguage): CanvasLayer[] {
  const format = section.decisionDesign!.visual;
  const height = getCanvasBaseHeight(aspectRatio);
  const compact = height < 430;
  const visualTop = format === 'lifestyle' || format === 'detail' || format === 'scale';
  const fontSize = compact ? 23 : 30;
  const width = 372;
  const lines = (value: string, size: number) => Math.max(1, Math.ceil(Array.from(value).reduce((n,c)=>n+(/[\u3000-\uffff]/.test(c)?1:.58),0) / (width/size)));
  const head = language === 'en' ? section.headline_en || section.headline : section.headline;
  const sub = language === 'en' ? section.subheadline_en || section.subheadline : section.subheadline;
  const bullets = language === 'en' ? section.bullets_en : section.bullets;
  const headHeight = lines(head,fontSize)*fontSize*1.25;
  const subSize = compact ? 13 : 16;
  const subHeight = sub ? lines(sub,subSize)*subSize*1.5 : 0;
  const body = bullets.map((b,i)=>format === 'steps' ? `${i+1}. ${b}` : b).join('\n');
  const bodyHeight = bullets.reduce((n,b)=>n+lines(b,subSize)*subSize*1.5+6,0);
  const panelHeight = headHeight+subHeight+bodyHeight+60;
  const y = visualTop ? Math.max(18,height-panelHeight-18) : 18;
  const items: CanvasLayer[] = [{...createTemplateShapeLayer({x:22,y,width:416,height:panelHeight,fillColor:'#ffffff',fillOpacity:.97,borderRadius:0}),shadowEnabled:false}];
  items.push(createTemplateTextLayer({ ko: section.headline, en:section.headline_en||section.headline, x:44,y:y+20,width,height:headHeight,fontSize,color:'#193c30',fontWeight:'800',lineHeight:1.25,shadowEnabled:false},language));
  if(sub) items.push(createTemplateTextLayer({ko:section.subheadline,en:section.subheadline_en||section.subheadline,x:44,y:y+24+headHeight,width,height:subHeight,fontSize:subSize,color:'#40584b',fontWeight:'500',lineHeight:1.5,shadowEnabled:false},language));
  if(body) items.push(createTemplateTextLayer({ko:section.bullets.map((b,i)=>format==='steps'?`${i+1}. ${b}`:b).join('\n'),en:(section.bullets_en.length?section.bullets_en:section.bullets).map((b,i)=>format==='steps'?`${i+1}. ${b}`:b).join('\n'),x:44,y:y+34+headHeight+subHeight,width,height:bodyHeight,fontSize:subSize,color:'#193c30',fontWeight:'600',lineHeight:1.5,shadowEnabled:false},language));
  return items;
}

export function inferTextLayoutTemplate(section: PdpSection, sectionIndex: number, totalSections: number): TextLayoutTemplateKind {
  const roleText = [
    section.section_id,
    section.section_name,
    section.purpose
  ].join(" ").toLowerCase();
  const haystack = [
    section.section_id,
    section.section_name,
    section.goal,
    section.purpose,
    section.headline,
    section.subheadline,
    section.layout_notes
  ].join(" ").toLowerCase();

  if (sectionIndex === 0 || /hero|히어로|첫\s*화면|메인/.test(haystack)) {
    return "hero";
  }
  if (/concern\s*list|customer\s*concern|chat|bubble|고객\s*고민\s*리스팅|고민\s*리스팅|채팅|말풍선|망설임\s*리스트/.test(roleText)) {
    return "concernList";
  }
  if (/question|공감\s*질문|상황\s*질문|질문|적\s*없으|나요|까요/.test(roleText)) {
    return "question";
  }
  if (/bridge|전환|선언|직접\s*고쳤|개선\s*선언|해결\s*흐름/.test(roleText)) {
    return "bridge";
  }
  if (/compare|comparison|vs|비교|경쟁|대안|차이/.test(roleText)) {
    return "compare";
  }
  if (/disclosure|spec|고시|상품정보|주의|faq|보증/.test(roleText)) {
    return "disclosure";
  }
  if (/composition|configuration|구성|구성품|세트|컬러|색상|사이즈/.test(roleText)) {
    return "composition";
  }
  if (/detail|디테일|소재|마감|원단|클로즈|부위/.test(roleText)) {
    return "detail";
  }
  if (/success|lifestyle|스타일|라이프|사용\s*후|사용\s*장면|기대\s*장면|생활|착용\s*장면|변화|달라/.test(roleText)) {
    return "lifestyle";
  }
  if (/proof|evidence|trust|review|신뢰|근거|후기|리뷰|인증/.test(roleText)) {
    return "proof";
  }
  if (/failure|loss|problem|concern|objection|pain|고민|문제|불편|저항|불안|장벽|손실|놓쳤|후회|미루/.test(roleText)) {
    return "problem";
  }
  if (/plan|routine|use|situation|사용|루틴|방법|계획|상황|순서/.test(roleText)) {
    return "plan";
  }
  if (/guide|value|feature|benefit|point|detail|why|핵심|장점|기능|디테일|선택|이유|가이드|제품\s*소개|해결책/.test(roleText)) {
    return "value";
  }
  if (/cta|action|offer|구매\s*제안|마무리|행동\s*유도|오퍼|마지막|확신/.test(roleText)) {
    return "cta";
  }
  if (/concern\s*list|customer\s*concern|chat|bubble|고객\s*고민\s*리스팅|고민\s*리스팅|채팅|말풍선|망설임\s*리스트/.test(haystack)) {
    return "concernList";
  }
  if (/question|공감\s*질문|상황\s*질문|질문|적\s*없으|나요|까요/.test(haystack)) {
    return "question";
  }
  if (/bridge|전환|선언|직접\s*고쳤|개선\s*선언|해결\s*흐름/.test(haystack)) {
    return "bridge";
  }
  if (/compare|comparison|vs|비교|경쟁|대안|차이/.test(haystack)) {
    return "compare";
  }
  if (/disclosure|spec|고시|상품정보|주의|faq|보증/.test(haystack)) {
    return "disclosure";
  }
  if (/composition|configuration|구성|구성품|세트|컬러|색상|사이즈/.test(haystack)) {
    return "composition";
  }
  if (/detail|디테일|소재|마감|원단|클로즈|부위/.test(haystack)) {
    return "detail";
  }
  if (/success|lifestyle|스타일|라이프|사용\s*후|사용\s*장면|기대\s*장면|생활|착용\s*장면|변화|달라/.test(haystack)) {
    return "lifestyle";
  }
  if (/guide|value|feature|benefit|point|detail|why|핵심|장점|기능|디테일|선택|이유|가이드|제품\s*소개|해결책/.test(haystack)) {
    return "value";
  }
  if (/proof|evidence|trust|review|신뢰|근거|후기|리뷰|인증/.test(haystack)) {
    return "proof";
  }
  if (/failure|loss|problem|concern|objection|pain|고민|문제|불편|저항|불안|장벽|손실|놓쳤|후회|미루/.test(haystack)) {
    return "problem";
  }
  if (/plan|routine|use|situation|사용|루틴|방법|계획|상황|순서/.test(haystack)) {
    return "plan";
  }
  if (/cta|action|offer|구매\s*제안|마무리|행동\s*유도|오퍼|마지막|확신/.test(haystack) || sectionIndex === totalSections - 1) {
    return "cta";
  }

  return "generic";
}

export function getTextLayoutTemplateLabel(template: TextLayoutTemplateKind) {
  const labels: Record<TextLayoutTemplateKind, string> = {
    hero: "히어로우",
    question: "공감 질문",
    concernList: "고객 고민 리스팅",
    problem: "문제 공감",
    bridge: "전환 선언",
    value: "핵심 포인트",
    plan: "사용 흐름",
    proof: "신뢰 근거",
    compare: "비교/근거",
    detail: "디테일",
    lifestyle: "사용 장면",
    composition: "제품 구성",
    disclosure: "상품정보 확인",
    cta: "마지막 제안",
    generic: "기본 상세페이지"
  };

  return labels[template];
}

export function hasOverlayEntry(record: Record<number, CanvasLayer[]>, index: number) {
  return Object.prototype.hasOwnProperty.call(record, index);
}

export function refreshLegacyTemplateLayouts(
  record: Record<number, CanvasLayer[]>,
  sections: PdpSection[],
  aspectRatio: AspectRatio,
  language: PdpCopyLanguage
) {
  let didRefresh = false;
  const nextRecord: Record<number, CanvasLayer[]> = { ...record };

  sections.forEach((section, index) => {
    const layers = record[index];
    if (!section.generatedImage || !shouldRefreshLegacyTemplateLayout(layers, section, index, sections.length)) {
      return;
    }

    nextRecord[index] = buildDefaultTextLayout(section, index, sections.length, getSellingSectionRatio(section, aspectRatio), language);
    didRefresh = true;
  });

  return didRefresh ? nextRecord : record;
}

export function shouldRefreshLegacyTemplateLayout(
  layers: CanvasLayer[] | undefined,
  section: PdpSection,
  sectionIndex: number,
  totalSections: number
) {
  if (section.decisionDesign || !Array.isArray(layers) || layers.length === 0) {
    return false;
  }

  const expectedTemplate = inferTextLayoutTemplate(section, sectionIndex, totalSections);
  const shapes = layers.filter(isShapeLayer);
  const textLabels = layers.filter(isTextLayer).map((layer) => layer.text).join(" ");
  const hasNewHeroScrim = shapes.some(
    (layer) => layer.x === 0 && toNumericSize(layer.width, 0) === EDITOR_CANVAS_BASE_WIDTH
  );
  const hasNarrowProblemCard = shapes.some(
    (layer) => layer.x === 26 && (toNumericSize(layer.width, 0) === 292 || toNumericSize(layer.width, 0) === 304)
  );
  const hasReducedValueCard =
    expectedTemplate === "value" &&
    shapes.length === 1 &&
    shapes.some((layer) => layer.x === 32 && toNumericSize(layer.width, 0) === 258);
  const lastSectionUsesWrongTemplate =
    expectedTemplate === "cta" && /구매 전 고민|Pain point|핵심 포인트|Key point|DETAIL|원본 기준/.test(textLabels);

  return hasNewHeroScrim || hasNarrowProblemCard || hasReducedValueCard || lastSectionUsesWrongTemplate;
}

export function getCanvasBaseHeight(aspectRatio: AspectRatio) {
  const [rawWidth, rawHeight] = aspectRatio.split(":").map((value) => Number(value));
  const ratioWidth = rawWidth || 9;
  const ratioHeight = rawHeight || 16;
  return Math.round((EDITOR_CANVAS_BASE_WIDTH * ratioHeight) / ratioWidth);
}

export function bottomY(canvasHeight: number, elementHeight: number, margin: number) {
  return Math.max(18, canvasHeight - elementHeight - margin);
}

export function compactText(value: string | undefined, fallback: string, maxLength: number) {
  const normalized = String(value || fallback || "")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}|…/g, "")
    .trim();

  if (!normalized) {
    return fallback;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const clipped = normalized.slice(0, maxLength).trim();
  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.6)) {
    return clipped.slice(0, lastSpace).trim();
  }

  return clipped;
}

export function formatTemplateBullets(values: string[] | undefined, fallback: string, limit: number) {
  const items = normalizeTemplateList(values, fallback, limit);
  return items.map((item) => `• ${item}`).join("\n");
}

export function formatTemplateSteps(values: string[] | undefined, fallback: string) {
  const items = normalizeTemplateList(values, fallback, 3);
  return items.map((item, index) => `${String(index + 1).padStart(2, "0")} ${item}`).join("\n");
}

export function splitTemplateSteps(koText: string, enText: string) {
  const koItems = koText.split("\n").filter(Boolean);
  const enItems = enText.split("\n").filter(Boolean);

  return koItems.map((ko, index) => ({
    ko,
    en: enItems[index] ?? ko
  }));
}

export function firstTemplateBullet(values: string[] | undefined, fallback: string) {
  return normalizeTemplateList(values, fallback, 1)[0] ?? fallback;
}

export function formatQuestionCopy(value: string) {
  const compact = compactText(value, "이런 적 없으세요?", 54).replace(/[.!。！]+$/g, "").trim();
  if (/[?？]$/.test(compact) || /(?:나요|세요|까요|습니까)$/.test(compact)) {
    return compact;
  }

  return `${compact}?`;
}

export function normalizeTemplateList(values: string[] | undefined, fallback: string, limit: number) {
  const items = (Array.isArray(values) ? values : [])
    .map((value) => compactText(value, "", 38))
    .filter(Boolean);

  if (!items.length) {
    return [compactText(fallback, "핵심 메시지를 입력하세요", 42)];
  }

  return items.slice(0, limit);
}

export function createCanvasLayerId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function uniqueCopyLines(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

export function normalizeSectionCopyFields(section: PdpSection): PdpSection {
  return { ...section, headline_en: section.headline_en || section.headline,
    subheadline_en: section.subheadline_en || section.subheadline,
    bullets: Array.isArray(section.bullets) ? section.bullets : [],
    bullets_en: section.bullets_en?.length ? section.bullets_en : section.bullets,
    trust_or_objection_line_en: section.trust_or_objection_line_en || section.trust_or_objection_line,
    CTA_en: section.CTA_en || section.CTA };
}

export function getLocalizedCopy(korean: string, english: string | undefined, language: PdpCopyLanguage) {
  if (language === "en") {
    return english?.trim() || korean;
  }

  return korean;
}

export function getLocalizedBullets(section: GeneratedResult["blueprint"]["sections"][number], language: PdpCopyLanguage) {
  if (language === "en" && Array.isArray(section.bullets_en) && section.bullets_en.length) {
    return section.bullets_en;
  }

  return section.bullets;
}

export function getDisplaySectionName(section: GeneratedResult["blueprint"]["sections"][number]) {
  if (containsHangul(section.section_name)) {
    return section.section_name;
  }

  const normalized = section.section_name.replace(/^S\d+[_-]?/i, "");
  const tokens = normalized.split(/[_-]+/).filter(Boolean);

  if (!tokens.length) {
    return section.section_name;
  }

  const mappedTokens = tokens.map((token) => translateSectionToken(token));

  if (mappedTokens.length >= 2 && mappedTokens[0] === "핵심 장점" && /^\d+$/.test(tokens[1] ?? "")) {
    const descriptor = mappedTokens.slice(2).join(" ");
    return descriptor ? `핵심 장점 ${tokens[1]} · ${descriptor}` : `핵심 장점 ${tokens[1]}`;
  }

  return mappedTokens.join(" ");
}

export function getDisplaySectionGoal(section: GeneratedResult["blueprint"]["sections"][number]) {
  if (containsHangul(section.goal)) {
    return section.goal;
  }

  if (containsHangul(section.headline)) {
    return section.headline;
  }

  if (containsHangul(section.subheadline)) {
    return section.subheadline;
  }

  return section.goal;
}

export function getModelGenderLabel(gender?: ImageGenOptions["modelGender"]) {
  return gender === "male" ? "남자 모델" : "여자 모델";
}

export function getModelAgeLabel(ageRange?: ImageGenOptions["modelAgeRange"]) {
  if (ageRange === "teen") {
    return "10대 후반";
  }
  if (ageRange === "30s") {
    return "30대";
  }
  if (ageRange === "40s") {
    return "40대";
  }
  if (ageRange === "50s_plus") {
    return "50대+";
  }

  return "20대";
}

export function getModelCountryLabel(country?: ImageGenOptions["modelCountry"]) {
  if (country === "japan") {
    return "일본";
  }
  if (country === "usa") {
    return "미국";
  }
  if (country === "france") {
    return "프랑스";
  }
  if (country === "germany") {
    return "독일";
  }
  if (country === "africa") {
    return "아프리카";
  }

  return "한국";
}

export function containsHangul(value: string) {
  return /[가-힣]/.test(value);
}

export function translateSectionToken(token: string) {
  const normalized = token.trim().toLowerCase();

  if (normalized === "hero") {
    return "히어로";
  }
  if (normalized === "question") {
    return "공감 질문";
  }
  if (normalized === "bridge") {
    return "전환 선언";
  }
  if (normalized === "benefit") {
    return "핵심 장점";
  }
  if (normalized === "problem" || normalized === "concern") {
    return "문제 공감";
  }
  if (normalized === "concernlist" || normalized === "customerconcern") {
    return "고객 고민";
  }
  if (normalized === "evidence") {
    return "근거";
  }
  if (normalized === "review" || normalized === "reviews") {
    return "후기";
  }
  if (normalized === "routine" || normalized === "howto" || normalized === "usage") {
    return "사용법";
  }
  if (normalized === "lifestyle") {
    return "사용 장면";
  }
  if (normalized === "detail") {
    return "디테일";
  }
  if (normalized === "composition" || normalized === "configuration") {
    return "제품 구성";
  }
  if (normalized === "disclosure" || normalized === "spec") {
    return "상품정보 확인";
  }
  if (normalized === "checklist") {
    return "체크리스트";
  }
  if (normalized === "cta") {
    return "구매 유도";
  }
  if (normalized === "windproof") {
    return "방풍";
  }
  if (normalized === "lightweight") {
    return "경량";
  }
  if (normalized === "style") {
    return "스타일";
  }
  if (normalized === "waterproof") {
    return "방수";
  }
  if (normalized === "comfort") {
    return "편안함";
  }
  if (normalized === "fit") {
    return "핏";
  }

  return /^\d+$/.test(token) ? token : token;
}

export function isUncertainGenerationError(code: string) { return ["HIGGSFIELD_GENERATION_PENDING", "HIGGSFIELD_REQUEST_FAILED", "PDP_IMAGE_GENERATION_FAILED", "PDP_ANALYZE_FAILED", "GEMINI_RESPONSE_INVALID", "OPENAI_RESPONSE_INVALID"].includes(code); }

export type SectionStatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "unknown";

/** 구간 목록에 보여줄 상태. 색만으로 구분하지 않도록 항상 글자와 함께 쓴다. */
export function getSectionStatusBadges(section: PdpSection, outputMode: PdpOutputMode): Array<{ tone: SectionStatusTone; label: string }> {
  const badges: Array<{ tone: SectionStatusTone; label: string }> = [];
  const status = section.generation?.status;
  if (status === "running") badges.push({ tone: "info", label: "생성 중" });
  else if (status === "queued") badges.push({ tone: "neutral", label: "대기" });
  else if (status === "unknown") badges.push({ tone: "unknown", label: "응답 확인 필요" });
  else if (status === "failed" && !section.generatedImage) badges.push({ tone: "danger", label: "실패" });
  else if (section.generatedImage) badges.push({ tone: "success", label: "수신 완료" });
  else badges.push({ tone: "neutral", label: "미생성" });
  if (section.generatedImage && getPdpSectionOutputMode(section, outputMode) === "full-image" && isPdpImageCopyStale(section)) {
    badges.push({ tone: "warning", label: "카피 변경" });
  }
  const review = section.qualityReview?.status;
  if (section.generatedImage && review === "needs-review") badges.push({ tone: "warning", label: "검토 메모" });
  else if (section.generatedImage && review === "passed") badges.push({ tone: "success", label: "검토 완료" });
  return badges;
}

export function getAspectRatioValue(ratio: string) {
  const [width, height] = ratio.split(":").map(Number);
  return width > 0 && height > 0 ? width / height : 9 / 16;
}

