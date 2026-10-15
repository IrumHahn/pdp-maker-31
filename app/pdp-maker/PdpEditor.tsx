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

import { PdpWaitingVideoFrame } from "./PdpWaitingVideo";
import { ALIGN_OPTIONS, APP_TITLE, BASIC_SOLID_COLORS, DEFAULT_COLOR_RECOMMENDATIONS, EDITOR_CANVAS_BASE_WIDTH, EXPORT_CANVAS_WIDTH, FONT_OPTIONS, FONT_WEIGHT_OPTIONS, ImageColorRecommendations, MANUAL_SECTION_OPTIONS, MODEL_AGE_OPTIONS, MODEL_COUNTRY_OPTIONS, MODEL_GENDER_OPTIONS, ManualSectionOption, PdpEditorProps, PdpSection, STYLE_OPTIONS, WAITING_PROGRESS_INTERVAL_MS, applyLanguageToTextOverlay, buildDefaultTextLayout, buildExportNode, buildOverlayBackgroundStyle, buildOverlayShellStyle, buildOverlayTextStyle, buildShapeLayerStyle, clampValue, cloneCanvasLayer, downloadBlob, estimateOverlayBox, exampleReviewCopy, extractImageColorRecommendations, formatSavedAt, getAllowedWorkbenchTab, getAspectRatioValue, getCanvasBaseHeight, getDisplaySectionGoal, getDisplaySectionName, getIndexAfterMove, getLocalizedBullets, getLocalizedCopy, getModelAgeLabel, getModelCountryLabel, getModelGenderLabel, getSectionStatusBadges, getTextLayoutTemplateLabel, getWaitingEstimateMs, getWaitingProgressPercent, getWorkbenchTabLabel, hasOverlayEntry, inferTextLayoutTemplate, isEditableKeyboardTarget, isShapeLayer, isTextLayer, isUncertainGenerationError, moveArrayItem, moveIndexedRecordItem, normalizeCanvasLayer, normalizeImageOptions, normalizeOverlayRecord, normalizeSectionCopyFields, normalizeSectionOptions, normalizeShapeLayer, normalizeTextOverlay, refreshLegacyTemplateLayouts, sanitizeSectionFileName, shiftIndexedRecordForDelete, shiftIndexedRecordForInsert, sortColorsByContrast, toNumericSize, uniqueColors } from "./pdp-editor-support";

export function PdpEditor({
  initialResult,
  aspectRatio,
  aiProvider = "gemini",
  higgsfieldPreferences = DEFAULT_HIGGSFIELD_IMAGE_PREFERENCES,
  onHiggsfieldImageSettingsChange,
  openAiImageModel = DEFAULT_OPENAI_IMAGE_PREFERENCES.openAiImageModel,
  geminiImageModel = "gemini-3.1-flash-image",
  openAiImageQuality = DEFAULT_OPENAI_IMAGE_PREFERENCES.openAiImageQuality,
  onOpenAiImageSettingsChange,
  outputMode = "editable",
  onOutputModeChange,
  geminiApiKey,
  openAiApiKey,
  desiredTone,
  additionalInfo = "",
  sourceMaterials = [],
  primaryAnalysisImage,
  onReviewMaterials,
  customerReviewAnalysis = null,
  initialDraftState,
  lastSavedAt,
  manualSaveToastToken = 0,
  onOpenSettings,
  onReset,
  onDraftStateChange,
  onManualSave,
  apiConnectionLabel = "키 필요",
  referenceModelImage = null,
  referenceModelUsage = null,
  saveState = "idle",
  menuExtras = null
}: PdpEditorProps) {
  const originalImageSrc = toPdpImageSource(initialResult.originalImage, initialResult.originalImageMimeType);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(() => initialDraftState?.currentSectionIndex ?? 0);
  const [sections, setSections] = useState(() => {
    const loadedSections = (
      initialDraftState?.sections?.length
        ? initialDraftState.sections
        : initialResult.blueprint.sections
    ).map((section) => normalizeSectionCopyFields({ ...section }));

    return loadedSections;
  });
  const isCompleteMode = getPdpSectionOutputMode(sections[currentSectionIndex] ?? {}, outputMode) === "full-image";
  const outputModeLabel = isCompleteMode ? "통이미지 모드" : "텍스트편집 모드";
  const defaultEditorNotice = initialResult.blueprint.sections.length === 1
    ? "상품 맞춤 판매 기획에서 구매 질문과 근거를 확인하고, 필요한 구간을 선택하세요."
    : isCompleteMode
      ? "통이미지 모드 전체 섹션을 확인하고 필요한 컷만 이미지 옵션에서 다시 조정할 수 있습니다."
      : "전체 섹션 컷과 텍스트 레이아웃을 확인한 뒤 바로 편집하거나 다운로드할 수 있습니다.";
  const [isWritingCopy, setIsWritingCopy] = useState(false);
  const [writingCopyInfo, setWritingCopyInfo] = useState<{ mode: 'expand' | 'rewrite' | 'add' | 'single'; names: string[]; startedAt: number } | null>(null);
  const [writingCopyElapsed, setWritingCopyElapsed] = useState(0);
  useEffect(() => {
    if (!writingCopyInfo) { setWritingCopyElapsed(0); return; }
    const tick = () => setWritingCopyElapsed(Math.floor((Date.now() - writingCopyInfo.startedAt) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [writingCopyInfo]);
  const [isReplacingProduct, setIsReplacingProduct] = useState(false);
  const [isReviewingImage, setIsReviewingImage] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState<{ sectionId: string; error: string } | null>(null);
  const reviewResultRef = useRef<HTMLDivElement>(null);
  const revealReviewResult = () => requestAnimationFrame(() => {
    reviewResultRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    reviewResultRef.current?.focus({ preventScroll: true });
  });
  const copyRequestRef = useRef(false);
  const [compositionHistory, setCompositionHistory] = useState(initialDraftState?.compositionHistory ?? []);
  const [sectionIssues, setSectionIssues] = useState<Record<string, string[]>>(initialDraftState?.sectionIssues ?? {});
  const [draftReview, setDraftReview] = useState<NonNullable<PdpEditorDraftState['draftReview']>>(initialDraftState?.draftReview ?? { status: 'none' });
  const draftSummary = initialDraftState?.draftSummary ?? null;
  const draftReviewRequestRef = useRef(false);
  // 카피 적용 후 배지 검수 대상. 비어 있으면 전체 구간을 검수한다.
  const reviewTargetIdsRef = useRef<string[] | null>(null);
  const [previousComposition, setPreviousComposition] = useState(initialDraftState?.previousComposition);
  const [pendingCopyPlan, setPendingCopyPlan] = useState<{ plan: PdpCopyPlan; mode: 'expand' | 'rewrite' | 'add' | 'single'; insertIndex: number; snapshot: string; reviewOpen?: boolean } | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const pauseBatchRef = useRef(false);
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 });
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [waitingProgress, setWaitingProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [sectionImageErrorsById, setSectionImageErrorsById] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState(
    () => initialDraftState?.notice ?? defaultEditorNotice
  );
  const [sectionOptions, setSectionOptions] = useState<Record<number, ImageGenOptions>>(
    () => normalizeSectionOptions(initialDraftState?.sectionOptions ?? {}, referenceModelUsage)
  );
  const [overlaysBySection, setOverlaysBySection] = useState<Record<number, CanvasLayer[]>>(
    () => normalizeOverlayRecord(initialDraftState?.overlaysBySection ?? {})
  );
  const [defaultCopyLanguage, setDefaultCopyLanguage] = useState<PdpCopyLanguage>(
    () => initialDraftState?.defaultCopyLanguage ?? "ko"
  );
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [isSectionPickerOpen, setIsSectionPickerOpen] = useState(false);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [activeColorPalette, setActiveColorPalette] = useState<null | { layerId: string; role: "text" | "shape" | "shadow" }>(null);
  const [colorRecommendations, setColorRecommendations] = useState<ImageColorRecommendations>(DEFAULT_COLOR_RECOMMENDATIONS);
  const [inspectorSections, setInspectorSections] = useState({
    shotMood: false,
    persona: false
  });
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>(() =>
    getAllowedWorkbenchTab(initialDraftState?.workbenchTab ?? "image", isCompleteMode)
  );
  const [workbenchState, setWorkbenchState] = useState<FloatingWorkbenchState>(
    () =>
      initialDraftState?.workbenchState ?? {
        x: 756,
        y: 24,
        width: 332,
        height: 500,
        isOpen: true
      }
  );
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [pendingDeleteSectionIndex, setPendingDeleteSectionIndex] = useState<number | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  // 상단 '작업' 메뉴: 바깥 클릭·Esc로 닫는다. 백업 파일 입력이 유지되도록 항상 렌더링하고 표시만 토글한다.
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isHeaderMenuOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(event.target as Node)) setIsHeaderMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsHeaderMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isHeaderMenuOpen]);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const resizeSessionRef = useRef<Record<string, { width: number; height: number; fontSize: number }>>({});
  const didRefreshLegacyTextLayoutsRef = useRef(false);
  const generatedCountRef = useRef(0);
  const waitingProgressSessionRef = useRef<null | {
    durationMs: number;
    generatedAtStart: number;
    startedAt: number;
    targetCount: number;
  }>(null);

  const currentSection = sections[currentSectionIndex];
  const isPlanningPlaceholder = currentSection?.section_id === 'planning_start';
  // 구버전 초안의 기획 자리표시 구간: 자료 화면으로 돌아가 초안을 새로 만든다.
  const continuePlanning = () => { setErrorMessage(''); onReviewMaterials?.(); };
  const sectionReference = (section: PdpSection) => getPdpSectionReference(section, sourceMaterials, { base64: initialResult.originalImage, mimeType: initialResult.originalImageMimeType, fileName: initialResult.originalImageFileName });
  const savedLayers = overlaysBySection[currentSectionIndex] ?? [];
  const currentLayers = isCompleteMode ? [] : savedLayers;
  const currentTextLayers = currentLayers.filter(isTextLayer);
  const currentShapeLayers = currentLayers.filter(isShapeLayer);
  const selectedLayer = currentLayers.find((overlay) => overlay.id === selectedOverlayId) ?? null;
  const selectedTextLayer = selectedLayer && isTextLayer(selectedLayer) ? selectedLayer : null;
  const selectedShapeLayer = selectedLayer && isShapeLayer(selectedLayer) ? selectedLayer : null;
  const generatedCount = sections.filter((section) => Boolean(section.generatedImage)).length;
  const missingImageCount = sections.filter(section => (!section.generatedImage || (getPdpSectionOutputMode(section, outputMode) === "full-image" && isPdpImageCopyStale(section))) && section.generation?.status !== "unknown").length;
  const pendingDeleteSection =
    pendingDeleteSectionIndex === null ? null : sections[pendingDeleteSectionIndex] ?? null;

  const activeWorkbenchLabel = getWorkbenchTabLabel(workbenchTab, isCompleteMode);
  const isEditorGeneratingImage = isGeneratingImage || isGeneratingAllImages;
  const isEditorBusy = isReplacingProduct || isEditorGeneratingImage || isWritingCopy || isReviewingImage;
  const isCurrentImageRegeneration = isGeneratingImage && Boolean(currentSection.generatedImage);
  const isCurrentImageLoading = !currentSection.generatedImage && (isGeneratingImage || isGeneratingAllImages);
  const currentSectionImageError = currentSection ? sectionImageErrorsById[currentSection.section_id] ?? currentSection.generation?.message ?? "" : "";

  useEffect(() => {
    generatedCountRef.current = generatedCount;
  }, [generatedCount]);

  useEffect(() => {
    if (!isEditorGeneratingImage) {
      waitingProgressSessionRef.current = null;
      setWaitingProgress(0);
      return;
    }

    const targetCount = isGeneratingAllImages ? Math.max(1, missingImageCount) : 1;
    waitingProgressSessionRef.current = {
      durationMs: getWaitingEstimateMs(targetCount, isGeneratingAllImages, isCurrentImageRegeneration),
      generatedAtStart: generatedCountRef.current,
      startedAt: Date.now(),
      targetCount
    };
    setWaitingProgress(8);

    const updateProgress = () => {
      const session = waitingProgressSessionRef.current;
      if (!session) {
        return;
      }

      const generatedSinceStart = Math.max(0, generatedCountRef.current - session.generatedAtStart);
      setWaitingProgress(
        getWaitingProgressPercent(session.startedAt, session.durationMs, generatedSinceStart, session.targetCount)
      );
    };

    updateProgress();
    const timer = window.setInterval(updateProgress, WAITING_PROGRESS_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isEditorGeneratingImage]);

  const logEditorEvent = (
    event: string,
    metadata?: Record<string, unknown>,
    level: "info" | "warn" | "error" = "info",
    error?: Error | string
  ) => {
    logPdpUsage({
      event,
      source: "editor",
      level,
      state: {
        aiProvider,
        outputMode,
        aspectRatio,
        currentSectionIndex,
        sectionCount: sections.length,
        sectionId: currentSection?.section_id ?? "missing",
        sectionName: currentSection?.section_name ?? "missing",
        generatedCount,
        missingImageCount,
        hasCurrentImage: Boolean(currentSection?.generatedImage),
        layerCount: currentLayers.length,
        workbenchTab,
        workbenchOpen: workbenchState.isOpen
      },
      metadata,
      error
    });
  };

  useEffect(() => {
    logPdpUsage({
      event: "editor.opened",
      source: "editor",
      state: {
        aiProvider,
        outputMode,
        aspectRatio,
        sectionCount: sections.length,
        generatedCount,
        missingImageCount
      }
    });
  }, []);

  // 초안 검수는 뒤에서 1회만 돌리고 결과를 배지로 보여준다. 초안을 막거나 자동 보정하지 않는다.
  useEffect(() => {
    if (draftReview.status !== 'pending' || draftReviewRequestRef.current) return;
    draftReviewRequestRef.current = true;
    const targetIds = reviewTargetIdsRef.current;
    reviewTargetIdsRef.current = null;
    const targets = sections.filter(section => section.section_id !== 'planning_start' && !section.section_id.startsWith('review_example_') && (!targetIds || targetIds.includes(section.section_id))).map(section => ({ section_id: section.section_id, section_name: section.section_name, headline: section.headline, subheadline: section.subheadline, bullets: section.bullets, copyEvidence: section.copyEvidence }));
    if (!targets.length) { draftReviewRequestRef.current = false; setDraftReview({ status: 'done', checkedAt: new Date().toISOString(), issueCount: 0 }); return; }
    void (async () => {
      try {
        const original = await preparePdpReviewImage(primaryAnalysisImage?.base64 ?? initialResult.originalImage, primaryAnalysisImage?.mimeType ?? initialResult.originalImageMimeType);
        const response = await apiJson<{ ok: true; review: { issues: Array<{ section_id: string; reason: string }>; checkedAt: string } } | { ok: false; message: string }>('/pdp/draft-review', { method: 'POST', body: JSON.stringify({ originalImageBase64: original.base64, originalImageMimeType: original.mimeType, sourceMaterials, additionalInfo, customerReviewAnalysis, aiProvider, sections: targets }) }, { geminiApiKey, openAiApiKey, timeoutMs: 130000 });
        if (!response.ok) throw new Error(response.message);
        setSectionIssues(current => { const next = { ...current }; for (const issue of response.review.issues) { const list = next[issue.section_id] ?? []; if (!list.includes(issue.reason)) next[issue.section_id] = [...list, issue.reason]; } return next; });
        setDraftReview({ status: 'done', checkedAt: response.review.checkedAt, issueCount: response.review.issues.length });
      } catch (error) { setDraftReview({ status: 'failed', message: error instanceof Error ? error.message : '검수를 마치지 못했습니다.' }); }
      finally { draftReviewRequestRef.current = false; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReview.status]);

  const lastLoggedEditorErrorRef = useRef("");
  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const errorKey = `${currentSectionIndex}:${errorMessage}`;
    if (lastLoggedEditorErrorRef.current === errorKey) {
      return;
    }

    lastLoggedEditorErrorRef.current = errorKey;
    logEditorEvent(
      "editor.error_visible",
      {
        message: errorMessage
      },
      "warn",
      errorMessage
    );
  }, [currentSectionIndex, errorMessage]);

  useEffect(() => {
    setSelectedOverlayId(null);
    setEditingOverlayId(null);
    setActiveColorPalette(null);
    setErrorMessage("");
  }, [currentSectionIndex]);

  useEffect(() => {
    setWorkbenchTab((current) => getAllowedWorkbenchTab(current, isCompleteMode));
    if (isCompleteMode) {
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
      setActiveColorPalette(null);
    }
  }, [isCompleteMode]);

  useEffect(() => {
    if (!selectedLayer) {
      return;
    }

    setWorkbenchState((current) => ({
      ...current,
      isOpen: true
    }));
  }, [currentSectionIndex, selectedLayer]);

  useEffect(() => {
    const element = imageContainerRef.current;
    if (!element) {
      setCanvasScale(1);
      return;
    }

    const updateScale = () => {
      const width = element.clientWidth || EDITOR_CANVAS_BASE_WIDTH;
      setCanvasScale(clampValue(width / EDITOR_CANVAS_BASE_WIDTH, 0.3, 1));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, [currentSection.generatedImage, currentSectionIndex]);

  useEffect(() => {
    onDraftStateChange?.({
      previousComposition,
      compositionHistory,
      currentSectionIndex,
      sections,
      sectionOptions,
      overlaysBySection,
      defaultCopyLanguage,
      notice,
      workbenchTab,
      workbenchState,
      sectionIssues,
      draftReview,
      draftSummary: draftSummary ?? undefined
    });
  }, [previousComposition, compositionHistory, currentSectionIndex, defaultCopyLanguage, notice, onDraftStateChange, overlaysBySection, sectionOptions, sections, workbenchState, workbenchTab, sectionIssues, draftReview, draftSummary]);

  useEffect(() => {
    let isCancelled = false;

    if (!currentSection.generatedImage) {
      setColorRecommendations(DEFAULT_COLOR_RECOMMENDATIONS);
      return;
    }

    void extractImageColorRecommendations(currentSection.generatedImage).then((next) => {
      if (!isCancelled) {
        setColorRecommendations(next);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [currentSection.generatedImage]);

  useEffect(() => {
    if (!manualSaveToastToken) {
      return;
    }

    setShowSaveToast(true);
    const timeout = window.setTimeout(() => {
      setShowSaveToast(false);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [manualSaveToastToken]);

  const deleteOverlay = (overlayId: string, trigger: "button" | "keyboard" = "button") => {
    const deletedOverlay = currentLayers.find((overlay) => overlay.id === overlayId);
    if (!deletedOverlay) {
      return;
    }

    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: (current[currentSectionIndex] ?? []).filter((overlay) => overlay.id !== overlayId)
    }));
    if (selectedOverlayId === overlayId) {
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
    }
    setActiveColorPalette((current) => (current?.layerId === overlayId ? null : current));
    logEditorEvent("editor.layer_deleted", {
      kind: deletedOverlay.kind,
      layerCount: Math.max(0, currentLayers.length - 1),
      trigger
    });
  };

  useEffect(() => {
    if (!selectedOverlayId || editingOverlayId || pendingDeleteSection || isCompleteMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "Delete" && event.key !== "Backspace")) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || isEditableKeyboardTarget(event.target)) {
        return;
      }

      event.preventDefault();
      deleteOverlay(selectedOverlayId, "keyboard");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteOverlay, editingOverlayId, isCompleteMode, pendingDeleteSection, selectedOverlayId]);

  useEffect(() => {
    const legacy = sections.map((section, index) => ({ section, index })).filter(({ section, index }) =>
      section.section_id.startsWith('review_example_') &&
      ['예시 후기 · 실제 고객 후기가 아닙니다', exampleReviewCopy.headline].includes(section.headline) &&
      !overlaysBySection[index]?.some(layer => layer.id.startsWith('review-editorial-')) &&
      (!overlaysBySection[index] || overlaysBySection[index].some(layer => isTextLayer(layer) && layer.text === section.headline))
    );
    if (!legacy.length) return;
    const replacements = new Map(legacy.map(({ section, index }) => [index, { ...section, ...exampleReviewCopy }]));
    setSections(current => current.map((section, index) => replacements.get(index) || section));
    setOverlaysBySection(current => {
      const next = { ...current };
      replacements.forEach((section, index) => {
        next[index] = buildDefaultTextLayout(section, index, sections.length, getSellingSectionRatio(section, aspectRatio), defaultCopyLanguage);
      });
      return next;
    });
    setNotice('예시 후기 문구를 수정했습니다. 이미지를 다시 만들 필요 없어요.');
  }, [sections, overlaysBySection, aspectRatio, defaultCopyLanguage]);

  useEffect(() => {
    const hasGeneratedSectionWithoutLayout = sections.some(
      (section, index) => getPdpSectionOutputMode(section, outputMode) === "editable" && section.generatedImage && !hasOverlayEntry(overlaysBySection, index)
    );

    if (!hasGeneratedSectionWithoutLayout) {
      return;
    }

    setOverlaysBySection((current) => {
      let didApplyTemplate = false;
      const next: Record<number, CanvasLayer[]> = { ...current };

      sections.forEach((section, index) => {
        if (getPdpSectionOutputMode(section, outputMode) !== "editable" || !section.generatedImage || hasOverlayEntry(current, index)) {
          return;
        }

        next[index] = buildDefaultTextLayout(section, index, sections.length, getSellingSectionRatio(section, aspectRatio), defaultCopyLanguage);
        didApplyTemplate = true;
      });

      return didApplyTemplate ? next : current;
    });
    setNotice((current) =>
      current.includes("생성에 실패") || current.includes("만들지 못했습니다")
        ? current.includes("기본 텍스트 레이아웃도 배치했습니다")
          ? current
          : `${current} 기본 텍스트 레이아웃도 배치했습니다.`
        : "텍스트편집 모드 섹션에 기본 텍스트 레이아웃 템플릿을 배치했습니다."
    );
  }, [aspectRatio, defaultCopyLanguage, outputMode, overlaysBySection, sections]);

  useEffect(() => {
    if (isCompleteMode || didRefreshLegacyTextLayoutsRef.current) {
      return;
    }

    didRefreshLegacyTextLayoutsRef.current = true;
    setOverlaysBySection((current) =>
      refreshLegacyTemplateLayouts(current, sections, aspectRatio, defaultCopyLanguage)
    );
  }, [aspectRatio, defaultCopyLanguage, isCompleteMode, sections]);

  const textColorRecommendations = useMemo(
    () => sortColorsByContrast(colorRecommendations.recommendedTextColors, selectedTextLayer?.color ?? null),
    [colorRecommendations.recommendedTextColors, selectedTextLayer?.color]
  );
  const shapeColorRecommendations = useMemo(
    () => sortColorsByContrast(colorRecommendations.recommendedShapeColors, selectedShapeLayer?.fillColor ?? null),
    [colorRecommendations.recommendedShapeColors, selectedShapeLayer?.fillColor]
  );
  const photoColorRecommendations = useMemo(() => uniqueColors(colorRecommendations.photoColors), [colorRecommendations.photoColors]);

  const currentOptions = useMemo(() => {
    const sectionImageDefaults = getPdpSectionImageDefaults(
      currentSection,
      currentSectionIndex,
      sections.length,
      referenceModelUsage
    );

    return normalizeImageOptions(sectionOptions[currentSectionIndex], sectionImageDefaults);
  }, [currentSection, currentSectionIndex, referenceModelUsage, sectionOptions, sections.length]);
  const referenceModelAppliesToCurrentSection = Boolean(
    referenceModelImage &&
      referenceModelUsage &&
      (referenceModelUsage === "all-sections" || currentSectionIndex === 0)
  );
  const usesReferenceModel = Boolean(currentOptions.withModel && referenceModelAppliesToCurrentSection);
  const personaLockedMessage = usesReferenceModel
    ? referenceModelUsage === "all-sections"
      ? "모델 일관성 유지 선택으로 타깃 페르소나가 비활성화되었습니다."
      : "히어로우 전용 업로드 모델이 적용되어 타깃 페르소나가 비활성화되었습니다."
    : "";

  if (!currentSection) {
    return (
      <main className={styles.page}>
        <section className={styles.editorShell}>
          <div className={styles.errorBanner}>섹션 정보를 불러오지 못했습니다.</div>
        </section>
      </main>
    );
  }

  const setCurrentOptions = (updates: Partial<ImageGenOptions>) => {
    setSectionOptions((current) => ({
      ...current,
      [currentSectionIndex]: {
        ...currentOptions,
        ...updates
      }
    }));
    logEditorEvent("editor.image_options_changed", {
      changedKeys: Object.keys(updates),
      updates
    });
  };

  const updateTextOverlayContent = (overlayId: string, nextText: string) => {
    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: (current[currentSectionIndex] ?? []).map((overlay) => {
        if (overlay.id !== overlayId || !isTextLayer(overlay)) {
          return overlay;
        }

        return normalizeTextOverlay({
          ...overlay,
          text: nextText,
          translations: {
            ...overlay.translations,
            [overlay.language]: nextText
          }
        });
      })
    }));
  };

  const handleOverlayLanguageChange = (overlay: TextOverlay, nextLanguage: PdpCopyLanguage) => {
    if (overlay.language === nextLanguage) {
      return;
    }

    setDefaultCopyLanguage(nextLanguage);
    updateOverlay(overlay.id, applyLanguageToTextOverlay(overlay, nextLanguage));
  };

  const handleTextAlignChange = (overlay: TextOverlay, nextAlign: OverlayTextAlign) => {
    const currentWidth = toNumericSize(overlay.width, 320);
    const recommendedWidth = clampValue(Math.round(overlay.fontSize * 10), 220, 520);
    const nextWidth = Math.max(currentWidth, recommendedWidth);

    updateOverlay(overlay.id, {
      textAlign: nextAlign,
      width: nextWidth
    });

    if (nextWidth > currentWidth) {
      setNotice("줄맞춤이 잘 보이도록 텍스트 박스 폭도 함께 넓혔습니다.");
    }
  };

  const stopShellClick = (event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const clearLayerSelection = () => {
    setSelectedOverlayId(null);
    setEditingOverlayId(null);
    setActiveColorPalette(null);
  };

  const toggleInspectorSection = (key: keyof typeof inspectorSections) => {
    setInspectorSections((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  const openWorkbench = (tab: WorkbenchTab) => {
    setWorkbenchTab(getAllowedWorkbenchTab(tab, isCompleteMode));
    setWorkbenchState((current) => ({
      ...current,
      isOpen: true
    }));
    logEditorEvent("editor.workbench_opened", {
      tab: getAllowedWorkbenchTab(tab, isCompleteMode)
    });
  };

  const handleApplyTextLayoutTemplate = () => {
    if (isCompleteMode) {
      setErrorMessage("통이미지 모드는 텍스트가 이미지 안에 포함된 결과입니다. 문구 변경은 이미지 옵션에서 다시 생성해 주세요.");
      logEditorEvent("editor.text_template_blocked", { reason: "full_image_mode" }, "warn");
      return;
    }

    if (!currentSection.generatedImage) {
      setErrorMessage("이미지를 먼저 생성해야 텍스트 레이아웃 템플릿을 적용할 수 있습니다.");
      logEditorEvent("editor.text_template_blocked", { reason: "missing_generated_image" }, "warn");
      return;
    }

    const nextLayers = buildDefaultTextLayout(
      currentSection,
      currentSectionIndex,
      sections.length,
      getSellingSectionRatio(currentSection, aspectRatio),
      defaultCopyLanguage
    );

    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: nextLayers
    }));
    setSelectedOverlayId(nextLayers.find(isTextLayer)?.id ?? null);
    setEditingOverlayId(null);
    setWorkbenchTab("layer");
    setWorkbenchState((current) => ({
      ...current,
      isOpen: true
    }));
    setNotice(`${getDisplaySectionName(currentSection)}에 ${getTextLayoutTemplateLabel(inferTextLayoutTemplate(currentSection, currentSectionIndex, sections.length))} 템플릿을 적용했습니다.`);
    logEditorEvent("editor.text_template_applied", {
      template: inferTextLayoutTemplate(currentSection, currentSectionIndex, sections.length),
      layerCount: nextLayers.length
    });
  };

  const renderColorPaletteField = ({
    label,
    layerId,
    role,
    currentColor,
    recommendedColors,
    onSelect
  }: {
    label: string;
    layerId: string;
    role: "text" | "shape" | "shadow";
    currentColor: string;
    recommendedColors: string[];
    onSelect: (color: string) => void;
  }) => {
    const isOpen = activeColorPalette?.layerId === layerId && activeColorPalette.role === role;

    return (
      <label className={styles.floatingField}>
        <span className={styles.optionMiniLabel}>{label}</span>
        <div className={styles.colorFieldStack}>
          <button
            className={styles.colorTriggerButton}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setActiveColorPalette((current) =>
                current?.layerId === layerId && current.role === role ? null : { layerId, role }
              );
            }}
            style={{ ["--swatch-color" as string]: currentColor }}
            type="button"
          >
            <span className={styles.colorTriggerPreview} />
            <code>{currentColor}</code>
          </button>

          {isOpen ? (
            <div className={styles.colorPopover}>
              <div className={styles.paletteSection}>
                <span className={styles.optionMiniLabel}>사진 색상</span>
                <div className={styles.swatchGridWide}>
                  {photoColorRecommendations.map((color) => (
                    <button
                      className={styles.swatchButton}
                      key={`${role}-photo-${color}`}
                      onClick={() => {
                        onSelect(color);
                        setActiveColorPalette(null);
                      }}
                      style={{ ["--swatch-color" as string]: color }}
                      type="button"
                    >
                      <span className={styles.swatchPreview} />
                      <code>{color}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.paletteSection}>
                <span className={styles.optionMiniLabel}>기본 단색</span>
                <div className={styles.swatchGridWide}>
                  {BASIC_SOLID_COLORS.map((color) => (
                    <button
                      className={styles.swatchButton}
                      key={`${role}-basic-${color}`}
                      onClick={() => {
                        onSelect(color);
                        setActiveColorPalette(null);
                      }}
                      style={{ ["--swatch-color" as string]: color }}
                      type="button"
                    >
                      <span className={styles.swatchPreview} />
                      <code>{color}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.paletteSection}>
                <span className={styles.optionMiniLabel}>어울리는 컬러 추천</span>
                <div className={styles.swatchGridWide}>
                  {recommendedColors.map((color) => (
                    <button
                      className={styles.swatchButton}
                      key={`${role}-recommended-${color}`}
                      onClick={() => {
                        onSelect(color);
                        setActiveColorPalette(null);
                      }}
                      style={{ ["--swatch-color" as string]: color }}
                      type="button"
                    >
                      <span className={styles.swatchPreview} />
                      <code>{color}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.colorInputRow}>
                <input
                  className={styles.colorInputLarge}
                  onChange={(event) => onSelect(event.target.value)}
                  type="color"
                  value={currentColor}
                />
                <button className={styles.inlineButton} onClick={() => setActiveColorPalette(null)} type="button">
                  닫기
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </label>
    );
  };

  const renderWorkbenchBody = () => {
    switch (workbenchTab) {
      case "image":
        return (
          <div className={styles.workbenchSectionStack}>
            {sectionIssues[currentSection.section_id]?.length ? <div className={styles.draftIssueBox} role="status"><strong>확인 필요</strong><ul>{sectionIssues[currentSection.section_id].map((reason, index) => <li key={index}>{reason}</li>)}</ul><div className={styles.draftIssueActions}><button type="button" className={styles.secondaryButton} disabled={isEditorBusy} onClick={() => void requestProductCopy([{ section_id: currentSection.section_id, section_name: currentSection.section_name, goal: currentSection.goal || currentSection.section_name, decisionDesign: currentSection.decisionDesign }], 'single')}>{isWritingCopy ? '보정 중…' : '이 구간 보정'}</button><button type="button" className={styles.inlineButton} onClick={() => setSectionIssues(current => { const next = { ...current }; delete next[currentSection.section_id]; return next; })}>확인했어요</button></div></div> : null}
            <label className={styles.fieldLabel}>무엇을 바꿀까요?<textarea className={styles.textarea} rows={2} disabled={isEditorBusy} value={currentOptions.editInstruction ?? ''} placeholder="예: 제목만 바꾸고 제품과 배경은 유지" onChange={event => setCurrentOptions({ editInstruction: event.target.value })} /></label>
            <label className={styles.checkboxRow}><input type="checkbox" disabled={isEditorBusy} checked={Boolean(currentOptions.withModel)} onChange={event => setCurrentOptions({withModel:event.target.checked})} /><span>인물 포함 · 얼굴이 보이는 사용 장면</span></label>
            <button className={styles.inlineButton} type="button" disabled={isEditorBusy} onClick={() => {setSectionOptions(previous => Object.fromEntries(sections.map((section,index) => [index,{...normalizeImageOptions(previous[index], getPdpSectionImageDefaults(section,index,sections.length,referenceModelUsage)),withModel:currentOptions.withModel}]))); setNotice('인물 포함 설정을 모든 섹션에 적용했습니다. 기존 이미지는 유지됩니다.');}}>현재 인물 설정을 전체에 적용</button>
            <button type="button" className={styles.secondaryButton} disabled={isEditorBusy || isPlanningPlaceholder} onClick={() => void requestProductCopy([{ section_id: currentSection.section_id, section_name: currentSection.section_name, goal: currentSection.goal || currentSection.section_name, decisionDesign: currentSection.decisionDesign }], 'single')}>{isWritingCopy ? '카피 작성 중…' : '이 섹션 카피 작성'}</button>
            {isWritingCopy ? <p role="status" className={styles.settingsHelper}>카피를 작성하고 검토하는 중입니다. 최대 1분 정도 걸립니다.</p> : null}
            <details className={styles.compactEditorGroup}><summary>문구 직접 수정</summary>
            <PdpRevisionControls section={currentSection} options={currentOptions} originalImage={toPdpImageSource(sectionReference(currentSection).base64, sectionReference(currentSection).mimeType)} fullImage={isCompleteMode} disabled={isEditorBusy} onApplyText={() => { const ratio = getSellingSectionRatio(currentSection, aspectRatio); const layers = buildDefaultTextLayout(currentSection, currentSectionIndex, sections.length, ratio, defaultCopyLanguage); if (layers.some(layer => layer.y + Number(layer.height) > getCanvasBaseHeight(ratio))) { setErrorMessage("문구가 한 장의 높이를 넘습니다. 내용을 나누거나 줄인 뒤 적용해 주세요."); return; } setOverlaysBySection(current => ({ ...current, [currentSectionIndex]: layers })); setNotice("현재 문구를 편집 가능한 텍스트 레이어에 반영했습니다. 저장과 다운로드에 포함됩니다."); }} onOptionsChange={setCurrentOptions} onSectionChange={patch => setSections(current => current.map(section => section.section_id === currentSection.section_id ? { ...section, imageCopySignature: section.generatedImage ? section.imageCopySignature || getPdpImageCopySignature(section) : undefined, ...patch } : section))} />
            </details>
            <details className={styles.compactEditorGroup}><summary>생성 모델·화질</summary>
            {aiProvider === "higgsfield" && onHiggsfieldImageSettingsChange ? <div className={styles.optionSurface}><PdpHiggsfieldImageControls referenceCount={1 + (usesReferenceModel ? 1 : 0) + (currentOptions.editInstruction?.trim() && currentSection?.generatedImage ? 1 : 0)} preferences={higgsfieldPreferences} onChange={onHiggsfieldImageSettingsChange} disabled={isEditorBusy} /></div> : null}
            {aiProvider === "openai" && onOpenAiImageSettingsChange ? (
              <div className={styles.optionSurface}>
                <PdpOpenAiImageControls
                  model={openAiImageModel}
                  quality={openAiImageQuality}
                  disabled={isEditorBusy}
                  onChange={onOpenAiImageSettingsChange}
                />
              </div>
            ) : null}
            </details>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>샷 타입</span>
                  <strong>배경·연출 변경 (선택)</strong>
                </div>
                <button className={styles.sectionToggleButton} onClick={() => toggleInspectorSection("shotMood")} type="button">
                  {inspectorSections.shotMood ? "숨기기" : "보이기"}
                  {inspectorSections.shotMood ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              {inspectorSections.shotMood ? (
                <>
                  <div className={styles.styleOptionGrid}>
                    {STYLE_OPTIONS.map((style) => (
                      <button
                        className={currentOptions.style === style.value ? styles.styleCardActive : styles.styleCard}
                        key={style.value}
                        onClick={() => setCurrentOptions({ style: style.value })}
                        type="button"
                      >
                        <strong>{style.label}</strong>
                        <small>{style.description}</small>
                      </button>
                    ))}
                  </div>

                  <label className={styles.toggleCard}>
                    <div className={styles.toggleCardCopy}>
                      <strong>기획에 맞춰 자동 연출</strong>
                      <span>
                        {currentOptions.guidePriorityMode === "guide-first"
                          ? "장면과 구도는 각 페이지의 이야기와 역할에 맞춰 자동으로 정합니다."
                          : "기획의 구도보다 아래에서 선택한 배경 분위기를 우선합니다."}
                      </span>
                    </div>
                    <input
                      checked={currentOptions.guidePriorityMode === "guide-first"}
                      onChange={(event) =>
                        setCurrentOptions({
                          guidePriorityMode: event.target.checked ? "guide-first" : "style-first"
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                </>
              ) : (
                <p className={styles.collapsedHint}>
                  현재 선택: {STYLE_OPTIONS.find((style) => style.value === currentOptions.style)?.label ?? "스튜디오컷"} ·{" "}
                  {currentOptions.guidePriorityMode === "guide-first" ? "기획에 맞춰 자동 연출" : "선택한 배경으로 연출"}
                </p>
              )}
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>모델 설정</span>
                  <strong>인물 세부 설정</strong>
                </div>
                <div className={styles.optionHeaderTools}>
                  <User size={16} />
                  <button className={styles.sectionToggleButton} onClick={() => toggleInspectorSection("persona")} type="button">
                    {inspectorSections.persona ? "숨기기" : "보이기"}
                    {inspectorSections.persona ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>
              {inspectorSections.persona ? (
                <>
                  <label className={styles.toggleCard}>
                    <div className={styles.toggleCardCopy}>
                      <strong>모델컷 포함</strong>
                      <span>
                        {referenceModelImage
                          ? "제품과 함께 연출되는 인물컷이 필요하면 켜 두세요. 업로드 모델이 적용되는 구간에서는 동일 인물이 유지됩니다."
                          : "제품과 함께 연출되는 인물컷이 필요한 경우 켜 두세요."}
                      </span>
                    </div>
                    <input
                      checked={currentOptions.withModel}
                      onChange={(event) => setCurrentOptions({ withModel: event.target.checked })}
                      type="checkbox"
                    />
                  </label>

                  {currentOptions.withModel ? (
                    <div className={styles.optionStack}>
                      {usesReferenceModel ? (
                        <div className={styles.lockedHint}>
                          <AlertCircle size={15} />
                          <div>
                            <strong>{referenceModelUsage === "all-sections" ? "전체 일관성 유지 적용 중" : "히어로우 업로드 모델 적용 중"}</strong>
                            <span>{personaLockedMessage}</span>
                          </div>
                        </div>
                      ) : null}

                      <div className={styles.optionFieldBlock}>
                        <span className={styles.optionMiniLabel}>성별</span>
                        <div className={styles.segmentedRow}>
                          {MODEL_GENDER_OPTIONS.map((option) => (
                            <button
                              className={currentOptions.modelGender === option.value ? styles.segmentedButtonActive : styles.segmentedButton}
                              disabled={usesReferenceModel}
                              key={option.value}
                              onClick={() => setCurrentOptions({ modelGender: option.value })}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.optionFieldBlock}>
                        <span className={styles.optionMiniLabel}>연령대</span>
                        <div className={styles.segmentedGridCompact}>
                          {MODEL_AGE_OPTIONS.map((option) => (
                            <button
                              className={currentOptions.modelAgeRange === option.value ? styles.segmentedButtonActive : styles.segmentedButton}
                              disabled={usesReferenceModel}
                              key={option.value}
                              onClick={() => setCurrentOptions({ modelAgeRange: option.value })}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.optionFieldBlock}>
                        <div className={styles.optionFieldHeader}>
                          <span className={styles.optionMiniLabel}>국가</span>
                          <Globe2 size={14} />
                        </div>
                        <div className={styles.countryGrid}>
                          {MODEL_COUNTRY_OPTIONS.map((option) => (
                            <button
                              className={currentOptions.modelCountry === option.value ? styles.countryCardActive : styles.countryCard}
                              disabled={usesReferenceModel}
                              key={option.value}
                              onClick={() => setCurrentOptions({ modelCountry: option.value })}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className={styles.collapsedHint}>현재 설정: {selectedModelSummary}</p>
              )}
            </div>

            <details className={styles.compactEditorGroup}><summary>제품 원본 교체</summary>
              <label className={styles.fieldLabel}>현재 섹션 제품 원본 교체
                <input aria-label="현재 섹션 제품 원본 교체" type="file" accept="image/png,image/jpeg,image/webp" disabled={isEditorBusy} onChange={async event => {
                  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
                  const id = currentSection.section_id;
                  setIsReplacingProduct(true); setErrorMessage('');
                  try {
                    const prepared = await prepareImageFile(file, { allowLongPageSampling: false });
                    const productReference = { base64: prepared.generationBase64 ?? prepared.base64, mimeType: prepared.generationMimeType ?? prepared.mimeType, fileName: file.name };
                    setSections(current => current.map(section => section.section_id === id ? { ...section, productReference, qualityReview: undefined } : section));
                    setCurrentOptions({ editInstruction: currentOptions.editInstruction?.trim() || '현재 배경과 구도, 광고 문구는 유지하고 제품을 새 원본 참조에 맞춰 수정하세요. 제품 형태와 로고, 라벨을 보존하세요.' });
                    setReviewFeedback(null);
                    setNotice('제품 원본을 교체했습니다. 현재 결과는 그대로 보존됩니다. 수정 내용을 확인하고 이미지 다시 만들기를 눌러 주세요.');
                  } catch(error) { setErrorMessage(error instanceof Error ? error.message : '제품 원본을 교체하지 못했습니다.'); }
                  finally { setIsReplacingProduct(false); }
                }} />
              </label>
              <p className={styles.settingsHelper}>{isReplacingProduct ? '제품 사진을 준비하고 있습니다…' : currentSection.productReference ? `교체한 원본: ${currentSection.productReference.fileName}` : '라벨이 선명한 고해상도 제품 사진을 올리세요. 현재 섹션의 수정·검사에 사용하며, 업로드만으로 생성 비용이 발생하지 않습니다.'}</p>
            </details>
            <details className={styles.compactEditorGroup}><summary>전체 이야기·카피 다시 작성</summary>
              <p className={styles.settingsHelper}>앞 장의 고민에 다음 장이 답하도록 전체 흐름을 함께 작성합니다. 결과 검토 후 적용하며 기존 이미지는 보존합니다.</p>
              <button className={styles.secondaryButton} type="button" disabled={isEditorBusy} onClick={handleRewriteCopy}>{isWritingCopy ? '상품 자료로 작성 중…' : '전체 카피 다시 작성'}</button>
              <p className={styles.settingsHelper}>등록한 상품 자료로 작성합니다. 작성·내용 검수와 최대 1회 보정을 포함해 분석 API를 최대 4회 사용하며, 이미지 생성 비용은 별도입니다. 이미지 문구·제품 검사는 원할 때만 별도로 실행하며 분석 API 비용이 발생합니다.</p>
            </details>
            <details className={styles.compactEditorGroup}><summary>선택 검토 · 생성에 영향 없음</summary>
              {currentSection.generatedImage ? <>
                <button className={styles.secondaryButton} type="button" disabled={isEditorBusy} onClick={handleReviewImage}>{isReviewingImage ? '이미지 문구·제품 검사 중…' : '현재 이미지 문구·제품 검사'}</button>
                <div ref={reviewResultRef} tabIndex={-1} role="status" aria-live="polite" aria-busy={isReviewingImage} className={styles.warningBox} data-testid="image-review-result">
                  <strong>{isReviewingImage ? '문구와 제품을 원본과 비교하고 있습니다…' : reviewFeedback?.sectionId === currentSection.section_id && reviewFeedback.error ? '검사를 완료하지 못했습니다' : currentSection.qualityReview?.status === 'passed' ? '문구·제품 검사 통과' : currentSection.qualityReview?.status === 'needs-review' ? '검사 완료 · 확인할 항목이 있습니다' : currentSection.qualityReview?.status === 'stale' ? '이미지 또는 문구가 변경되어 재검사가 필요합니다' : '선택 검사 · 이미지 생성과 다운로드는 바로 가능합니다'}</strong>
                  {isReviewingImage ? <p>검사 중에는 이미지를 다시 생성하지 않습니다. 완료되면 여기에 결과가 표시됩니다.</p> : reviewFeedback?.sectionId === currentSection.section_id && reviewFeedback.error ? <p>{reviewFeedback.error}</p> : <>
                    {currentSection.qualityReview?.issues.length ? <ul>{currentSection.qualityReview.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <p>{currentSection.qualityReview?.status === 'passed' ? 'AI 검사에서 수정 항목을 찾지 못했습니다. 제품 원본과 최종 비교해 주세요.' : '원할 때만 위 버튼으로 검사를 실행하세요. 검사 없이도 나머지 이미지를 생성할 수 있습니다.'}</p>}
                    {currentSection.qualityReview?.status === 'needs-review' ? <p>위 항목과 원본을 비교하고 필요한 부분만 수정하세요. 검사 결과는 참고사항이며 나머지 이미지 생성과 다운로드를 막지 않습니다.</p> : null}
                  </>}
                </div>
              </> : null}
            </details>

            {currentSection.section_id.startsWith('review_example_') ? <button type="button" className={styles.secondaryButton} onClick={openReviewRegistration}>실제 후기 등록하기</button> : null}
            <div className={styles.dockAction}>
            {isPlanningPlaceholder ? <>
              <p className={styles.settingsHelper}>이 작업은 구버전 기획 단계에서 멈춰 있습니다. 자료 화면에서 기획·카피 초안을 새로 만들어 주세요.</p>
              <button type="button" className={styles.primaryButtonWide} disabled={isEditorBusy} onClick={continuePlanning}>자료 화면에서 초안 만들기</button>
            </> : <>

            {Array.from(sections.filter(section => (!section.generatedImage || (getPdpSectionOutputMode(section, outputMode) === "full-image" && isPdpImageCopyStale(section))) && section.generation?.status !== 'unknown').reduce((groups, section) => {
              const ratio = getSellingSectionRatio(section, aspectRatio); groups.set(ratio, (groups.get(ratio) ?? 0) + 1); return groups;
            }, new Map<AspectRatio, number>()), ([ratio, count]) => ({ ratio, count })).map(group => (
            <PdpCostPreview key={group.ratio} provider={aiProvider} model={aiProvider === "higgsfield" ? higgsfieldPreferences.higgsfieldImageModel : aiProvider === "openai" ? openAiImageModel : geminiImageModel} quality={aiProvider === "openai" ? openAiImageQuality : aiProvider === "higgsfield" ? higgsfieldPreferences.higgsfieldImageQuality : "1K"} resolution={higgsfieldPreferences.higgsfieldImageResolution} variant={higgsfieldPreferences.higgsfieldImageVariant} aspectRatio={group.ratio} countLabel={`만들 이미지 ${group.ratio}`} count={group.count} attempts={sections.reduce((total, section) => total + (section.generation?.attempts ?? 0), 0)} />
            ))}

            {missingImageCount > 1 ? <button className={styles.primaryButtonWide} disabled={isEditorBusy} onClick={handleGenerateMissingImages} type="button">{isGeneratingAllImages ? '나머지 이미지 생성 중…' : `남은 ${missingImageCount}장 모두 만들기`}</button> : null}
            <button className={styles.primaryButtonWide} disabled={isEditorBusy} onClick={handleGenerateImage} type="button">
              {isGeneratingImage ? <Loader2 className={styles.spinIcon} size={16} /> : currentSection.generatedImage ? <RefreshCw size={16} /> : <ImageIcon size={16} />}
              {currentSection.generatedImage ? "현재 이미지 다시 만들기" : "현재 1장 만들기"}
            </button>
            </>}
            </div>

            <p className={styles.inspectorHelper}>
              {isPlanningPlaceholder ? "" : isGeneratingAllImages
                ? "미생성 섹션 이미지를 순서대로 생성하는 중입니다."
                : usesReferenceModel
                ? "업로드한 모델 이미지를 참조하면서 현재 섹션 컷만 다시 생성합니다."
                : "섹션 헤드라인과 지금 선택한 모델 조건을 반영해 현재 컷만 다시 생성합니다."}
            </p>
          </div>
        );
      case "layer":
        return selectedTextLayer ? (
            <div className={styles.workbenchSectionStack}>
              <div className={styles.toolbarRow}>
                <button className={styles.inlineDangerButton} onClick={() => deleteOverlay(selectedTextLayer.id)} type="button">
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>

            <label className={styles.floatingField}>
              <div className={styles.fieldHeaderInline}>
                <span className={styles.optionMiniLabel}>텍스트 내용</span>
                <div className={styles.languageControlRow}>
                  <select
                    className={styles.miniSelect}
                    onChange={(event) => handleOverlayLanguageChange(selectedTextLayer, event.target.value as PdpCopyLanguage)}
                    value={selectedTextLayer.language}
                  >
                    <option value="ko">한국어</option>
                    <option value="en">영어</option>
                  </select>
                </div>
              </div>
              <textarea
                className={styles.floatingTextarea}
                onChange={(event) => updateTextOverlayContent(selectedTextLayer.id, event.target.value)}
                rows={3}
                value={selectedTextLayer.text}
              />
            </label>

            <div className={styles.floatingCompactGrid}>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>폰트</span>
                <select
                  className={styles.select}
                  onChange={(event) => updateOverlay(selectedTextLayer.id, { fontFamily: event.target.value })}
                  value={selectedTextLayer.fontFamily}
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>굵기</span>
                <select
                  className={styles.select}
                  onChange={(event) => updateOverlay(selectedTextLayer.id, { fontWeight: event.target.value })}
                  value={selectedTextLayer.fontWeight}
                >
                  {FONT_WEIGHT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.floatingCompactGrid}>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>폭</span>
                <input
                  className={styles.input}
                  min={80}
                  onChange={(event) =>
                    updateOverlay(selectedTextLayer.id, {
                      width: clampValue(Number(event.target.value) || 320, 80, 1200)
                    })
                  }
                  type="number"
                  value={toNumericSize(selectedTextLayer.width, 320)}
                />
              </label>

              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>크기</span>
                <div className={styles.rangeField}>
                  <input
                    className={styles.rangeInput}
                    max={180}
                    min={10}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { fontSize: Number(event.target.value) || 16 })}
                    type="range"
                    value={selectedTextLayer.fontSize}
                  />
                  <input
                    className={styles.input}
                    min={10}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { fontSize: Number(event.target.value) || 16 })}
                    type="number"
                    value={selectedTextLayer.fontSize}
                  />
                </div>
              </label>

              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>줄 간격</span>
                <div className={styles.rangeField}>
                  <input
                    className={styles.rangeInput}
                    max={3}
                    min={0.8}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { lineHeight: Number(event.target.value) || 1.2 })}
                    step={0.1}
                    type="range"
                    value={selectedTextLayer.lineHeight}
                  />
                  <input
                    className={styles.input}
                    max={3}
                    min={0.8}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { lineHeight: Number(event.target.value) || 1.2 })}
                    step={0.1}
                    type="number"
                    value={selectedTextLayer.lineHeight}
                  />
                </div>
              </label>
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>Color palette</span>
                  <strong>글자색</strong>
                </div>
                <Palette size={16} />
              </div>
              {renderColorPaletteField({
                label: "글자색",
                layerId: selectedTextLayer.id,
                role: "text",
                currentColor: selectedTextLayer.color,
                recommendedColors: textColorRecommendations,
                onSelect: (color) => updateOverlay(selectedTextLayer.id, { color })
              })}
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>Shadow</span>
                  <strong>가독성 그림자</strong>
                </div>
                <Sparkles size={16} />
              </div>
              <label className={styles.toggleCard}>
                <div className={styles.toggleCardCopy}>
                  <strong>그림자 사용</strong>
                  <span>밝은 이미지 위에서도 텍스트가 묻히지 않도록 깊이를 더합니다.</span>
                </div>
                <input
                  checked={selectedTextLayer.shadowEnabled}
                  onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowEnabled: event.target.checked })}
                  type="checkbox"
                />
              </label>

              {selectedTextLayer.shadowEnabled ? (
                <>
                  {renderColorPaletteField({
                    label: "그림자색",
                    layerId: selectedTextLayer.id,
                    role: "shadow",
                    currentColor: selectedTextLayer.shadowColor,
                    recommendedColors: [colorRecommendations.darkColor, "#000000", colorRecommendations.accentColor],
                    onSelect: (color) => updateOverlay(selectedTextLayer.id, { shadowColor: color })
                  })}
                  <div className={styles.floatingCompactGrid}>
                    <label className={styles.floatingField}>
                      <span className={styles.optionMiniLabel}>강도</span>
                      <div className={styles.rangeField}>
                        <input className={styles.rangeInput} max={1} min={0} step={0.05} type="range" value={selectedTextLayer.shadowOpacity} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOpacity: Number(event.target.value) || 0 })} />
                        <input className={styles.input} max={1} min={0} step={0.05} type="number" value={selectedTextLayer.shadowOpacity} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOpacity: Number(event.target.value) || 0 })} />
                      </div>
                    </label>
                    <label className={styles.floatingField}>
                      <span className={styles.optionMiniLabel}>흐림</span>
                      <div className={styles.rangeField}>
                        <input className={styles.rangeInput} max={40} min={0} step={1} type="range" value={selectedTextLayer.shadowBlur} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowBlur: Number(event.target.value) || 0 })} />
                        <input className={styles.input} max={40} min={0} step={1} type="number" value={selectedTextLayer.shadowBlur} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowBlur: Number(event.target.value) || 0 })} />
                      </div>
                    </label>
                    <label className={styles.floatingField}>
                      <span className={styles.optionMiniLabel}>거리</span>
                      <div className={styles.rangeField}>
                        <input className={styles.rangeInput} max={24} min={-24} step={1} type="range" value={selectedTextLayer.shadowOffsetY} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOffsetY: Number(event.target.value) || 0 })} />
                        <input className={styles.input} max={24} min={-24} step={1} type="number" value={selectedTextLayer.shadowOffsetY} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOffsetY: Number(event.target.value) || 0 })} />
                      </div>
                    </label>
                  </div>
                </>
              ) : null}
            </div>

            <div className={styles.floatingField}>
              <span className={styles.optionMiniLabel}>정렬</span>
              <div className={styles.alignButtonGroup}>
                {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    className={selectedTextLayer.textAlign === value ? styles.alignButtonActive : styles.alignButton}
                    key={value}
                    onClick={() => handleTextAlignChange(selectedTextLayer, value)}
                    type="button"
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : selectedShapeLayer ? (
          <div className={styles.workbenchSectionStack}>
            <div className={styles.toolbarRow}>
              <p className={styles.floatingHint}>사각형은 이미지 위, 텍스트 아래에 깔리는 독립 배경 오브젝트입니다.</p>
              <button className={styles.inlineDangerButton} onClick={() => deleteOverlay(selectedShapeLayer.id)} type="button">
                <Trash2 size={14} />
                삭제
              </button>
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>Shape fill</span>
                  <strong>배경 사각형 색상</strong>
                </div>
                <Palette size={16} />
              </div>
              {renderColorPaletteField({
                label: "채우기 색상",
                layerId: selectedShapeLayer.id,
                role: "shape",
                currentColor: selectedShapeLayer.fillColor,
                recommendedColors: shapeColorRecommendations,
                onSelect: (color) => updateOverlay(selectedShapeLayer.id, { fillColor: color })
              })}
            </div>

            <div className={styles.floatingCompactGrid}>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>투명도</span>
                <div className={styles.rangeField}>
                  <input className={styles.rangeInput} max={1} min={0} step={0.05} type="range" value={selectedShapeLayer.fillOpacity} onChange={(event) => updateOverlay(selectedShapeLayer.id, { fillOpacity: Number(event.target.value) || 0 })} />
                  <input className={styles.input} max={1} min={0} step={0.05} type="number" value={selectedShapeLayer.fillOpacity} onChange={(event) => updateOverlay(selectedShapeLayer.id, { fillOpacity: Number(event.target.value) || 0 })} />
                </div>
              </label>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>모서리</span>
                <div className={styles.rangeField}>
                  <input className={styles.rangeInput} max={48} min={0} step={1} type="range" value={selectedShapeLayer.borderRadius} onChange={(event) => updateOverlay(selectedShapeLayer.id, { borderRadius: Number(event.target.value) || 0 })} />
                  <input className={styles.input} max={48} min={0} step={1} type="number" value={selectedShapeLayer.borderRadius} onChange={(event) => updateOverlay(selectedShapeLayer.id, { borderRadius: Number(event.target.value) || 0 })} />
                </div>
              </label>
            </div>
          </div>
        ) : (
          <div className={styles.inspectorEmpty}>
            <Type size={18} />
            <div>
              <strong>텍스트나 사각형을 선택해 주세요</strong>
              <p>캔버스의 텍스트나 배경 사각형을 클릭하면 이 패널에서 바로 편집할 수 있습니다.</p>
              <div className={styles.inspectorEmptyActions}>
                <button className={styles.copyUtilityButton} onClick={handleAddShapeLayer} type="button">
                  <Square size={15} />
                  배경 사각형 추가
                </button>
              </div>
            </div>
          </div>
        );
      case "copy":
        return (
          <div className={styles.copyLibrary}>
            <div className={styles.copySection}>
              <p className={styles.cardLabel}>Layout Object</p>
              <button className={styles.copyUtilityButtonStrong} onClick={handleApplyTextLayoutTemplate} type="button">
                <Sparkles size={15} />
                현재 섹션 템플릿 적용
              </button>
              <button className={styles.copyUtilityButton} onClick={handleAddShapeLayer} type="button">
                <Palette size={15} />
                배경 사각형 추가
              </button>
            </div>

            <div className={styles.copySection}>
              <p className={styles.cardLabel}>Headline</p>
              <button
                className={styles.copyBlock}
                onClick={() =>
                  handleAddTextOverlay(
                    {
                      ko: currentSection.headline,
                      en: currentSection.headline_en
                    },
                    "headline"
                  )
                }
                type="button"
              >
                {getLocalizedCopy(currentSection.headline, currentSection.headline_en, defaultCopyLanguage)}
              </button>
            </div>

            <div className={styles.copySection}>
              <p className={styles.cardLabel}>Subheadline</p>
              <button
                className={styles.copyBlockSoft}
                onClick={() =>
                  handleAddTextOverlay(
                    {
                      ko: currentSection.subheadline,
                      en: currentSection.subheadline_en
                    },
                    "subheadline"
                  )
                }
                type="button"
              >
                {getLocalizedCopy(currentSection.subheadline, currentSection.subheadline_en, defaultCopyLanguage)}
              </button>
            </div>

            {currentSection.bullets.length ? (
              <div className={styles.copySection}>
                <p className={styles.cardLabel}>Key Points</p>
                <div className={styles.bulletStack}>
                  {getLocalizedBullets(currentSection, defaultCopyLanguage).map((bullet, index) => (
                    <button
                      className={styles.bulletButton}
                      key={`${bullet}-${index}`}
                      onClick={() =>
                        handleAddTextOverlay(
                          {
                            ko: currentSection.bullets[index] ?? bullet,
                            en: currentSection.bullets_en[index] ?? currentSection.bullets[index] ?? bullet
                          },
                          "keypoint"
                        )
                      }
                      type="button"
                    >
                      <CheckCircle2 size={14} />
                      {bullet}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {currentSection.trust_or_objection_line ? (
              <div className={styles.trustBox}>
                <p className={styles.cardLabel}>Trust / Objection</p>
                <p>
                  {getLocalizedCopy(
                    currentSection.trust_or_objection_line,
                    currentSection.trust_or_objection_line_en,
                    defaultCopyLanguage
                  )}
                </p>
              </div>
            ) : null}

            {currentSection.CTA ? (
              <button className={styles.ctaPreview} type="button">
                {getLocalizedCopy(currentSection.CTA, currentSection.CTA_en, defaultCopyLanguage)}
              </button>
            ) : null}
          </div>
        );
      case "guide":
      default:
        return (
          <div className={styles.workbenchSectionStack}>
            <div className={styles.guidelineGrid}>
              <div>
                <strong>Guide Mode</strong>
                <p>{currentOptions.guidePriorityMode === "guide-first" ? "기획에 맞춰 자동 연출" : "선택한 배경으로 연출"}</p>
              </div>
              <div>
                <strong>Image Purpose</strong>
                <p>{currentSection.purpose}</p>
              </div>
              <div>
                <strong>Layout Notes</strong>
                <p>{currentOptions.guidePriorityMode === "guide-first" ? currentSection.layout_notes : "이번 생성에는 적용하지 않음"}</p>
              </div>
              <div>
                <strong>Style Guide</strong>
                <p>{currentOptions.guidePriorityMode === "guide-first" ? currentSection.style_guide : "이번 생성에는 적용하지 않음"}</p>
              </div>
            </div>

            {currentSection.compliance_notes ? (
              <div className={styles.warningBox}>
                <strong>Compliance Notes</strong>
                <p>{currentSection.compliance_notes}</p>
              </div>
            ) : null}
          </div>
        );
    }
  };

  const selectedModelSummary = currentOptions.withModel
    ? usesReferenceModel
      ? referenceModelUsage === "all-sections"
        ? "업로드 모델 일관성 유지"
        : "히어로우 업로드 모델 사용"
      : `${getModelCountryLabel(currentOptions.modelCountry)} ${getModelAgeLabel(currentOptions.modelAgeRange)} ${getModelGenderLabel(currentOptions.modelGender)}`
    : "모델 없이 제품 중심";

  const generateMissingImagesForSections = async (targetSections: PdpSection[]) => {
    if (isEditorBusy) return;
    const problems = targetSections.filter(section => !section.generatedImage || isPdpImageCopyStale(section)).flatMap(section => getPdpCopyIssues(section, getPdpSectionOutputMode(section, outputMode) === "full-image").map(issue => `${section.section_name}: ${issue}`));
    if (problems.length) { setErrorMessage(problems.slice(0, 4).join(' ')); return; }
    pauseBatchRef.current = false;
    setIsGeneratingAllImages(true);
    setErrorMessage("");
    const update = (id: string, patch: Partial<PdpSection>) => {
      setSections(current => current.map(section => section.section_id === id ? { ...section, ...patch } : section));
      setSectionImageErrorsById(current => { const next = { ...current }; if (patch.generation?.message) next[id] = patch.generation.message; else delete next[id]; return next; });
    };
    try {
      const summary = await runPdpImageQueue({
        sections: targetSections,
        regenerateChanged: true,
        config: { provider: aiProvider, model: aiProvider === "higgsfield" ? higgsfieldPreferences.higgsfieldImageModel : aiProvider === "openai" ? openAiImageModel : geminiImageModel, quality: aiProvider === "higgsfield" ? higgsfieldPreferences.higgsfieldImageQuality : aiProvider === "openai" ? openAiImageQuality : "default", aspectRatio, outputMode },
        shouldPause: () => pauseBatchRef.current,
        update,
        progress: (completed, total) => { setBatchProgress({ completed, total }); setNotice(`${completed}/${total}장 처리 · 완료된 이미지는 바로 저장됩니다.`); },
        generate: async (section, index) => {
          const sectionImageDefaults = getPdpSectionImageDefaults(section, index, targetSections.length, referenceModelUsage);
          const sectionSpecificOptions = normalizeImageOptions(
            sectionOptions[index],
            sectionImageDefaults
          );
          const referenceModelApplies = Boolean(
            referenceModelImage &&
              referenceModelUsage &&
              (referenceModelUsage === "all-sections" || index === 0)
          );
          const shouldUseReferenceModel = Boolean(sectionSpecificOptions.withModel && referenceModelApplies);
          if (aiProvider === "higgsfield") await validateHiggsfieldReferenceCount(higgsfieldPreferences.higgsfieldImageModel, 1 + (shouldUseReferenceModel ? 1 : 0));
          const response = await apiJson<PdpGenerateImageResponse>("/pdp/images", {
            method: "POST",
            body: JSON.stringify({
              originalImageBase64: sectionReference(section).base64,
              originalImageMimeType: sectionReference(section).mimeType,
              originalImageFileName: sectionReference(section).fileName,
              section: toGenerationSection(section),
              aspectRatio: getSellingSectionRatio(section, aspectRatio),
              desiredTone: desiredTone || undefined,
              options: {
                ...sectionSpecificOptions,
                imageModel: aiProvider === "higgsfield" ? higgsfieldPreferences.higgsfieldImageModel : aiProvider === "openai" ? openAiImageModel : geminiImageModel,
                higgsfieldImageQuality: higgsfieldPreferences.higgsfieldImageQuality,
                higgsfieldImageResolution: higgsfieldPreferences.higgsfieldImageResolution,
                higgsfieldImageVariant: higgsfieldPreferences.higgsfieldImageVariant,
                imageQuality: openAiImageQuality,
                aiProvider,
                outputMode: getPdpSectionOutputMode(section, outputMode),
                headline: section.headline,
                subheadline: section.subheadline,
                isRegeneration: false,
                referenceModelImageBase64: shouldUseReferenceModel ? referenceModelImage?.base64 : undefined,
                referenceModelImageMimeType: shouldUseReferenceModel ? referenceModelImage?.mimeType : undefined,
                referenceModelImageFileName: shouldUseReferenceModel ? referenceModelImage?.fileName : undefined
              }
            })
          }, { geminiApiKey, openAiApiKey, timeoutMs: aiProvider === "higgsfield" ? HIGGSFIELD_GENERATION_API_TIMEOUT_MS : GENERATION_API_TIMEOUT_MS });

          if (!response.ok) {
            const detail = response.detail ? ` ${response.detail}` : "";
            throw new PdpRequestError(`${getDisplaySectionName(section)}: ${response.message}${detail}`, isUncertainGenerationError(response.code));
          }

          return { image: toDataUrl(response.mimeType, response.imageBase64), reviewRequired: response.reviewRequired, qualityReview: response.qualityReview, usage: response.usage };
        }
      });
      setNotice(`이미지 수신 ${summary.succeeded}장 · 요청 실패 ${summary.failed}장 · 응답 확인 필요 ${summary.unknown}장 · 대기 ${summary.queued}장. 받은 이미지는 보존합니다. 필요한 경우에만 개별 문구·제품 검사를 실행하세요.`);
    } finally {
      setIsGeneratingAllImages(false);
    }
  };

  const handleGenerateMissingImages = () => {
    if (isPlanningPlaceholder) { continuePlanning(); return; }
    if (sections.some(section => !section.generatedImage && section.generation?.status === "unknown")) {
      setNotice("응답을 확인하지 못한 장은 제외합니다. 공급자 사용량을 확인한 후 해당 장에서 재생성을 선택해 주세요.");
    }
    void generateMissingImagesForSections(sections);
  };

  const handleGenerateImage = async () => {
    if (isPlanningPlaceholder) { continuePlanning(); return; }
    if (isEditorBusy) return;
    const issues = getPdpCopyIssues(currentSection, isCompleteMode);
    if (issues.length) { setErrorMessage(issues.join(' ')); return; }

    setIsGeneratingImage(true);
    setErrorMessage("");
    setSectionImageErrorsById((current) => {
      const next = { ...current };
      delete next[currentSection.section_id];
      return next;
    });
    const generationStartedAt = Date.now();
    const generation = { status: "running" as const, attempts: (currentSection.generation?.attempts ?? 0) + 1, updatedAt: new Date().toISOString(), provider: aiProvider, model: aiProvider === "higgsfield" ? higgsfieldPreferences.higgsfieldImageModel : aiProvider === "openai" ? openAiImageModel : geminiImageModel, quality: aiProvider === "higgsfield" ? higgsfieldPreferences.higgsfieldImageQuality : aiProvider === "openai" ? openAiImageQuality : "1K", aspectRatio: getSellingSectionRatio(currentSection, aspectRatio), outputMode: getPdpSectionOutputMode(currentSection, outputMode) };
    const generationSectionId = currentSection.section_id;
    setSections(current => current.map(section => section.section_id === generationSectionId ? { ...section, generation } : section));
    logEditorEvent("editor.current_image_generation_started", {
      isRegeneration: Boolean(currentSection.generatedImage),
      withModel: Boolean(currentOptions.withModel),
      usesReferenceModel,
      guidePriorityMode: currentOptions.guidePriorityMode,
      style: currentOptions.style
    });

    try {
      if (aiProvider === "higgsfield") await validateHiggsfieldReferenceCount(higgsfieldPreferences.higgsfieldImageModel, 1 + (usesReferenceModel ? 1 : 0) + (currentOptions.editInstruction?.trim() && currentSection.generatedImage ? 1 : 0));
      const response = await apiJson<PdpGenerateImageResponse>("/pdp/images", {
        method: "POST",
        body: JSON.stringify({
          originalImageBase64: sectionReference(currentSection).base64,
          originalImageMimeType: sectionReference(currentSection).mimeType,
          originalImageFileName: sectionReference(currentSection).fileName,
          section: toGenerationSection(currentSection),
          aspectRatio: getSellingSectionRatio(currentSection, aspectRatio),
          desiredTone: desiredTone || undefined,
          options: {
            ...currentOptions,
            imageModel: aiProvider === "higgsfield" ? higgsfieldPreferences.higgsfieldImageModel : aiProvider === "openai" ? openAiImageModel : geminiImageModel,
                higgsfieldImageQuality: higgsfieldPreferences.higgsfieldImageQuality,
                higgsfieldImageResolution: higgsfieldPreferences.higgsfieldImageResolution,
                higgsfieldImageVariant: higgsfieldPreferences.higgsfieldImageVariant,
            imageQuality: openAiImageQuality,
            aiProvider,
            outputMode: getPdpSectionOutputMode(currentSection, outputMode),
            headline: currentSection.headline,
            subheadline: currentSection.subheadline,
            isRegeneration: Boolean(currentSection.generatedImage),
            baseImageBase64: currentOptions.editInstruction?.trim() ? currentSection.generatedImage : undefined,
            referenceModelImageBase64: usesReferenceModel ? referenceModelImage?.base64 : undefined,
            referenceModelImageMimeType: usesReferenceModel ? referenceModelImage?.mimeType : undefined,
            referenceModelImageFileName: usesReferenceModel ? referenceModelImage?.fileName : undefined
          }
        })
      }, { geminiApiKey, openAiApiKey, timeoutMs: aiProvider === "higgsfield" ? HIGGSFIELD_GENERATION_API_TIMEOUT_MS : GENERATION_API_TIMEOUT_MS });

      setIsGeneratingImage(false);

      if (!response.ok) throw new PdpRequestError(response.message, isUncertainGenerationError(response.code));

      setSections((current) =>
        current.map((section, index) =>
          section.section_id === generationSectionId
            ? {
                ...section,
                previousGeneratedImage: section.generatedImage,
                imageCopySignature: getPdpImageCopySignature(currentSection),
                qualityReview: response.qualityReview,
                referenceReviewRequired: Boolean(response.reviewRequired),
                generation: { ...generation, status: "succeeded", usage: response.usage, updatedAt: new Date().toISOString(), elapsedMs: Date.now() - generationStartedAt, message: response.reviewRequired ? "인물 참조 일치를 확인해 주세요. 자동 추가 생성은 수행하지 않았습니다." : undefined },
                generatedImage: toDataUrl(response.mimeType, response.imageBase64)
              }
            : section
        )
      );
      setSectionImageErrorsById((current) => {
        const next = { ...current };
        delete next[currentSection.section_id];
        return next;
      });
      setNotice(`${getDisplaySectionName(currentSection)} 이미지를 새 옵션으로 업데이트했습니다.`);
      logEditorEvent("editor.current_image_generation_completed", {
        isRegeneration: Boolean(currentSection.generatedImage),
        durationMs: Date.now() - generationStartedAt
      });
    } catch (error) {
      setIsGeneratingImage(false);
      const message = error instanceof Error ? error.message : "이미지를 다시 만들지 못했습니다.";
      setSections(current => current.map(section => section.section_id === generationSectionId ? { ...section, generation: { ...generation, status: error instanceof PdpRequestError && error.outcomeUnknown ? "unknown" : "failed", updatedAt: new Date().toISOString(), elapsedMs: Date.now() - generationStartedAt, message } } : section));
      setErrorMessage(message);
      setSectionImageErrorsById((current) => ({
        ...current,
        [currentSection.section_id]: message
      }));
      logEditorEvent(
        "editor.current_image_generation_failed",
        { durationMs: Date.now() - generationStartedAt },
        "error",
        error instanceof Error ? error : String(error)
      );
    }
  };

  const handleAddTextOverlay = (
    translations: Record<PdpCopyLanguage, string>,
    type: "headline" | "subheadline" | "keypoint" | "default" = "default"
  ) => {
    if (isCompleteMode) {
      setErrorMessage("통이미지 모드는 텍스트가 이미지 안에 포함된 결과입니다. 문구 변경은 이미지 옵션에서 다시 생성해 주세요.");
      logEditorEvent("editor.text_layer_add_blocked", { reason: "full_image_mode", type }, "warn");
      return;
    }

    if (!currentSection.generatedImage) {
      setErrorMessage("이미지를 먼저 생성해야 텍스트를 올릴 수 있습니다.");
      logEditorEvent("editor.text_layer_add_blocked", { reason: "missing_generated_image", type }, "warn");
      return;
    }

    const defaultFontSize =
      type === "headline" ? 42 : type === "subheadline" ? 24 : type === "keypoint" ? 18 : 20;
    const normalizedTranslations = type === "keypoint"
      ? {
          ko: `• ${translations.ko}`,
          en: `• ${translations.en}`
        }
      : translations;
    const displayText = normalizedTranslations[defaultCopyLanguage] || normalizedTranslations.ko;
    const defaultFontWeight = type === "subheadline" ? "500" : "700";
    const estimatedBox = estimateOverlayBox(displayText, {
      fontSize: defaultFontSize,
      fontWeight: defaultFontWeight,
      fontFamily: "'Pretendard', sans-serif",
      lineHeight: 1.2,
      maxWidth: type === "headline" ? 360 : type === "subheadline" ? 320 : 280
    });

    const newOverlay: TextOverlay = {
      id: crypto.randomUUID(),
      kind: "text",
      text: displayText,
      language: defaultCopyLanguage,
      translations: normalizedTranslations,
      x: 52,
      y: 52,
      width: estimatedBox.width,
      height: estimatedBox.height,
      fontSize: defaultFontSize,
      color: "#ffffff",
      backgroundColor: shapeColorRecommendations[0] ?? "#102532",
      backgroundEnabled: false,
      backgroundOpacity: 0.72,
      backgroundRadius: 18,
      fontFamily: "'Pretendard', sans-serif",
      fontWeight: defaultFontWeight,
      textAlign: "left",
      lineHeight: 1.2,
      shadowEnabled: true,
      shadowColor: colorRecommendations.darkColor,
      shadowOpacity: 0.42,
      shadowBlur: 18,
      shadowOffsetY: 6
    };

    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: [...(current[currentSectionIndex] ?? []), normalizeTextOverlay(newOverlay)]
    }));
    setSelectedOverlayId(newOverlay.id);
    setWorkbenchState((current) => ({
      ...current,
      isOpen: true
    }));
    setNotice("텍스트를 추가했습니다. 위치와 크기를 직접 조절해 레이아웃을 완성해 보세요.");
    logEditorEvent("editor.text_layer_added", {
      type,
      layerCount: currentLayers.length + 1
    });
  };

  const handleAddShapeLayer = () => {
    if (isCompleteMode) {
      setErrorMessage("통이미지 모드는 배경 오브젝트를 별도 레이어로 올리지 않습니다. 이미지 옵션에서 다시 생성해 주세요.");
      logEditorEvent("editor.shape_layer_add_blocked", { reason: "full_image_mode" }, "warn");
      return;
    }

    if (!currentSection.generatedImage) {
      setErrorMessage("이미지를 먼저 생성해야 배경 사각형을 배치할 수 있습니다.");
      logEditorEvent("editor.shape_layer_add_blocked", { reason: "missing_generated_image" }, "warn");
      return;
    }

    const newShape: ShapeLayer = normalizeShapeLayer({
      id: crypto.randomUUID(),
      kind: "shape",
      x: 64,
      y: 64,
      width: 260,
      height: 120,
      fillColor: shapeColorRecommendations[0] ?? colorRecommendations.darkColor,
      fillOpacity: 1,
      borderRadius: 0
    });

    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: [...(current[currentSectionIndex] ?? []), newShape]
    }));
    setSelectedOverlayId(newShape.id);
    setEditingOverlayId(null);
    setWorkbenchTab("layer");
    setWorkbenchState((current) => ({
      ...current,
      isOpen: true
    }));
    setNotice("배경 사각형을 추가했습니다. 드래그와 리사이즈로 자유롭게 레이아웃을 만들 수 있습니다.");
    logEditorEvent("editor.shape_layer_added", {
      layerCount: currentLayers.length + 1
    });
  };

  const [copyCompletion, setCopyCompletion] = useState('');
  useEffect(() => { if (!copyCompletion) return; const timer = window.setTimeout(() => setCopyCompletion(''), 3500); return () => window.clearTimeout(timer); }, [copyCompletion]);

  const requestProductCopy = async (targets: PdpCopyPlanRequest['sections'], mode: 'expand' | 'rewrite' | 'add' | 'single', insertIndex = 0) => {
    if (pendingCopyPlan) { setPendingCopyPlan(current => current ? { ...current, reviewOpen: true } : current); return; }
    if (copyRequestRef.current || isEditorGeneratingImage) return;
    copyRequestRef.current = true;
    setIsWritingCopy(true);
    setWritingCopyInfo({ mode, names: targets.map(target => target.section_name), startedAt: Date.now() });
    setErrorMessage('');
    setNotice('');
    setPendingCopyPlan(null);
    const snapshot = JSON.stringify(sections.map(section => [section.section_id, section.headline, section.subheadline, section.bullets, section.purpose]));
    try {
      const original = await preparePdpReviewImage(primaryAnalysisImage?.base64 ?? initialResult.originalImage, primaryAnalysisImage?.mimeType ?? initialResult.originalImageMimeType);
      const response = await apiJson<{ ok: true; plan: PdpCopyPlan } | { ok: false; message: string }>('/pdp/copy', {
        method: 'POST', body: JSON.stringify({ originalImageBase64: original.base64, originalImageMimeType: original.mimeType,
          sourceMaterials, additionalInfo, desiredTone, customerReviewAnalysis, aiProvider, outputMode, sections: targets, storyContext: mode === 'add' ? buildPdpStoryContext(sections, 'insert', insertIndex) : mode === 'single' ? buildPdpStoryContext(sections, 'replace', sections.findIndex(section => section.section_id === targets[0]?.section_id)) : undefined })
      }, { geminiApiKey, openAiApiKey, timeoutMs: 330000 });
      if (!response.ok) throw new Error(response.message);
      setPendingCopyPlan({ plan: response.plan, mode, insertIndex, snapshot });
      setWorkbenchTab('image');
      setWorkbenchState(current => ({ ...current, isOpen: true }));
      setIsSectionPickerOpen(false);
      setNotice('');
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : '카피 작성에 실패했습니다. 기존 작업은 유지됩니다.'); }
    finally { copyRequestRef.current = false; setIsWritingCopy(false); setWritingCopyInfo(null); }
  };

  const applyProductCopy = () => {
    if (!pendingCopyPlan || isEditorBusy) return;
    const snapshot = JSON.stringify(sections.map(section => [section.section_id, section.headline, section.subheadline, section.bullets, section.purpose]));
    if (snapshot !== pendingCopyPlan.snapshot) { setErrorMessage('작성 중 원본 카피나 섹션이 변경됐습니다. 현재 작업을 기준으로 다시 작성해 주세요.'); return; }
    const authored = pendingCopyPlan.plan.sections.map(next => {
      const old = sections.find(section => section.section_id === next.section_id);
      return normalizeSectionCopyFields({ ...old, ...next,
        copyPresentation: old?.generatedImage ? old.copyPresentation : next.copyPresentation,
        generatedImage: old?.generatedImage, previousGeneratedImage: old?.previousGeneratedImage, originalProduct: old?.originalProduct, generation: old?.generation,
        imageCopySignature: old?.generatedImage ? old.imageCopySignature || getPdpImageCopySignature(old) : undefined,
        qualityReview: old?.qualityReview
      });
    });
    if (pendingCopyPlan.mode === 'single') {
      setSectionIssues(current => { const next = { ...current }; for (const section of authored) delete next[section.section_id]; return next; });
      const replacements = new Map(authored.map(section => [section.section_id, section]));
      setSections(current => current.map(section => replacements.get(section.section_id) ?? section));
    } else if (pendingCopyPlan.mode === 'add') {
      const at = pendingCopyPlan.insertIndex;
      setSections(current => [...current.slice(0, at), ...authored, ...current.slice(at)]);
      setSectionOptions(current => shiftIndexedRecordForInsert(current, at));
      setOverlaysBySection(current => shiftIndexedRecordForInsert(current, at));
      setCurrentSectionIndex(at);
    } else if (pendingCopyPlan.mode === 'expand') {
      setSections([sections[0], ...authored]);
      setCurrentSectionIndex(1);
    } else {
      setSections(authored);
    }
    setPendingCopyPlan(null);
    setNotice('');
    setCopyCompletion(`${authored.length}개 카피 작성이 완료되었습니다.`);
    // 서버 카피 응답은 검수를 기다리지 않는다. 적용된 구간만 뒤에서 배지 검수한다.
    setSectionIssues(current => { const next = { ...current }; for (const section of authored) delete next[section.section_id]; return next; });
    reviewTargetIdsRef.current = authored.map(section => section.section_id);
    setDraftReview({ status: 'pending' });
  };

  useEffect(() => {
    if (pendingCopyPlan && !isEditorBusy) applyProductCopy();
  }, [pendingCopyPlan, isEditorBusy]);

  const [reviewIntakeOpen, setReviewIntakeOpen] = useState(false);
  const openReviewRegistration = () => {
    setReviewIntakeOpen(false);
    onReviewMaterials?.();
    window.setTimeout(() => {
      const section = document.getElementById('customer-review-upload-section');
      const details = section?.closest('details');
      if (details) details.open = true;
      section?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 150);
  };
  // 예시 후기는 고정 문장 대신 이 상품 자료에 맞춰 쓰고, 통이미지(후기 카드 디자인)로 만든다. 서버가 가상 예시 표기를 붙인다.
  const addExampleReviews = () => {
    const id = `review_example_${Date.now()}`;
    setReviewIntakeOpen(false); setIsSectionPickerOpen(false);
    void requestProductCopy([{ section_id: id, section_name: '고객 후기 · 예시', goal: '실제 후기를 등록하기 전 편집용 가상 예시 후기. 이 상품을 써 본 고객이 제품 자체에 느낀 만족 감상 3개(맛·식감·촉감·편리함·만족감). 활용법·곁들임·구성 설명 금지. 실제 후기·별점·작성자·효능 표시 금지.',
      decisionDesign: { id, name: '고객 후기 · 예시', question: '실제로 써 본 사람은 이 상품 자체를 어떻게 느꼈을까?', answer: '상품 자료 기반의 편집용 가상 예시 인용', factIds: [], visual: 'lifestyle', visualBrief: '제품이 놓인 사용 장면 사진과 큰 인용 카드', hypothesis: '', beat: 'success',
        persuasion: { job: 'desire', beliefBefore: '', beliefAfter: '', mechanism: '', basis: 'customer-hypothesis' } } }], 'add', currentSectionIndex + 1);
  };

  const handleAddSection = (definition: ManualSectionOption) => {
    if (definition.id === 'review' && !customerReviewAnalysis?.sampleReviews.length) { setErrorMessage(''); setReviewIntakeOpen(true); setIsSectionPickerOpen(false); return; }
    void requestProductCopy([{ section_id: `S${sections.length + 1}_${definition.idToken}_${Date.now().toString(36)}`, section_name: definition.sectionName, goal: definition.goal }], 'add', currentSectionIndex + 1);
  };

  const restoreComposition = () => {
    if (!previousComposition || isEditorBusy) return;
    const current = { sections, sectionOptions, overlaysBySection, outputMode };
    onOutputModeChange?.(previousComposition.outputMode ?? outputMode);
    setSections(previousComposition.sections); setSectionOptions(previousComposition.sectionOptions);
    setOverlaysBySection(previousComposition.overlaysBySection); setPreviousComposition(current); setCurrentSectionIndex(0);
    setErrorMessage('');
    setNotice('이전 구성을 복원했습니다. 방금 작업한 구성도 다시 복원할 수 있습니다.');
  };

  const handleRewriteCopy = () => {
    void requestProductCopy(sections.map(section => ({ section_id: section.section_id, section_name: section.section_name, goal: section.goal || section.section_name, decisionDesign: section.decisionDesign })), 'rewrite');
  };

  const handleReviewImage = async () => {
    if (!currentSection.generatedImage || isEditorBusy) return;
    const target = currentSection;
    const signature = getPdpImageCopySignature(target);
    setIsReviewingImage(true);
    setReviewFeedback(null);
    setErrorMessage('');
    setNotice('현재 이미지의 문구와 제품을 검사하고 있습니다.');
    revealReviewResult();
    try {
      const [original, generated] = await Promise.all([
        preparePdpReviewImage(sectionReference(target).base64, sectionReference(target).mimeType),
        preparePdpReviewImage(target.generatedImage!)
      ]);
      const response = await apiJson<{ ok: true; review: PdpImageQualityReview } | { ok: false; message: string }>('/pdp/image-review', { method: 'POST', body: JSON.stringify({
        originalImageBase64: original.base64, originalImageMimeType: original.mimeType,
        imageBase64: generated.base64, mimeType: generated.mimeType,
        section: toGenerationSection(target), aiProvider, outputMode: getPdpSectionOutputMode(target, outputMode)
      }) }, { geminiApiKey, openAiApiKey, timeoutMs: 180000 });
      if (!response.ok) throw new Error(response.message);
      setSections(current => current.map(section => section.section_id === target.section_id && section.generatedImage === target.generatedImage && getPdpImageCopySignature(section) === signature ? { ...section, qualityReview: response.review } : section));
      setErrorMessage('');
      setNotice(response.review.status === 'passed' ? '문구·제품 검사 통과. 나머지 이미지 생성을 진행할 수 있습니다.' : '검사가 완료되었습니다. 검사 버튼 아래의 상세 결과를 확인해 주세요.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '검사 결과를 확인하지 못했습니다.';
      setReviewFeedback({ sectionId: target.section_id, error: message });
      setErrorMessage(message);
      setNotice('검사를 완료하지 못했습니다. 검사 버튼 아래의 오류를 확인해 주세요.');
    }
    finally { setIsReviewingImage(false); revealReviewResult(); }
  };


  const handleDuplicateCurrentSection = () => {
    const insertIndex = currentSectionIndex + 1;
    const sectionId = `${currentSection.section_id}_Copy_${Date.now().toString(36)}`;
    const duplicatedSection = normalizeSectionCopyFields({
      ...currentSection,
      section_id: sectionId,
      image_id: `IMG_${sectionId}`,
      section_name: `${getDisplaySectionName(currentSection)} 복제`
    });
    const clonedLayers = currentLayers.map(cloneCanvasLayer);

    setSections((current) => [...current.slice(0, insertIndex), duplicatedSection, ...current.slice(insertIndex)]);
    setSectionOptions((current) => shiftIndexedRecordForInsert(current, insertIndex, currentOptions));
    setOverlaysBySection((current) => shiftIndexedRecordForInsert(current, insertIndex, clonedLayers));
    setCurrentSectionIndex(insertIndex);
    setSelectedOverlayId(null);
    setWorkbenchTab("image");
    setNotice("현재 섹션을 복제했습니다. 같은 레이아웃에서 문구와 이미지만 빠르게 바꿀 수 있습니다.");
    logEditorEvent("editor.section_duplicated", {
      insertIndex,
      clonedLayerCount: clonedLayers.length,
      nextSectionCount: sections.length + 1
    });
  };

  const handleSectionDragStart = (event: ReactDragEvent<HTMLDivElement>, index: number) => {
    if (isEditorGeneratingImage || sections.length <= 1) {
      event.preventDefault();
      return;
    }

    setDraggedSectionIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleSectionDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (draggedSectionIndex === null || isEditorGeneratingImage) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleSectionDrop = (event: ReactDragEvent<HTMLDivElement>, dropIndex: number) => {
    event.preventDefault();
    const rawIndex = event.dataTransfer.getData("text/plain");
    const fromIndex = rawIndex ? Number(rawIndex) : Number.NaN;
    const resolvedFromIndex = Number.isFinite(fromIndex) ? fromIndex : draggedSectionIndex;

    setDraggedSectionIndex(null);

    if (
      resolvedFromIndex === null ||
      !Number.isInteger(resolvedFromIndex) ||
      resolvedFromIndex < 0 ||
      resolvedFromIndex >= sections.length ||
      dropIndex < 0 ||
      dropIndex >= sections.length ||
      resolvedFromIndex === dropIndex
    ) {
      return;
    }

    setSections((current) => moveArrayItem(current, resolvedFromIndex, dropIndex));
    setSectionOptions((current) => moveIndexedRecordItem(current, resolvedFromIndex, dropIndex, sections.length));
    setOverlaysBySection((current) => moveIndexedRecordItem(current, resolvedFromIndex, dropIndex, sections.length));
    setCurrentSectionIndex((current) => getIndexAfterMove(current, resolvedFromIndex, dropIndex));
    setSelectedOverlayId(null);
    setEditingOverlayId(null);
    setActiveColorPalette(null);
    setNotice(`${getDisplaySectionName(sections[resolvedFromIndex])} 섹션을 ${dropIndex + 1}번째 위치로 이동했습니다.`);
    logEditorEvent("editor.section_reordered", {
      fromIndex: resolvedFromIndex,
      toIndex: dropIndex,
      sectionId: sections[resolvedFromIndex]?.section_id ?? "unknown"
    });
  };

  const handleSectionDragEnd = () => {
    setDraggedSectionIndex(null);
  };

  const requestDeleteSection = (sectionIndex: number) => {
    if (sections.length <= 1) {
      setNotice("마지막 섹션은 삭제할 수 없습니다. 상세페이지에는 최소 1개 섹션이 필요합니다.");
      logEditorEvent("editor.section_delete_blocked", {
        reason: "last_section",
        sectionIndex
      }, "warn");
      return;
    }

    setPendingDeleteSectionIndex(sectionIndex);
  };

  const cancelDeleteSection = () => {
    setPendingDeleteSectionIndex(null);
  };

  const confirmDeleteSection = () => {
    if (pendingDeleteSectionIndex === null) {
      return;
    }

    if (sections.length <= 1) {
      cancelDeleteSection();
      setNotice("마지막 섹션은 삭제할 수 없습니다.");
      return;
    }

    const deleteIndex = pendingDeleteSectionIndex;
    const deletedSection = sections[deleteIndex];

    setSections((current) => current.filter((_, index) => index !== deleteIndex));
    setSectionOptions((current) => shiftIndexedRecordForDelete(current, deleteIndex));
    setOverlaysBySection((current) => shiftIndexedRecordForDelete(current, deleteIndex));
    setCurrentSectionIndex((current) => {
      if (current > deleteIndex) {
        return current - 1;
      }

      return Math.min(current, sections.length - 2);
    });
    setSelectedOverlayId(null);
    setEditingOverlayId(null);
    setActiveColorPalette(null);
    setWorkbenchTab("image");
    setPendingDeleteSectionIndex(null);
    setNotice(`${deletedSection ? getDisplaySectionName(deletedSection) : "선택한"} 섹션을 삭제했습니다.`);
    logEditorEvent("editor.section_deleted", {
      deletedSectionId: deletedSection?.section_id ?? "unknown",
      deletedSectionName: deletedSection ? getDisplaySectionName(deletedSection) : "unknown",
      nextSectionCount: Math.max(0, sections.length - 1)
    });
  };

  const updateOverlay = (overlayId: string, updates: Partial<CanvasLayer>) => {
    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: (current[currentSectionIndex] ?? []).map((overlay) =>
        overlay.id === overlayId ? normalizeCanvasLayer({ ...overlay, ...updates }) : overlay
      )
    }));
  };

  const handleResizeStart = (overlay: CanvasLayer) => {
    resizeSessionRef.current[overlay.id] = {
      width: toNumericSize(overlay.width, 320),
      height: toNumericSize(overlay.height, 92),
      fontSize: isTextLayer(overlay) ? overlay.fontSize : 0
    };
  };

  const handleResize = (
    overlay: CanvasLayer,
    direction: string,
    ref: HTMLElement,
    position: { x: number; y: number },
    displayScale = 1
  ) => {
    const normalizedScale = displayScale > 0 ? displayScale : 1;
    const base = resizeSessionRef.current[overlay.id] ?? {
      width: toNumericSize(overlay.width, 320),
      height: toNumericSize(overlay.height, 92),
      fontSize: isTextLayer(overlay) ? overlay.fontSize : 0
    };

    const nextWidth = ref.offsetWidth / normalizedScale;
    const nextHeight = ref.offsetHeight / normalizedScale;
    const nextPosition = {
      x: position.x / normalizedScale,
      y: position.y / normalizedScale
    };
    const isHorizontalOnly = direction === "left" || direction === "right";
    const isVerticalOnly = direction === "top" || direction === "bottom";

    if (isHorizontalOnly) {
      updateOverlay(overlay.id, {
        width: nextWidth,
        x: nextPosition.x
      });
      return;
    }

    if (isVerticalOnly) {
      updateOverlay(overlay.id, {
        height: nextHeight,
        y: nextPosition.y
      });
      return;
    }

    if (isShapeLayer(overlay)) {
      updateOverlay(overlay.id, {
        width: nextWidth,
        height: nextHeight,
        x: nextPosition.x,
        y: nextPosition.y
      });
      return;
    }

    const resizeScale = Math.max(nextWidth / Math.max(base.width, 1), nextHeight / Math.max(base.height, 1));
    const nextFontSize = clampValue(Math.round(base.fontSize * resizeScale), 10, 180);

    updateOverlay(overlay.id, {
      width: nextWidth,
      height: nextHeight,
      x: nextPosition.x,
      y: nextPosition.y,
      fontSize: nextFontSize
    });
  };

  const handleResizeStop = (overlayId: string) => {
    delete resizeSessionRef.current[overlayId];
  };

  const handleOverlayDrag = (overlay: CanvasLayer, x: number, y: number) => {
    const normalizedScale = canvasScale > 0 ? canvasScale : 1;
    updateOverlay(overlay.id, {
      x: x / normalizedScale,
      y: y / normalizedScale
    });
  };

  const captureSectionBlob = async (sectionIndex: number) => {
    const section = sections[sectionIndex];
    if (!section?.generatedImage) {
      throw new Error("이미지가 없는 섹션은 다운로드할 수 없습니다.");
    }

    const width = EXPORT_CANVAS_WIDTH;
    const layers = getPdpSectionOutputMode(section, outputMode) === "full-image" ? [] : overlaysBySection[sectionIndex] ?? [];
    const exportNode = await buildExportNode({
      imageSrc: section.generatedImage,
      width,
      layers,
      originalProduct: section.originalProduct,
      originalImage: originalImageSrc,
      reviewEditorialHeight: layers.some(layer => layer.id.startsWith("review-editorial-")) ? getCanvasBaseHeight(getSellingSectionRatio(section, aspectRatio)) : undefined,
      layerScale: width / EDITOR_CANVAS_BASE_WIDTH
    });

    document.body.appendChild(exportNode);

    try {
      // Wait for Pretendard (loaded via a remote CDN @import) to finish loading before
      // rasterizing. Otherwise html2canvas can capture fallback-font glyphs/metrics,
      // which shifts and re-wraps Korean text in the exported image. FONT_WEIGHT_OPTIONS
      // only exposes 400/500/700/900, so preloading those covers every selectable weight.
      if (typeof document !== "undefined" && document.fonts) {
        try {
          await Promise.all(
            ["400", "500", "700", "900"].map((weight) => document.fonts.load(`${weight} 16px Pretendard`))
          );
        } catch {
          // Ignore individual font-load failures; fall back to whatever is already available.
        }
        try {
          await document.fonts.ready;
        } catch {
          // Never block the export on font readiness.
        }
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      const canvas = await html2canvas(exportNode, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 1
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });

      if (!blob) {
        throw new Error("다운로드용 이미지를 만들지 못했습니다.");
      }

      return blob;
    } finally {
      exportNode.remove();
    }
  };

  const handleDownload = async () => {
    if (!currentSection.generatedImage) {
      logEditorEvent("editor.current_section_download_blocked", { reason: "missing_generated_image" }, "warn");
      return;
    }

    try {
      logEditorEvent("editor.current_section_download_started");
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
      setActiveColorPalette(null);
      const blob = await captureSectionBlob(currentSectionIndex);
      downloadBlob(blob, `pdp-${sanitizeSectionFileName(currentSection.section_id)}.jpg`);
      setNotice(`${getDisplaySectionName(currentSection)} 컷을 다운로드했습니다.`);
      logEditorEvent("editor.current_section_downloaded", {
        blobSize: blob.size
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이미지를 다운로드하지 못했습니다.");
      logEditorEvent("editor.current_section_download_failed", undefined, "error", error instanceof Error ? error : String(error));
    }
  };

  const handleDownloadAll = async () => {
    const downloadableSections = sections
      .map((section, index) => ({ section, index }))
      .filter((entry) => Boolean(entry.section.generatedImage));

    if (!downloadableSections.length) {
      setErrorMessage("다운로드할 이미지가 아직 없습니다.");
      logEditorEvent("editor.all_sections_download_blocked", { reason: "no_downloadable_sections" }, "warn");
      return;
    }

    try {
      setIsDownloadingAll(true);
      logEditorEvent("editor.all_sections_download_started", {
        downloadableCount: downloadableSections.length
      });
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
      setActiveColorPalette(null);

      const zip = new JSZip();

      for (const { section, index } of downloadableSections) {
        const blob = await captureSectionBlob(index);
        zip.file(`pdp-${String(index + 1).padStart(2, "0")}-${sanitizeSectionFileName(section.section_id)}.jpg`, blob);
      }

      const archive = await zip.generateAsync({ type: "blob" });
      downloadBlob(archive, `pdp-sections-${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice(`${downloadableSections.length}개 섹션 이미지를 ZIP으로 다운로드했습니다.`);
      logEditorEvent("editor.all_sections_downloaded", {
        downloadableCount: downloadableSections.length,
        zipSize: archive.size
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "전체 이미지를 ZIP으로 다운로드하지 못했습니다.");
      logEditorEvent("editor.all_sections_download_failed", {
        downloadableCount: downloadableSections.length
      }, "error", error instanceof Error ? error : String(error));
    } finally {
      setIsDownloadingAll(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.editorShell} onClick={clearLayerSelection}>
        <header className={`${styles.editorHeader} ${styles.editorTopbar}`} onClick={stopShellClick}>
          <div className={styles.editorTopbarBrand}>
            <button className={styles.brandHomeButton} onClick={onReset} type="button" aria-label="처음 화면으로 이동">
              <span className={styles.brandMark} aria-hidden="true">마</span>
              <h1 className={styles.editorHeading}>{APP_TITLE}</h1>
            </button>
            <span className={styles.editorSaveStatus} role="status">
              <i className={saveState === "error" ? styles.saveDotError : saveState === "saving" ? styles.saveDotBusy : styles.saveDotOk} aria-hidden="true" />
              {saveState === "saving" ? "저장 중…" : saveState === "error" ? "저장 실패 · 다시 저장해 주세요" : lastSavedAt ? `저장됨 · ${formatSavedAt(lastSavedAt)}` : "아직 저장 전"}
            </span>
          </div>

          <div className={styles.topbarActions}>
            {onOpenSettings ? <button className={`${styles.secondaryButton} ${styles.headerActionButton}`} onClick={() => { setIsHeaderMenuOpen(false); onOpenSettings(); }} type="button"><Settings2 size={14} />API 연결</button> : null}
            {onManualSave ? (
              <button className={`${styles.secondaryButton} ${styles.headerActionButton} ${styles.headerSaveButton}`} disabled={saveState === "saving"} onClick={onManualSave} type="button">
                {saveState === "saving" ? <Loader2 className={styles.spinIcon} size={14} /> : <Save size={14} />}
                작업 저장하기
              </button>
            ) : null}
            <button
              className={`${styles.secondaryButton} ${styles.headerActionButton} ${styles.zipDownloadButton}`}
              disabled={!generatedCount || isDownloadingAll}
              onClick={handleDownloadAll}
              title={sections.length - generatedCount > 0 ? `이미지가 있는 ${generatedCount}장만 ZIP에 담겨요 · 미생성 ${sections.length - generatedCount}장 제외` : `${generatedCount}장 ZIP`}
              type="button"
            >
              {isDownloadingAll ? <Loader2 className={styles.spinIcon} size={14} /> : <Download size={14} />}
              전체 이미지 다운 · {generatedCount}장
            </button>
            <button
              className={`${styles.primaryButton} ${styles.headerActionButton} ${styles.currentDownloadButton}`}
              onClick={handleDownload}
              type="button"
              disabled={!currentSection.generatedImage}
            >
              <Download size={14} />
              현재 이미지 다운
            </button>
            <div className={styles.topbarMenuWrap} ref={headerMenuRef}>
              <button
                aria-controls="pdp-editor-menu"
                aria-expanded={isHeaderMenuOpen}
                aria-haspopup="menu"
                aria-label={isHeaderMenuOpen ? "작업 메뉴 닫기" : "작업 메뉴 열기"}
                className={`${styles.secondaryButton} ${styles.topbarMenuButton}`}
                onClick={() => setIsHeaderMenuOpen((current) => !current)}
                type="button"
              >
                {isHeaderMenuOpen ? <X size={16} /> : <Menu size={16} />}
              </button>
              <div className={`${styles.topbarMenu} ${isHeaderMenuOpen ? styles.topbarMenuOpen : ""}`} id="pdp-editor-menu">
                {onOpenSettings ? (
                  <button className={styles.topbarMenuItem} onClick={() => { setIsHeaderMenuOpen(false); onOpenSettings(); }} type="button">
                    <Settings2 size={16} />
                    <span>API 키 및 모델 설정<small>Gemini · OpenAI 키, Higgsfield 계정</small></span>
                  </button>
                ) : null}
                {menuExtras ? (
                  <div className={styles.topbarMenuBackup}>
                    <span className={styles.topbarMenuLabel}>작업 백업 · 키를 뺀 JSON (이미지 ZIP과 별개)</span>
                    {menuExtras}
                  </div>
                ) : null}
                <a className={styles.topbarMenuItem} href="/pdp-guide.html" target="_blank" rel="noreferrer" onClick={() => setIsHeaderMenuOpen(false)}>
                  <Info size={16} />
                  <span>3.1 시작 안내</span>
                </a>
              </div>
            </div>
          </div>
        </header>

        {showSaveToast ? <div className={styles.saveToast}>저장되었습니다.</div> : null}

        <div className={styles.noticeRow} onClick={stopShellClick}>
          <div className={styles.noticeBanner}>{notice}</div>
          {errorMessage ? (
            <div className={styles.errorBanner}>
              <AlertCircle size={16} />
              <div>{friendlyPdpError(errorMessage)}
                {friendlyPdpError(errorMessage) !== errorMessage ? <details><summary>상세 내용</summary>{errorMessage}</details> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.editorLayout}>
          <aside className={styles.sectionRail} onClick={stopShellClick}>
            <div className={styles.railCard}>
              <p className={styles.sidebarLabel}>현재 섹션</p>
              <h2 className={styles.railTitle}>{getDisplaySectionName(currentSection)}</h2>
              <p className={styles.railDescription}>{getDisplaySectionGoal(currentSection)}</p>
                <div className={styles.metricGrid}>
                  <div className={styles.metricCard}>
                    <span>현재 섹션</span>
                  <strong>
                    {currentSectionIndex + 1}/{sections.length}
                  </strong>
                  </div>
                  <div className={styles.metricCard}>
                    <span>{isCompleteMode ? "모드" : "레이어"}</span>
                    <strong>{isCompleteMode ? "통이미지" : currentLayers.length}</strong>
                  </div>
                </div>
              </div>

            <div className={styles.expansionPanel}>
              <p className={styles.sidebarLabel}>자료·근거</p>
              <p role="status" className={styles.railDescription}>전체 {sections.length}개 중 이미지 수신 {sections.filter(s => s.generatedImage).length}개 · 미완료 {sections.filter(s => !s.generatedImage).length}개</p>
              {sections.filter(s => !s.generatedImage && s.generation?.message).map(s => <button key={s.section_id} type="button" className={styles.secondaryButton} onClick={() => {setCurrentSectionIndex(sections.findIndex(x => x.section_id === s.section_id));}}>{getDisplaySectionName(s)}: {s.generation?.message}</button>)}
              {draftReview.status === 'pending' ? <p role="status" className={styles.railDescription}>초안 내용을 뒤에서 검수하는 중입니다. 결과는 구간 배지로 표시됩니다.</p> : draftReview.status === 'done' ? <p role="status" className={styles.railDescription}>검수 완료 · 확인 필요 {draftReview.issueCount ?? 0}건</p> : draftReview.status === 'failed' ? <p role="status" className={styles.railDescription}>검수를 마치지 못했습니다: {draftReview.message}</p> : null}
              {draftSummary ? <details className={styles.compactEditorGroup}><summary>{draftSummary.product} · 확인된 근거 {draftSummary.facts.length}개{draftSummary.gaps.length ? ` · 보완 제안 ${draftSummary.gaps.length}개` : ''}</summary>
                {draftSummary.story ? <><strong>이야기 뼈대</strong><ul>{([['고객', draftSummary.story.character], ['원하는 것', draftSummary.story.desire], ['겉 문제', draftSummary.story.externalProblem], ['속 문제', draftSummary.story.internalProblem], ['공감', draftSummary.story.guideEmpathy], ['믿을 이유', draftSummary.story.guideAuthority], ['계획', draftSummary.story.plan.join(' → ')], ['행동', draftSummary.story.callToAction], ['성공', draftSummary.story.success], ['피하는 실패', draftSummary.story.failure]] as Array<[string, string]>).filter(([, value]) => value).map(([label, value]) => <li key={label}><small>{label}</small> {value}</li>)}</ul></> : null}
                {draftSummary.facts.length ? <ul>{draftSummary.facts.map(fact => <li key={fact.id}><small>{fact.source}</small> {fact.quote}</li>)}</ul> : <p className={styles.railDescription}>확인된 상품 근거가 없습니다.</p>}
                {draftSummary.gaps.length ? <><strong>추가하면 설득력이 높아질 자료</strong><ul>{draftSummary.gaps.map((gap, index) => <li key={index}>{gap.needed} <small>{gap.reason}</small></li>)}</ul></> : null}
              </details> : null}
              {onReviewMaterials ? <button className={styles.secondaryButton} disabled={isEditorBusy} onClick={onReviewMaterials} type="button"><RefreshCw size={14} />자료 수정 · 초안 다시 만들기</button> : null}
              {previousComposition ? <button className={styles.secondaryButton} disabled={isEditorBusy} onClick={restoreComposition} type="button">이전 구성·이미지 복원</button> : null}
              {compositionHistory.length ? <details><summary>보관한 구성 {compositionHistory.length}개</summary>{compositionHistory.map((saved,index)=><button key={index} className={styles.secondaryButton} disabled={isEditorBusy} type="button" onClick={()=>{
                const current = {sections,sectionOptions,overlaysBySection,outputMode};
                setSections(saved.sections); setSectionOptions(saved.sectionOptions); setOverlaysBySection(saved.overlaysBySection);
                onOutputModeChange?.(saved.outputMode ?? outputMode); setCurrentSectionIndex(0);
                setCompositionHistory(history=>history.map((item,i)=>i===index?current:item)); setErrorMessage(''); setNotice('보관한 구성을 복원했습니다. 현재 구성도 보관함에 유지했습니다.');
              }}>보관 구성 {index+1} · {saved.sections.length}개 구간 복원</button>)}</details> : null}
            </div>

            <div className={styles.sectionRailCard}>
              <p className={styles.sidebarLabel}>섹션 목록</p>
              <div className={styles.sectionRailActions}>
                <button
                  className={styles.inlineButton}
                  disabled={isEditorBusy}
                  onClick={() => setIsSectionPickerOpen((current) => !current)}
                  type="button"
                >
                  <Sparkles size={14} />
                  섹션 추가
                  {isSectionPickerOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button className={styles.inlineButton} disabled={isEditorBusy} onClick={handleDuplicateCurrentSection} type="button">
                  <CopyIcon size={14} />
                  현재 복제
                </button>
                {missingImageCount > 1 ? (
                  <button
                    className={styles.inlineButton}
                    disabled={isEditorBusy}
                    onClick={handleGenerateMissingImages}
                    type="button"
                  >
                    {isGeneratingAllImages ? <Loader2 className={styles.spinIcon} size={14} /> : <ImageIcon size={14} />}
                    남은 {missingImageCount}장 모두 만들기
                  </button>
                ) : null}
              </div>
              {isSectionPickerOpen ? (
                <div className={styles.manualSectionPicker}>
                  <p className={styles.manualSectionPickerLabel}>세부 섹션 선택</p>
                  {MANUAL_SECTION_OPTIONS.map((option) => (
                    <button
                      className={styles.manualSectionOption}
                      disabled={isEditorBusy}
                      key={option.id}
                      onClick={() => handleAddSection(option)}
                      type="button"
                    >
                      <strong>{option.sectionName}</strong>
                      <small>{option.description}</small>
                      <span className={styles.manualSectionKeyMessage}>{option.keyMessage}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className={styles.sectionList}>
                {sections.map((section, index) => (
                  <div
                    className={`${styles.sectionListItem} ${draggedSectionIndex === index ? styles.sectionListItemDragging : ""}`}
                    draggable={sections.length > 1 && !isEditorGeneratingImage}
                    key={section.section_id}
                    onDragEnd={handleSectionDragEnd}
                    onDragOver={handleSectionDragOver}
                    onDragStart={(event) => handleSectionDragStart(event, index)}
                    onDrop={(event) => handleSectionDrop(event, index)}
                  >
                    <button
                      className={index === currentSectionIndex ? styles.sectionButtonActive : styles.sectionButton}
                      onClick={() => setCurrentSectionIndex(index)}
                      type="button"
                    >
                      <span aria-hidden="true" className={styles.sectionDragHandle} title="드래그해서 순서 변경">
                        <GripVertical size={14} />
                      </span>
                      <span className={styles.sectionStep}>
                        {section.generatedImage && index !== currentSectionIndex ? <CheckCircle2 size={12} /> : index + 1}
                      </span>
                      <span className={styles.sectionThumb} aria-hidden="true">
                        {section.generatedImage ? <img alt="" src={section.generatedImage} /> : null}
                      </span>
                      <span className={styles.sectionButtonCopy}>
                        <strong>{getDisplaySectionName(section)}</strong>
                        <span className={styles.sectionBadges}>
                          {getSectionStatusBadges(section, outputMode).map((badge) => (
                            <span className={`${styles.statusBadge} ${styles[`statusBadge_${badge.tone}`]}`} key={badge.label}>{badge.label}</span>
                          ))}
                          {sectionIssues[section.section_id]?.length ? <span className={`${styles.statusBadge} ${styles.statusBadge_warning}`}>확인 필요</span> : null}
                        </span>
                      </span>
                    </button>
                    {sections.length > 1 ? (
                      <button
                        aria-label={`${getDisplaySectionName(section)} 섹션 삭제`}
                        className={styles.sectionDeleteButton}
                        disabled={isEditorBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          requestDeleteSection(index);
                        }}
                        title="섹션 삭제"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className={styles.canvasColumn}>
            <article className={styles.canvasPanel}>
              <div className={styles.canvasHeader}>
                <div>
                  <p className={styles.panelLabel}>편집 섹션</p>
                  <h2 className={styles.panelTitle}>{getDisplaySectionName(currentSection)}</h2>
                  <p className={styles.panelDescription}>{getDisplaySectionGoal(currentSection)}</p>
                </div>

                <div className={styles.canvasActions}>
                  {!workbenchState.isOpen ? (
                    <button
                      aria-label={`${activeWorkbenchLabel} 패널 열기`}
                      className={styles.reopenWorkbenchButton}
                      onClick={() => openWorkbench(workbenchTab)}
                      type="button"
                    >
                      <Settings2 size={16} />
                      옵션 패널 열기
                    </button>
                  ) : null}
                  <button
                    className={styles.navButton}
                    disabled={currentSectionIndex === 0}
                    onClick={() => setCurrentSectionIndex((current) => Math.max(0, current - 1))}
                    type="button"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className={styles.metaPill}>
                    {currentSectionIndex + 1}/{sections.length}
                  </span>
                  <button
                    className={styles.navButton}
                    disabled={currentSectionIndex === sections.length - 1}
                    onClick={() => setCurrentSectionIndex((current) => Math.min(sections.length - 1, current + 1))}
                    type="button"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className={workbenchState.isOpen ? styles.canvasWorkbenchFrame : styles.canvasWorkbenchFrameClosed}>
                <div className={styles.previewStage} ref={previewStageRef} style={{ ["--canvas-ratio" as string]: getAspectRatioValue(getSellingSectionRatio(currentSection, aspectRatio)) } as CSSProperties}>
                  {currentSection.generatedImage ? (
                    <div className={styles.imageCanvas} ref={imageContainerRef} style={currentSection.section_id.startsWith('review_example_') && !isCompleteMode && overlaysBySection[currentSectionIndex]?.some(layer => layer.id.startsWith('review-editorial-')) ? { aspectRatio: String(getAspectRatioValue(getSellingSectionRatio(currentSection, aspectRatio))), background: '#fff', borderRadius: 0 } : undefined}>
                    <img
                      alt={currentSection.section_name}
                      className={styles.sectionImage}
                      style={currentSection.section_id.startsWith('review_example_') && !isCompleteMode && overlaysBySection[currentSectionIndex]?.some(layer => layer.id.startsWith('review-editorial-')) ? { position: 'absolute', left: '5.2%', top: '19%', width: '46%', height: '45%', objectFit: 'contain', borderRadius: 8, boxShadow: 'none' } : undefined}
                      draggable={false}
                      src={currentSection.generatedImage}
                    />

                    {currentSection.originalProduct ? <Rnd bounds="parent" lockAspectRatio position={{ x: currentSection.originalProduct.x * canvasScale, y: currentSection.originalProduct.y * canvasScale }} size={{ width: currentSection.originalProduct.width * canvasScale, height: currentSection.originalProduct.height * canvasScale }} style={{ zIndex: 3 }} onDragStop={(_, position) => setSections(current => current.map(section => section.section_id === currentSection.section_id && section.originalProduct ? { ...section, originalProduct: { ...section.originalProduct, x: position.x / canvasScale, y: position.y / canvasScale } } : section))} onResizeStop={(_, __, element, ___, position) => setSections(current => current.map(section => section.section_id === currentSection.section_id && section.originalProduct ? { ...section, originalProduct: { x: position.x / canvasScale, y: position.y / canvasScale, width: element.offsetWidth / canvasScale, height: element.offsetHeight / canvasScale } } : section))}><img alt="고정 원본 제품" draggable={false} src={originalImageSrc} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} /></Rnd> : null}
                    {[...currentShapeLayers, ...currentTextLayers].map((overlay) => (
                      <Rnd
                        bounds="parent"
                        className={`${styles.overlayBox} ${isShapeLayer(overlay) ? styles.shapeLayerBox : styles.textLayerBox} ${selectedOverlayId === overlay.id ? styles.overlaySelected : ""}`}
                        enableUserSelectHack={false}
                        enableResizing={
                          selectedOverlayId === overlay.id
                            ? {
                                top: true,
                                right: true,
                                bottom: true,
                                left: true,
                                topRight: true,
                                bottomRight: true,
                                bottomLeft: true,
                                topLeft: true
                              }
                            : false
                        }
                        key={overlay.id}
                        onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
                          event.stopPropagation();
                          setSelectedOverlayId(overlay.id);
                        }}
                        onDragStart={() => {
                          setSelectedOverlayId(overlay.id);
                          setActiveColorPalette(null);
                        }}
                        onDrag={(_, data) => handleOverlayDrag(overlay, data.x, data.y)}
                        onDragStop={(_, data) => handleOverlayDrag(overlay, data.x, data.y)}
                        onResize={(_, direction, ref, __, position) => handleResize(overlay, direction, ref, position, canvasScale)}
                        onResizeStart={() => {
                          handleResizeStart(overlay);
                        }}
                        onResizeStop={(_, direction, ref, __, position) => {
                          handleResize(overlay, direction, ref, position, canvasScale);
                          handleResizeStop(overlay.id);
                        }}
                        position={{ x: overlay.x * canvasScale, y: overlay.y * canvasScale }}
                        resizeHandleClasses={{
                          top: styles.resizeHandleTop,
                          bottom: styles.resizeHandleBottom,
                          left: styles.resizeHandleLeft,
                          right: styles.resizeHandleRight,
                          topLeft: styles.resizeHandleTopLeft,
                          topRight: styles.resizeHandleTopRight,
                          bottomLeft: styles.resizeHandleBottomLeft,
                          bottomRight: styles.resizeHandleBottomRight
                        }}
                        style={{
                          zIndex: isShapeLayer(overlay)
                            ? selectedOverlayId === overlay.id
                              ? 2
                              : 1
                            : selectedOverlayId === overlay.id
                              ? 5
                              : 4
                        }}
                        size={{
                          width: toNumericSize(overlay.width, 320) * canvasScale,
                          height: toNumericSize(overlay.height, 92) * canvasScale
                        }}
                      >
                        {isShapeLayer(overlay) ? (
                          <div className={`${styles.overlayContent} ${styles.overlayDragSurface}`}>
                            <div className={styles.shapeLayerSurface} style={buildShapeLayerStyle(overlay, canvasScale)} />
                          </div>
                        ) : (
                          <div
                            className={`${editingOverlayId === overlay.id ? styles.overlayEditing : styles.overlayContent} ${styles.overlayDragSurface}`}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              setSelectedOverlayId(overlay.id);
                              setEditingOverlayId(overlay.id);
                            }}
                            style={buildOverlayShellStyle(overlay, canvasScale)}
                          >
                            {overlay.backgroundEnabled ? (
                              <div className={styles.overlayBackdrop} style={buildOverlayBackgroundStyle(overlay, canvasScale)} />
                            ) : null}
                            {editingOverlayId === overlay.id ? (
                              <textarea
                                autoFocus
                                className={styles.overlayTextarea}
                                onBlur={() => setEditingOverlayId(null)}
                                onChange={(event) => updateTextOverlayContent(overlay.id, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    setEditingOverlayId(null);
                                  }
                                }}
                                style={buildOverlayTextStyle(overlay, canvasScale)}
                                value={overlay.text}
                              />
                            ) : (
                              <div className={styles.overlayTextLayer} style={buildOverlayTextStyle(overlay, canvasScale)}>
                                {overlay.text}
                              </div>
                            )}
                          </div>
                        )}
                      </Rnd>
                    ))}

                    </div>
                  ) : (
                    <div className={isCurrentImageLoading ? styles.placeholderPanelLoading : styles.placeholderPanel}>
                      <div className={isCurrentImageLoading ? styles.placeholderLoadingIcon : styles.placeholderIcon}>
                        {isCurrentImageLoading ? <Loader2 className={styles.spinIcon} size={30} /> : <ImageIcon size={28} />}
                      </div>
                      <div>
                        <strong>
                          {isCurrentImageLoading
                            ? "이미지 생성중입니다. 잠시만 기다려주세요."
                            : "이 섹션의 이미지를 아직 만들지 않았습니다."}
                        </strong>
                        <p>
                          {isCurrentImageLoading
                            ? "섹션 이미지를 만드는 동안 이 화면에서 진행 상태를 확인할 수 있습니다."
                            : isCompleteMode
                              ? "이미지 옵션을 정하고 완성형 섹션 이미지를 생성할 수 있습니다."
                              : "이미지 생성 옵션을 정하고 이미지를 만들면, 캔버스 안에서 바로 텍스트를 얹고 편집할 수 있습니다."}
                        </p>
                        {!isCurrentImageLoading && currentSectionImageError && currentSectionImageError !== errorMessage ? (
                          <div className={styles.placeholderError}>
                            <AlertCircle size={15} />
                            <span>{friendlyPdpError(currentSectionImageError || "")}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                {workbenchState.isOpen ? (
                  <aside className={styles.workbenchDockPanel} onClick={(event: ReactMouseEvent<HTMLElement>) => event.stopPropagation()}>
                    <div className={styles.workbenchPanel}>
                      <div className={styles.workbenchHandle}>
                        <div className={styles.workbenchHandleCopy}>
                          <span className={styles.optionMiniLabel}>Canvas Workbench</span>
                          <strong>{activeWorkbenchLabel}</strong>
                        </div>
                        <div className={styles.workbenchHeaderActions}>
                          <span className={styles.dockStatusPill}>오른쪽 고정</span>
                          <button
                            className={styles.inlineButton}
                            onClick={() =>
                              {
                                setWorkbenchState((current) => ({
                                  ...current,
                                  isOpen: false
                                }));
                                logEditorEvent("editor.workbench_closed", {
                                  tab: workbenchTab
                                });
                              }
                            }
                            type="button"
                          >
                            닫기
                          </button>
                        </div>
                      </div>

                      <div className={styles.workbenchSectionStack}>
                      <div className={styles.workbenchTabs}>
                        <button
                          className={workbenchTab === "image" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => { setWorkbenchTab("image"); logEditorEvent("editor.workbench_tab_selected", { tab: "image" }); }}
                          type="button"
                        >
                          <Settings2 size={15} />
                          이미지
                        </button>
                        {!isCompleteMode ? (
                          <button
                            className={workbenchTab === "layer" ? styles.workbenchTabActive : styles.workbenchTab}
                            onClick={() => { setWorkbenchTab("layer"); logEditorEvent("editor.workbench_tab_selected", { tab: "layer" }); }}
                            type="button"
                          >
                            <Type size={15} />
                            문구
                          </button>
                        ) : null}
                      </div>
                      <details className={styles.compactEditorGroup} open={workbenchTab === "copy" || workbenchTab === "guide" ? true : undefined}>
                        <summary>고급 · 레이아웃 템플릿과 연출 가이드</summary>
                        <div className={styles.toolbarRow}>
                          {!isCompleteMode ? <button className={workbenchTab === "copy" ? styles.workbenchTabActive : styles.workbenchTab} onClick={() => { setWorkbenchTab("copy"); logEditorEvent("editor.workbench_tab_selected", { tab: "copy" }); }} type="button"><Sparkles size={15} />템플릿</button> : null}
                          <button className={workbenchTab === "guide" ? styles.workbenchTabActive : styles.workbenchTab} onClick={() => { setWorkbenchTab("guide"); logEditorEvent("editor.workbench_tab_selected", { tab: "guide" }); }} type="button"><Palette size={15} />가이드</button>
                        </div>
                      </details>
                      </div>

                      <div className={styles.workbenchBody}>{renderWorkbenchBody()}</div>
                    </div>
                  </aside>
                ) : null}
              </div>

              <div className={styles.canvasFooter}>
                <span className={styles.footerStatus}>페이지 편집 · {outputModeLabel}</span>
                <span className={styles.footerStatus}>{currentSection.generatedImage ? "이미지 준비 완료" : "이미지 생성 필요"}</span>
                <span className={styles.footerStatus}>{isCompleteMode ? `생성됨 ${generatedCount}/${sections.length}` : `레이어 ${currentLayers.length}개`}</span>
                {workbenchState.isOpen ? (
                  <span className={styles.footerStatus}>옵션 패널 열림</span>
                ) : (
                  <button className={styles.footerReopenButton} onClick={() => openWorkbench(workbenchTab)} type="button">
                    <Settings2 size={14} />
                    {activeWorkbenchLabel} 열기
                  </button>
                )}
              </div>
            </article>
          </section>
        </div>
      </section>
      {copyCompletion ? <div className={styles.saveToast} role="status">{copyCompletion}</div> : null}
      {reviewIntakeOpen ? <div className={styles.editorConfirmOverlay} role="dialog" aria-modal="true" aria-label="고객 후기 추가">
        <div className={styles.editorConfirmDialog}>
          <h2>고객 후기 추가</h2>
          <p>후기를 등록하시면 가장 적합한 후기를 자동으로 추출해드립니다.</p>
          <p className={styles.settingsHelper}>나중에 등록하면 편집용 예시 후기를 넣어드려요. 실제 후기가 아니라는 표시가 함께 들어가며 언제든 수정할 수 있습니다.</p>
          <button type="button" className={styles.primaryButtonWide} onClick={openReviewRegistration}>지금 등록하기</button>
          <button type="button" className={styles.secondaryButton} onClick={addExampleReviews}>나중에 등록하기</button>
          <button type="button" className={styles.secondaryButton} onClick={() => setReviewIntakeOpen(false)}>닫기</button>
        </div>
      </div> : null}
      {pendingDeleteSection ? (
        <div aria-modal="true" className={styles.editorConfirmOverlay} onClick={cancelDeleteSection} role="dialog">
          <div className={styles.editorConfirmDialog} onClick={stopShellClick}>
            <div className={styles.editorConfirmIcon}>
              <AlertCircle size={20} />
            </div>
            <div>
              <p className={styles.panelLabel}>섹션 삭제</p>
              <h2 className={styles.editorConfirmTitle}>이 섹션을 삭제하시겠습니까?</h2>
              <p className={styles.editorConfirmCopy}>
                {getDisplaySectionName(pendingDeleteSection)} 섹션과 이 섹션의 이미지 옵션, 편집 레이어가 함께 삭제됩니다.
              </p>
            </div>
            <div className={styles.editorConfirmActions}>
              <button className={styles.secondaryButton} onClick={cancelDeleteSection} type="button">
                취소
              </button>
              <button className={styles.inlineDangerButton} onClick={confirmDeleteSection} type="button">
                <Trash2 size={14} />
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isEditorGeneratingImage ? (
        <div aria-modal="true" className={styles.editorWaitingOverlay} role="dialog">
          <div className={styles.editorWaitingDialog}>
            <div className={styles.editorWaitingHeader}>
              <div className={styles.processingIcon}>
                <Loader2 className={styles.spinIcon} size={32} />
              </div>
              <div>
                <p className={styles.panelLabel}>이미지 생성 대기</p>
                <h2>AI가 섹션 이미지를 만드는 중입니다</h2>
                <p>
                  {isGeneratingAllImages
                    ? `${missingImageCount}개 남은 섹션 이미지를 생성하고 있습니다. 완료되면 자동으로 편집 화면으로 돌아옵니다.`
                    : isCurrentImageRegeneration
                      ? `${getDisplaySectionName(currentSection)} 이미지를 새 옵션으로 다시 만들고 있습니다. 완료되면 자동으로 팝업이 닫힙니다.`
                      : `${getDisplaySectionName(currentSection)} 이미지를 생성하고 있습니다. 완료되면 자동으로 팝업이 닫힙니다.`}
                </p>
              </div>
            </div>

            {isGeneratingAllImages ? <div role="status">
              <p>{batchProgress.completed}/{batchProgress.total}장 처리 · 최대 2장씩 생성합니다.</p>
              <button className={styles.secondaryButton} type="button" onClick={() => { pauseBatchRef.current = true; setNotice("실행 중인 장을 마친 뒤 일시정지합니다."); }}>현재 요청 완료 후 일시정지</button>
            </div> : null}
            <div className={styles.editorWaitingProgress}>
              <div className={styles.editorWaitingProgressTop}>
                <span>예상 진행률</span>
                <strong>{Math.max(0, waitingProgress)}%</strong>
              </div>
              <div
                aria-label="이미지 생성 예상 진행률"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.max(0, waitingProgress)}
                className={styles.editorWaitingProgressTrack}
                role="progressbar"
              >
                <span
                  className={styles.editorWaitingProgressFill}
                  style={{ width: `${Math.max(4, waitingProgress)}%` }}
                />
              </div>
              <div className={styles.editorWaitingProgressMeta}>
                <span>
                  {isGeneratingAllImages
                    ? `생성됨 ${generatedCount}/${sections.length}`
                    : isCurrentImageRegeneration
                      ? "새 옵션 적용 중"
                      : "현재 섹션 생성 중"}
                </span>
                <span>추천 영상 재생</span>
              </div>
            </div>

            <div className={`${styles.waitingVideoCard} ${styles.waitingVideoCardFull}`} aria-label="기다리는 동안 추천 영상">
              <div className={styles.waitingVideoFrame}>
                <PdpWaitingVideoFrame />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isWritingCopy && !isEditorGeneratingImage ? (
        <div aria-modal="true" className={styles.editorWaitingOverlay} role="dialog" aria-label="카피 작성 중">
          <div className={styles.editorWaitingDialog}>
            <div className={styles.editorWaitingHeader}>
              <div className={styles.processingIcon}>
                <Loader2 className={styles.spinIcon} size={32} />
              </div>
              <div>
                <p className={styles.panelLabel}>카피 작성 대기</p>
                <h2>
                  {writingCopyInfo?.mode === 'add'
                    ? 'AI가 새 섹션의 카피를 쓰는 중입니다'
                    : writingCopyInfo?.mode === 'rewrite'
                      ? 'AI가 전체 카피를 다시 쓰는 중입니다'
                      : 'AI가 이 섹션의 카피를 쓰는 중입니다'}
                </h2>
                <p>
                  {writingCopyInfo?.mode === 'rewrite'
                    ? `${sections.length}개 섹션을 상품 자료 기준으로 다시 작성하고 있습니다.`
                    : `${writingCopyInfo?.names.join(', ') || getDisplaySectionName(currentSection)} 섹션의 문구를 상품 자료와 앞뒤 흐름에 맞춰 작성하고 있습니다.`}
                  {' '}보통 20초~1분 정도 걸리며, 끝나면 오른쪽 패널에서 내용을 확인한 뒤 적용할 수 있습니다. 그동안 다른 버튼은 잠시 비활성화됩니다.
                </p>
              </div>
            </div>
            <div className={styles.editorWaitingProgress}>
              <div className={styles.editorWaitingProgressTop}>
                <span>경과 시간</span>
                <strong>{writingCopyElapsed}초</strong>
              </div>
              <div className={styles.editorWaitingProgressMeta}>
                <span role="status">{writingCopyElapsed >= 60 ? '평소보다 오래 걸리고 있습니다. 최대 약 3분까지 기다린 뒤 실패하면 알려드립니다.' : '카피 작성 후 배지 검수는 적용 뒤 자동으로 이어집니다.'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <PdpBugReportWidget
        context={{
          surface: "editor",
          outputMode,
          aiProvider,
          apiConnectionLabel,
          sectionName: getDisplaySectionName(currentSection),
          sectionIndex: currentSectionIndex + 1,
          sectionCount: sections.length,
          generatedCount,
          missingImageCount,
          workbenchTab,
          isWorkbenchOpen: workbenchState.isOpen,
          saveState,
          errorMessage: errorMessage || undefined
        }}
      />
    </main>
  );
}

