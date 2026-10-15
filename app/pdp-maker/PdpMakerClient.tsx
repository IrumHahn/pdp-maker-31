"use client";

import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { AlertCircle, Bot, ChevronDown, Clock3, Copy, FileText, FolderOpen, Info, KeyRound, Loader2, Lock, Menu, RectangleHorizontal, RectangleVertical, Settings2, Smartphone, Sparkles, Square, Trash2, Upload, Wand2, X } from "lucide-react";
import { DEFAULT_HIGGSFIELD_IMAGE_PREFERENCES, DEFAULT_OPENAI_IMAGE_PREFERENCES, PDP_DRAFT_SECTION_LIMIT, PDP_IMAGE_MODELS, getPdpSectionImageDefaults } from "@runacademy/shared";
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

import { PdpWaitingVideoFrame } from "./PdpWaitingVideo";
import { AI_PROVIDER_OPTIONS, APP_TITLE, CUSTOMER_REVIEW_ANALYSIS_SAMPLE_SIZE, EMPTY_CLIENT_SETTINGS, INITIAL_HERO_SECTION_COUNT, MAX_SOURCE_MATERIAL_FILES, OUTPUT_MODE_OPTIONS, PreparedImage, SavedDraftsSheet, UploadDropzone, buildAnalyzeSourceMaterials, buildSourceMaterialsNotice, buildUploadContextGuidance, clientPreferredProvider, createDefaultEditorDraftState, extractCustomerReviewRows, formatAnalysisMode, formatCompactFileName, formatDuration, formatGenerationReference, formatOptimizationSavings, formatOptimizedDimensions, formatSavedDraftDate, formatSourceMaterialDetail, formatSourceMaterialKind, getSourceMaterialsForDraft, getVisibleSourceMaterials, isLongDetailSampling, isSupportedCustomerReviewFile, isSupportedSourceMaterialFile, markPrimarySourceMaterial, pickGenerationPreferences, prepareSourceMaterialFile, renderRatioIcon, sampleCustomerReviewRowsEvenly, summarizeFileForUsageLog, summarizePreparedImageForUsageLog, summarizeSourceMaterialsForUi, syncSourceMaterialsWithPrimary, uniqueReviewRows } from "./pdp-maker-client-support";

export function PdpMakerClient() {
  const [appState, setAppState] = useState<PdpAppState>("upload");
  const [preparedImage, setPreparedImage] = useState<PreparedImage | null>(null);
  const [sourceMaterials, setSourceMaterials] = useState<PdpSourceMaterialDraft[]>([]);
  const [modelImage, setModelImage] = useState<PreparedImage | null>(null);
  const [isCompressingInputs, setIsCompressingInputs] = useState(false);
  const compressionBusyRef = useRef(false);
  const currentInputRef = useRef({ preparedImage, sourceMaterials, modelImage });
  currentInputRef.current = { preparedImage, sourceMaterials, modelImage };
  const [modelImageUsage, setModelImageUsage] = useState<ReferenceModelUsage | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [customerReviewSource, setCustomerReviewSource] = useState<PdpCustomerReviewSource | null>(null);
  const [customerReviewAnalysis, setCustomerReviewAnalysis] = useState<PdpCustomerReviewAnalysis | null>(null);
  const [isReadingCustomerReviews, setIsReadingCustomerReviews] = useState(false);
  const [isAnalyzingCustomerReviews, setIsAnalyzingCustomerReviews] = useState(false);
  const [customerReviewAnalysisError, setCustomerReviewAnalysisError] = useState("");
  const [desiredTone, setDesiredTone] = useState("");
  const [draftSectionCount, setDraftSectionCount] = useState<number>(PDP_DRAFT_SECTION_LIMIT.default);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [aiProvider, setAiProvider] = useState<PdpAiProvider>("gemini");
  const [outputMode, setOutputMode] = useState<PdpOutputMode>("full-image");
  const [notice, setNotice] = useState("브라우저에 초안이 저장되며, 저장한 작업은 이 화면에서 이어서 열 수 있습니다.");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [loadingStep, setLoadingStep] = useState("제품 이미지를 분석하는 중입니다.");
  const [processingKind, setProcessingKind] = useState<"hero" | "draft">("hero");
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [drafts, setDrafts] = useState<PdpDraftSummary[]>([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftCreatedAt, setDraftCreatedAt] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [editorDraftState, setEditorDraftState] = useState<PdpEditorDraftState | null>(null);
  const [editorSessionKey, setEditorSessionKey] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [manualSaveToastToken, setManualSaveToastToken] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [setupStep, setSetupStep] = useState<"upload" | "details">("upload");
  const higgsfieldConnection = useHiggsfieldConnection();
  const [clientSettings, setClientSettings] = useState<PdpClientSettings>(EMPTY_CLIENT_SETTINGS);
  
  
  
  const [isReadingSourceMaterials, setIsReadingSourceMaterials] = useState(false);
  
  
  const customerReviewInputRef = useRef<HTMLInputElement>(null);
  const isApplyingDraftRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const draftRevisionRef = useRef(0);

  const preparedImageDisplayName = preparedImage ? formatCompactFileName(preparedImage.fileName) : "";
  const modelImageDisplayName = modelImage ? formatCompactFileName(modelImage.fileName) : "";
  const visibleSourceMaterials = useMemo(() => getVisibleSourceMaterials(sourceMaterials, preparedImage), [preparedImage, sourceMaterials]);
  const sourceMaterialDropzoneLabel = visibleSourceMaterials.length
    ? `${visibleSourceMaterials.length}개 자료 등록 · 대표: ${preparedImageDisplayName}`
    : "";
  const sourceMaterialSummaryLabel = visibleSourceMaterials.length
    ? summarizeSourceMaterialsForUi(visibleSourceMaterials)
    : "이미지/PDF 미등록";
  const uploadContextGuidance = useMemo(
    () => buildUploadContextGuidance(visibleSourceMaterials, additionalInfo),
    [additionalInfo, visibleSourceMaterials]
  );
  
  
  
  const hasDraftContent = Boolean(preparedImage || sourceMaterials.length || modelImage || result || additionalInfo.trim() || customerReviewSource || customerReviewAnalysis || desiredTone.trim() || activeDraftId);
  const effectiveGeminiApiKey = resolveGeminiApiKeyHeaderValue(clientSettings);
  const effectiveOpenAiApiKey = resolveOpenAiApiKeyHeaderValue(clientSettings);
  const hasAvailableGeminiKey = Boolean(effectiveGeminiApiKey);
  const hasAvailableOpenAiKey = Boolean(effectiveOpenAiApiKey);
  const processingProvider: PdpAiProvider = aiProvider;
  const selectedProviderHasKey = processingProvider === "higgsfield" ? higgsfieldConnection.connected && (hasAvailableOpenAiKey || hasAvailableGeminiKey) : processingProvider === "openai" ? hasAvailableOpenAiKey : hasAvailableGeminiKey;
  const hasPendingCustomerReviewAnalysis = Boolean(customerReviewSource && !customerReviewAnalysis);
  const customerReviewRequiresChatGptNotice = Boolean(customerReviewSource && !customerReviewAnalysis && !hasAvailableOpenAiKey);
  const canContinueToDetails = Boolean(preparedImage && (!modelImage || modelImageUsage) && !hasPendingCustomerReviewAnalysis && !isCompressingInputs);
  const apiConnectionLabel = higgsfieldConnection.connected ? "Higgsfield MCP" : hasAvailableGeminiKey || hasAvailableOpenAiKey
    ? `${hasAvailableGeminiKey ? "Gemini" : ""}${hasAvailableGeminiKey && hasAvailableOpenAiKey ? " + " : ""}${hasAvailableOpenAiKey ? "OpenAI" : ""}`
    : "키 필요";
  const selectedProviderLabel = AI_PROVIDER_OPTIONS.find((option) => option.value === processingProvider)?.label ?? "Gemini";
  const selectedOutputMode = OUTPUT_MODE_OPTIONS.find((option) => option.value === outputMode) ?? OUTPUT_MODE_OPTIONS[0];
  const estimatedProcessingSeconds = useMemo(
    () => (processingKind === "draft" ? 90 : (processingProvider === "openai" ? 180 : 150) + INITIAL_HERO_SECTION_COUNT * 20 + (modelImage ? 30 : 0)),
    [modelImage, processingProvider, processingKind]
  );
  const elapsedProcessingSeconds = loadingStartedAt ? Math.max(0, Math.floor((Date.now() - loadingStartedAt) / 1000)) : 0;
  const remainingProcessingSeconds = loadingStartedAt
    ? Math.max(0, estimatedProcessingSeconds - elapsedProcessingSeconds)
    : estimatedProcessingSeconds;
  const remainingProgressPercent = Math.max(0, 100 - loadingProgress);
  const remainingTimeLabel = loadingProgress >= 94 || remainingProcessingSeconds <= 0
    ? "응답 마무리 중"
    : `약 ${formatDuration(remainingProcessingSeconds)} 남음`;
  const logSetupEvent = useCallback(
    (event: string, metadata?: Record<string, unknown>, level: "info" | "warn" | "error" = "info", error?: Error | string) => {
      logPdpUsage({
        event,
        source: "setup",
        level,
        state: {
          appState,
          setupStep,
          aiProvider,
          processingProvider,
          outputMode,
          aspectRatio,
          hasPreparedImage: Boolean(preparedImage),
          sourceMaterialCount: visibleSourceMaterials.length,
          hasModelImage: Boolean(modelImage),
          modelImageUsage: modelImageUsage ?? "none",
          customerReviewCount: customerReviewAnalysis?.reviewCount ?? customerReviewSource?.reviewCount ?? 0,
          hasDraft: Boolean(activeDraftId),
          sectionCount: result?.blueprint.sections.length ?? 0
        },
        metadata,
        error
      });
    },
    [activeDraftId, aiProvider, appState, aspectRatio, customerReviewAnalysis, customerReviewSource, modelImage, modelImageUsage, outputMode, preparedImage, processingProvider, result, setupStep, visibleSourceMaterials.length]
  );

  useEffect(() => {
    const dispose = installPdpUsageLogFlushHandlers();
    logPdpUsage({
      event: "setup.app_opened",
      source: "setup",
      state: {
        appState: "upload",
        setupStep: "upload",
        product: APP_TITLE
      }
    });

    return () => {
      logPdpUsage({
        event: "setup.app_unmounted",
        source: "setup"
      });
      void flushPdpUsageLogs({ preferBeacon: true });
      dispose();
    };
  }, []);

  const previousFlowStateRef = useRef(`${appState}:${setupStep}`);
  useEffect(() => {
    const nextFlowState = `${appState}:${setupStep}`;
    if (previousFlowStateRef.current !== nextFlowState) {
      logSetupEvent("setup.flow_state_changed", {
        from: previousFlowStateRef.current,
        to: nextFlowState
      });
      previousFlowStateRef.current = nextFlowState;
    }
  }, [appState, logSetupEvent, setupStep]);

  const lastLoggedErrorRef = useRef("");
  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const errorKey = `${errorMessage}\n${errorDetail}`;
    if (lastLoggedErrorRef.current === errorKey) {
      return;
    }

    lastLoggedErrorRef.current = errorKey;
    logSetupEvent(
      "setup.error_visible",
      {
        message: errorMessage,
        hasDetail: Boolean(errorDetail)
      },
      "warn",
      errorDetail || errorMessage
    );
  }, [errorDetail, errorMessage, logSetupEvent]);

  const refreshDrafts = useCallback(async () => {
    setIsLoadingDrafts(true);
    try {
      setDrafts(await listPdpDrafts());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저장된 작업 목록을 불러오지 못했습니다.");
      logSetupEvent("setup.draft_list_failed", undefined, "warn", error instanceof Error ? error : String(error));
    } finally {
      setIsLoadingDrafts(false);
    }
  }, [logSetupEvent]);

  const scrollErrorIntoView = () => {
    requestAnimationFrame(() => {
      document.getElementById("pdp-error-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const returnToDetailsWithError = (message: string, detail?: string) => {
    setAppState("upload");
    setSetupStep("details");
    setLoadingStartedAt(null);
    setLoadingProgress(0);
    setErrorMessage(message);
    setErrorDetail(detail ?? "");
    setShowErrorDetail(false);
    scrollErrorIntoView();
  };

  const buildAnalyzeRequestBody = (inputs: Awaited<ReturnType<typeof compressPdpInputs>>) => JSON.stringify({
          aiProvider: processingProvider,
          imageModel: (processingProvider === "higgsfield" ? clientSettings.higgsfieldImageModel : processingProvider === "openai" ? clientSettings.openAiImageModel : clientSettings.geminiImageModel),
          imageQuality: clientSettings.openAiImageQuality,
              higgsfieldImageQuality: clientSettings.higgsfieldImageQuality,
              higgsfieldImageResolution: clientSettings.higgsfieldImageResolution,
              higgsfieldImageVariant: clientSettings.higgsfieldImageVariant,
          sourceMode: "auto" as const,
          outputMode,
          imageBase64: inputs.primary.base64,
          mimeType: inputs.primary.mimeType,
          generationImageBase64: inputs.primary.generationBase64 && inputs.primary.generationBase64 !== inputs.primary.base64 ? inputs.primary.generationBase64 : undefined,
          generationImageMimeType: inputs.primary.generationMimeType ?? inputs.primary.mimeType,
          imageOptimization: inputs.primary.analysisMetadata,
          sourceMaterials: buildAnalyzeSourceMaterials(inputs.materials),
          modelImageBase64: inputs.person?.base64,
          modelImageMimeType: inputs.person?.mimeType,
          modelImageFileName: inputs.person?.fileName,
          additionalInfo: additionalInfo.trim() || undefined,
          customerReviewAnalysis: customerReviewAnalysis ?? undefined,
          desiredTone: desiredTone.trim() || undefined,
          aspectRatio,
          sectionCount: INITIAL_HERO_SECTION_COUNT
        });

  const compressCurrentInputs = async () => {
    if (!preparedImage || compressionBusyRef.current) return null;
    compressionBusyRef.current = true;
    setIsCompressingInputs(true);
    const snapshot = currentInputRef.current;
    try {
      setLoadingStep("대표·보조·인물 이미지의 전송 용량을 정리하는 중입니다.");
      const next = await compressPdpInputs({ primary: preparedImage, materials: syncSourceMaterialsWithPrimary(sourceMaterials, preparedImage), person: modelImage });
      const current = currentInputRef.current;
      if (current.preparedImage !== snapshot.preparedImage || current.sourceMaterials !== snapshot.sourceMaterials || current.modelImage !== snapshot.modelImage) {
        throw new Error("압축 중 등록 자료가 바뀌었습니다. 현재 자료로 다시 압축해 주세요.");
      }
      const transmissionBytes = new TextEncoder().encode(buildAnalyzeRequestBody(next)).length;
      if (transmissionBytes > MAX_PDP_REQUEST_BYTES) throw new Error(`이미지 압축 후에도 전체 전송 용량이 ${(transmissionBytes / 1000000).toFixed(2)}MB로 3.8MB 한도를 초과합니다. 추가 정보 또는 후기 텍스트를 줄여 주세요.`);
      setPreparedImage(next.primary);
      setSourceMaterials(next.materials);
      setModelImage(next.person);
      setNotice(`전체 자료 압축 완료 · 전송 ${(transmissionBytes / 1000000).toFixed(2)}MB / 한도 3.8MB · ${next.compressedCount}개 이미지 정리. 이미지 생성 비용은 발생하지 않았습니다.`);
      logSetupEvent("setup.all_inputs_compressed", { transmissionBytes, compressedCount: next.compressedCount, materialCount: next.materials.length, hasModelImage: Boolean(next.person) });
      return next;
    } finally {
      compressionBusyRef.current = false;
      setIsCompressingInputs(false);
    }
  };

  const handleCompressInputs = async () => {
    setErrorMessage(""); setErrorDetail("");
    try { await compressCurrentInputs(); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : "자료 압축에 실패했습니다."); }
  };

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  useEffect(() => {
    const nextSettings = loadPdpClientSettings();
    setClientSettings(nextSettings);
    setAiProvider(clientPreferredProvider(nextSettings));
  }, []);

  

  

  useEffect(() => {
    if (isApplyingDraftRef.current || !hasDraftContent) {
      return;
    }

    draftRevisionRef.current += 1;
    setIsDirty(true);
    setSaveState((current) => (current === "saved" ? "idle" : current));
  }, [additionalInfo, aiProvider, clientSettings, appState, aspectRatio, customerReviewAnalysis, customerReviewSource, desiredTone, editorDraftState, hasDraftContent, modelImage, modelImageUsage, outputMode, preparedImage, result, sourceMaterials]);

  const handleSourceMaterialFiles = async (files: File[]) => {
    const selectedFiles = files.slice(0, MAX_SOURCE_MATERIAL_FILES);
    const skippedCount = Math.max(0, files.length - selectedFiles.length);

    if (!selectedFiles.length) {
      return;
    }

    logSetupEvent("setup.source_materials_selected", {
      totalCount: files.length,
      acceptedCount: selectedFiles.length,
      skippedCount,
      files: selectedFiles.map(summarizeFileForUsageLog)
    });
    setIsReadingSourceMaterials(true);
    setErrorMessage("");
    setErrorDetail("");
    setShowErrorDetail(false);
    setNotice("업로드 자료를 읽고 분석용으로 정리하는 중입니다.");

    try {
      const rejectedFile = selectedFiles.find((file) => !isSupportedSourceMaterialFile(file));
      if (rejectedFile) {
        setErrorMessage("처음 등록 자료는 이미지 파일 또는 PDF만 업로드할 수 있습니다.");
        logSetupEvent("setup.source_materials_rejected", summarizeFileForUsageLog(rejectedFile), "warn");
        return;
      }

      const nextMaterials = await Promise.all(selectedFiles.map((file) => prepareSourceMaterialFile(file)));
      const primaryMaterial = nextMaterials.find((material) => material.preparedImage);

      if (!primaryMaterial?.preparedImage) {
        setErrorMessage("분석에 사용할 수 있는 이미지/PDF 대표 화면을 만들지 못했습니다.");
        logSetupEvent("setup.source_materials_empty", { count: selectedFiles.length }, "warn");
        return;
      }

      const normalizedMaterials = markPrimarySourceMaterial(nextMaterials, primaryMaterial.id, primaryMaterial.preparedImage);
      const contextGuidance = buildUploadContextGuidance(normalizedMaterials, additionalInfo);
      setPreparedImage(primaryMaterial.preparedImage);
      setSourceMaterials(normalizedMaterials);
      setNotice(
        contextGuidance?.tone === "warning"
          ? `${buildSourceMaterialsNotice(normalizedMaterials, skippedCount)} ${contextGuidance.message}`
          : buildSourceMaterialsNotice(normalizedMaterials, skippedCount)
      );
      logSetupEvent("setup.source_materials_prepared", {
        totalCount: normalizedMaterials.length,
        skippedCount,
        imageCount: normalizedMaterials.filter((material) => material.kind === "image").length,
        pdfCount: normalizedMaterials.filter((material) => material.kind === "pdf").length,
        primary: summarizePreparedImageForUsageLog(primaryMaterial.preparedImage),
        contextGuidance: contextGuidance?.reason ?? "none"
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "업로드 자료를 준비하지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      logSetupEvent("setup.source_materials_prepare_failed", { count: selectedFiles.length }, "error", error instanceof Error ? error : String(error));
    } finally {
      setIsReadingSourceMaterials(false);
    }
  };

  const handleModelImage = async (file: File) => {
    logSetupEvent("setup.model_image_selected", summarizeFileForUsageLog(file));
    try {
      if (!file.type.startsWith("image/")) {
        setErrorMessage("이미지 파일만 업로드할 수 있습니다.");
        logSetupEvent("setup.model_image_rejected", summarizeFileForUsageLog(file), "warn");
        return;
      }

      const nextImage = await prepareImageFile(file, { allowLongPageSampling: false });
      setModelImage(nextImage);
      setModelImageUsage(null);
      setErrorMessage("");
      setErrorDetail("");
      setShowErrorDetail(false);
      setNotice(`${file.name} 모델 이미지를 원본 품질로 준비했습니다. 히어로우 전용 또는 전체 일관성 유지 방식을 선택해 주세요.`);
      logSetupEvent("setup.model_image_prepared", {
        file: summarizeFileForUsageLog(file),
        image: summarizePreparedImageForUsageLog(nextImage)
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "모델 이미지를 준비하지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      logSetupEvent("setup.model_image_prepare_failed", summarizeFileForUsageLog(file), "error", error instanceof Error ? error : String(error));
    }
  };

  const getCustomerReviewChatGptNotice = () =>
    hasAvailableGeminiKey
      ? "Gemini 키만 연결되어 있습니다. 고객 후기/상세페이지 분석은 ChatGPT만 가능하므로 설정에서 OpenAI API 키를 입력해 주세요."
      : "고객 후기/상세페이지 분석은 ChatGPT만 가능합니다. 설정에서 OpenAI API 키를 입력한 뒤 다시 분석해 주세요.";

  const analyzeCustomerReviewSource = async (source: PdpCustomerReviewSource) => {
    const currentOpenAiApiKey = effectiveOpenAiApiKey;

    if (!currentOpenAiApiKey) {
      const message = getCustomerReviewChatGptNotice();
      setCustomerReviewAnalysisError(message);
      setNotice(message);
      logSetupEvent(
        "setup.customer_review_analysis_blocked",
        {
          reason: hasAvailableGeminiKey ? "gemini_only" : "missing_openai_key",
          reviewCount: source.reviewCount,
          sampledReviewCount: source.sampledReviewCount ?? source.reviews.length
        },
        "warn"
      );
      return;
    }

    setIsAnalyzingCustomerReviews(true);
    setCustomerReviewAnalysisError("");
    setNotice(`고객 후기 파일을 ChatGPT로 분석하고 있습니다.`);
    logSetupEvent("setup.customer_review_ai_analysis_started", {
      fileName: source.fileName,
      reviewCount: source.reviewCount,
      sampledReviewCount: source.sampledReviewCount ?? source.reviews.length,
      model: "gpt-5.4-mini"
    });

    try {
      const response = await apiJson<PdpAnalyzeCustomerReviewsResponse>(
        "/pdp/customer-reviews/analyze",
        {
          method: "POST",
          body: JSON.stringify({
            source,
            productContext: additionalInfo.trim() || undefined,
            desiredTone: desiredTone.trim() || undefined
          })
        },
        { openAiApiKey: currentOpenAiApiKey, timeoutMs: GENERATION_API_TIMEOUT_MS }
      );

      if (!response.ok) {
        const message =
          response.code === "OPENAI_MODEL_ACCESS_DENIED"
            ? "현재 OpenAI API 키로는 gpt-5.4-mini 후기 분석 모델에 접근할 수 없습니다. OpenAI 모델 접근 권한을 확인해 주세요."
            : response.message;
        setCustomerReviewAnalysisError(message);
        setNotice(message);
        logSetupEvent(
          "setup.customer_review_ai_analysis_failed",
          {
            code: response.code,
            reviewCount: source.reviewCount,
            sampledReviewCount: source.sampledReviewCount ?? source.reviews.length
          },
          "error",
          response.detail || response.message
        );
        return;
      }

      setCustomerReviewAnalysis(response.analysis);
      setCustomerReviewAnalysisError("");
      setNotice(`ChatGPT가 후기 파일을 분석했습니다. 결과를 확인한 뒤 다음 단계로 넘어가세요.`);
      logSetupEvent("setup.customer_review_ai_analysis_completed", {
        reviewCount: response.analysis.reviewCount,
        sampledReviewCount: response.analysis.sampledReviewCount ?? response.analysis.reviewCount,
        model: response.model,
        topBenefitCount: response.analysis.topBenefits.length,
        painPointCount: response.analysis.painPoints.length
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ChatGPT 후기 분석 중 오류가 발생했습니다.";
      setCustomerReviewAnalysisError(message);
      setNotice(message);
      logSetupEvent(
        "setup.customer_review_ai_analysis_failed",
        {
          reviewCount: source.reviewCount,
          sampledReviewCount: source.sampledReviewCount ?? source.reviews.length
        },
        "error",
        error instanceof Error ? error : String(error)
      );
    } finally {
      setIsAnalyzingCustomerReviews(false);
    }
  };

  const handleCustomerReviewFile = async (file: File) => {
    logSetupEvent("setup.customer_review_file_selected", summarizeFileForUsageLog(file));
    setIsReadingCustomerReviews(true);
    setCustomerReviewSource(null);
    setCustomerReviewAnalysis(null);
    setCustomerReviewAnalysisError("");
    setErrorMessage("");
    setErrorDetail("");
    setShowErrorDetail(false);

    try {
      if (!isSupportedCustomerReviewFile(file)) {
        setErrorMessage("고객 후기는 .xlsx, .csv, .tsv, .txt 파일만 업로드할 수 있습니다.");
        logSetupEvent("setup.customer_review_file_rejected", summarizeFileForUsageLog(file), "warn");
        return;
      }

      const rows = uniqueReviewRows(await extractCustomerReviewRows(file));

      if (!rows.length) {
        setErrorMessage("후기 파일에서 읽을 수 있는 후기 문장을 찾지 못했습니다. 후기/리뷰/내용 컬럼이 있는 파일을 올려주세요.");
        logSetupEvent("setup.customer_review_file_empty", summarizeFileForUsageLog(file), "warn");
        return;
      }

      const sampledRows = sampleCustomerReviewRowsEvenly(rows, CUSTOMER_REVIEW_ANALYSIS_SAMPLE_SIZE);
      const source: PdpCustomerReviewSource = {
        fileName: file.name.slice(0, 120),
        reviewCount: rows.length,
        sampledReviewCount: sampledRows.length,
        reviews: sampledRows.map((row) => ({
          text: row.text,
          rating: row.rating
        }))
      };

      setCustomerReviewSource(source);
      setNotice(`고객 후기 파일을 준비했습니다. ChatGPT 분석 결과를 확인한 뒤 다음 단계로 넘어갑니다.`);
      logSetupEvent("setup.customer_review_file_parsed", {
        file: summarizeFileForUsageLog(file),
        reviewCount: source.reviewCount,
        sampledReviewCount: source.sampledReviewCount,
        willAnalyzeWithOpenAi: hasAvailableOpenAiKey
      });

      await analyzeCustomerReviewSource(source);
    } catch (error) {
      setCustomerReviewSource(null);
      setCustomerReviewAnalysis(null);
      setErrorMessage(error instanceof Error ? error.message : "고객 후기 파일을 읽지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      logSetupEvent("setup.customer_review_file_failed", summarizeFileForUsageLog(file), "error", error instanceof Error ? error : String(error));
    } finally {
      setIsReadingCustomerReviews(false);
    }
  };

  const clearCustomerReviewAnalysis = () => {
    setCustomerReviewSource(null);
    setCustomerReviewAnalysis(null);
    setCustomerReviewAnalysisError("");
    if (customerReviewInputRef.current) {
      customerReviewInputRef.current.value = "";
    }
    setNotice("고객 후기 입력을 제거했습니다.");
    logSetupEvent("setup.customer_review_file_cleared");
  };

  const buildDraftInput = useCallback(() => {
    if (!hasDraftContent) {
      return null;
    }

    return {
      id: activeDraftId ?? undefined,
      createdAt: draftCreatedAt ?? undefined,
      appState: result ? "editor" : appState === "processing" ? "upload" : appState,
      preparedImage,
      sourceMaterials: getSourceMaterialsForDraft(sourceMaterials, preparedImage),
      modelImage,
      modelImageUsage,
      result,
      additionalInfo,
      customerReviewAnalysis,
      desiredTone,
      aspectRatio,
      aiProvider,
      imagePreferences: pickGenerationPreferences(clientSettings),
      sourceMode: "auto" as const,
      outputMode,
      sectionCount: result?.blueprint.sections.length ?? INITIAL_HERO_SECTION_COUNT,
      benefits: [],
      notice: editorDraftState?.notice ?? notice,
      editorState: result ? editorDraftState ?? createDefaultEditorDraftState(result, outputMode) : null
    };
  }, [clientSettings, activeDraftId, additionalInfo, aiProvider, appState, aspectRatio, customerReviewAnalysis, desiredTone, draftCreatedAt, editorDraftState, hasDraftContent, modelImage, modelImageUsage, notice, outputMode, preparedImage, result, sourceMaterials]);

  const latestDraftInputRef = useRef(buildDraftInput);
  latestDraftInputRef.current = buildDraftInput;

  const persistDraft = useCallback(
    async (mode: "manual" | "auto" | "switch" = "manual", options?: { showToast?: boolean }) => {
      if (saveInFlightRef.current && mode !== "auto") {
        const deadline = Date.now() + 5000;
        while (saveInFlightRef.current && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 40));
      }
      const input = latestDraftInputRef.current();
      if (!input || saveInFlightRef.current) {
        return null;
      }

      const savedRevision = draftRevisionRef.current;
      saveInFlightRef.current = true;
      setSaveState("saving");

      try {
        const savedDraft = await savePdpDraft(input);
        setActiveDraftId(savedDraft.id);
        setDraftCreatedAt(savedDraft.createdAt);
        setLastSavedAt(savedDraft.updatedAt);
        const unchanged = draftRevisionRef.current === savedRevision;
        setSaveState(unchanged ? "saved" : "idle");
        setIsDirty(!unchanged);
        if (mode === "manual") {
          setNotice("현재 작업을 저장했습니다. 시작 화면에서 이어서 작업할 수 있습니다.");
          if (options?.showToast) {
            setManualSaveToastToken(Date.now());
          }
        }
        await refreshDrafts();
        if (mode !== "auto") {
          logSetupEvent("setup.draft_saved", {
            mode,
            hasResult: Boolean(input.result),
            sectionCount: input.sectionCount
          });
        }
        return savedDraft;
      } catch (error) {
        setSaveState("error");
        setErrorMessage("작업을 저장하지 못했습니다.");
        setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        logSetupEvent("setup.draft_save_failed", { mode }, "error", error instanceof Error ? error : String(error));
        return null;
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [buildDraftInput, logSetupEvent, refreshDrafts]
  );

  const confirmSaveBeforeLeaving = useCallback(async () => {
    if (!isDirty || !hasDraftContent) {
      return true;
    }

    const shouldSave = window.confirm("저장되지 않은 작업이 있습니다.\n확인: 저장 후 이동\n취소: 저장하지 않고 이동");
    if (!shouldSave) {
      return true;
    }

    const savedDraft = await persistDraft("manual");
    return Boolean(savedDraft);
  }, [hasDraftContent, isDirty, persistDraft]);

  const resetWorkspace = useCallback(() => {
    isApplyingDraftRef.current = true;
    setAppState("upload");
    setSetupStep("upload");
    setIsDraftsOpen(false);
    setPreparedImage(null);
    setSourceMaterials([]);
    setModelImage(null);
    setModelImageUsage(null);
    setResult(null);
    setAdditionalInfo("");
    setCustomerReviewSource(null);
    setCustomerReviewAnalysis(null);
    setCustomerReviewAnalysisError("");
    if (customerReviewInputRef.current) {
      customerReviewInputRef.current.value = "";
    }
    setDesiredTone("");
    setAspectRatio("9:16");
    const defaults = loadPdpClientSettings();
    setClientSettings(defaults);
    setAiProvider(clientPreferredProvider(defaults));
    setOutputMode("full-image");
    setNotice("새 이미지로 다시 시작할 수 있습니다.");
    setErrorMessage("");
    setErrorDetail("");
    setShowErrorDetail(false);
    setEditorDraftState(null);
    setActiveDraftId(null);
    setDraftCreatedAt(null);
    setLastSavedAt(null);
    setSaveState("idle");
    setIsDirty(false);
    setEditorSessionKey((current) => current + 1);
    logSetupEvent("setup.workspace_reset");
    requestAnimationFrame(() => {
      isApplyingDraftRef.current = false;
    });
  }, [clientSettings, logSetupEvent]);

  const handleLoadDraft = useCallback(
    async (draftId: string) => {
      logSetupEvent("setup.draft_load_requested", {
        draftIdPresent: Boolean(draftId)
      });
      const canContinue = await confirmSaveBeforeLeaving();
      if (!canContinue) {
        logSetupEvent("setup.draft_load_cancelled_unsaved_changes");
        return;
      }

      setIsLoadingDraft(true);
      setErrorMessage("");
      setErrorDetail("");
      setShowErrorDetail(false);

      try {
        const draft = await getPdpDraft(draftId);
        if (!draft) {
          setErrorMessage("저장된 작업을 찾지 못했습니다.");
          logSetupEvent("setup.draft_load_not_found", undefined, "warn");
          await refreshDrafts();
          return;
        }

        isApplyingDraftRef.current = true;
        setActiveDraftId(draft.id);
        setDraftCreatedAt(draft.createdAt);
        setLastSavedAt(draft.updatedAt);
        setPreparedImage(draft.preparedImage);
        setSourceMaterials(draft.sourceMaterials ?? []);
        setModelImage(draft.modelImage ?? null);
        setModelImageUsage(draft.modelImageUsage ?? null);
        setResult(draft.result);
        setAdditionalInfo(draft.additionalInfo);
        setCustomerReviewSource(null);
        setCustomerReviewAnalysis(draft.customerReviewAnalysis);
        setCustomerReviewAnalysisError("");
        setDesiredTone(draft.desiredTone);
        setAspectRatio(draft.aspectRatio);
        setAiProvider(draft.aiProvider);
        if (draft.imagePreferences) setClientSettings(current => ({ ...current, ...draft.imagePreferences }));
        setOutputMode(draft.result ? draft.outputMode : "full-image");
        setNotice(draft.notice);
        setEditorDraftState(draft.editorState);
        setSetupStep(draft.preparedImage ? "details" : "upload");
        setAppState(draft.result ? "editor" : "upload");
        setSaveState("saved");
        setIsDirty(false);
        setIsDraftsOpen(false);
        setEditorSessionKey((current) => current + 1);
        logSetupEvent("setup.draft_loaded", {
          hasResult: Boolean(draft.result),
          sectionCount: draft.result?.blueprint.sections.length ?? 0,
          outputMode: draft.outputMode,
          hasModelImage: Boolean(draft.modelImage),
          hasCustomerReviews: Boolean(draft.customerReviewAnalysis)
        });
      } catch (error) {
        setErrorMessage("저장된 작업을 불러오지 못했습니다.");
        setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        logSetupEvent("setup.draft_load_failed", undefined, "error", error instanceof Error ? error : String(error));
      } finally {
        requestAnimationFrame(() => {
          isApplyingDraftRef.current = false;
          setIsLoadingDraft(false);
        });
      }
    },
    [confirmSaveBeforeLeaving, logSetupEvent, refreshDrafts]
  );

  const handleDeleteDraft = useCallback(
    async (draftId: string) => {
      const shouldDelete = window.confirm("이 저장된 작업을 삭제할까요?");
      if (!shouldDelete) {
        logSetupEvent("setup.draft_delete_cancelled");
        return;
      }

      try {
        await deletePdpDraft(draftId);
        if (activeDraftId === draftId) {
          resetWorkspace();
        }
        await refreshDrafts();
        logSetupEvent("setup.draft_deleted", {
          deletedActiveDraft: activeDraftId === draftId
        });
      } catch (error) {
        setErrorMessage("저장된 작업을 삭제하지 못했습니다.");
        setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        logSetupEvent("setup.draft_delete_failed", undefined, "error", error instanceof Error ? error : String(error));
      }
    },
    [activeDraftId, logSetupEvent, refreshDrafts, resetWorkspace]
  );

  useEffect(() => {
    if (!isDirty || !hasDraftContent) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDraftContent, isDirty]);

  const backupControls = <PdpDraftBackupControls onExport={async () => {
    const saved = await persistDraft("manual");
    if (!saved) throw new Error("저장할 작업이 없거나 저장 중입니다. 잠시 후 다시 시도하세요.");
    return { text: exportPdpDraft(saved), fileName: "pdp-3.1-" + saved.id + ".json" };
  }} onImport={async text => {
    const input = importPdpDraft(text);
    const saved = await savePdpDraft(input);
    await refreshDrafts();
    await handleLoadDraft(saved.id);
  }} />;

  // 상단 '작업' 메뉴: 바깥 클릭·Esc로 닫는다. 백업 가져오기의 파일 입력이 유지되도록 메뉴는 항상 렌더링하고 표시만 토글한다.
  const topbarMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (topbarMenuRef.current && !topbarMenuRef.current.contains(event.target as Node)) setIsMobileMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isMobileMenuOpen]);

  const autosaveLatestRef = useRef({ isDirty, hasDraftContent, persistDraft });
  autosaveLatestRef.current = { isDirty, hasDraftContent, persistDraft };
  useEffect(() => {
    const timer = window.setInterval(() => {
      const latest = autosaveLatestRef.current;
      if (latest.isDirty && latest.hasDraftContent) void latest.persistDraft("auto");
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (appState !== "processing" || !loadingStartedAt) {
      return;
    }

    const tick = () => {
      const elapsedSeconds = Math.max(0, (Date.now() - loadingStartedAt) / 1000);
      const progressRatio = 1 - Math.exp(-elapsedSeconds / Math.max(24, estimatedProcessingSeconds * 0.46));
      setLoadingProgress(Math.min(94, Math.max(3, Math.round(progressRatio * 94))));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [appState, estimatedProcessingSeconds, loadingStartedAt]);

  const handleStartSellingPlan = async () => {
    if (!preparedImage || isCompressingInputs || isReadingSourceMaterials) return;
    if (!effectiveOpenAiApiKey && !effectiveGeminiApiKey && clientSettings.textProvider !== "codex-cli") { setErrorMessage("설정에서 OpenAI 또는 Gemini API 키를 먼저 입력해 주세요. 기획·카피 작성에 사용됩니다."); return; }
    setErrorMessage(""); setErrorDetail("");
    const startedAt = Date.now();
    try {
      const inputs = await compressCurrentInputs();
      if (!inputs) return;
      setProcessingKind("draft"); setLoadingStartedAt(Date.now()); setLoadingProgress(3);
      setLoadingStep("상품 자료를 읽고 구간 구성과 카피를 한 번에 작성하는 중입니다. 이미지는 만들지 않습니다.");
      setAppState("processing");
      const textProvider: PdpAiProvider = effectiveOpenAiApiKey ? "openai" : "gemini";
      const originalImage = inputs.primary.generationBase64 ?? inputs.primary.base64;
      const originalImageMimeType = inputs.primary.generationMimeType ?? inputs.primary.mimeType;
      const response = await apiJson<{ ok: true; draft: PdpDraftPlan } | { ok: false; code?: string; message: string; detail?: string }>("/pdp/draft", { method: "POST", body: JSON.stringify({
        originalImageBase64: originalImage, originalImageMimeType,
        sourceMaterials: buildAnalyzeSourceMaterials(inputs.materials), additionalInfo: additionalInfo.trim() || undefined, desiredTone: desiredTone.trim() || undefined,
        customerReviewAnalysis: customerReviewAnalysis ?? undefined, aiProvider: textProvider, outputMode: "full-image", sectionCount: draftSectionCount
      }) }, { geminiApiKey: effectiveGeminiApiKey, openAiApiKey: effectiveOpenAiApiKey, timeoutMs: 330000 });
      if (!response.ok) { logSetupEvent("setup.draft_api_failed", { code: response.code }, "error", response.detail || response.message); returnToDetailsWithError(response.message, response.detail); return; }
      const { draft } = response;
      const next: GeneratedResult = { originalImage, originalImageMimeType, originalImageFileName: inputs.primary.fileName,
        blueprint: { executiveSummary: draft.product, scorecard: [], blueprintList: draft.gaps.map(gap => gap.needed), sections: draft.sections } };
      const sectionIssues: Record<string, string[]> = {};
      for (const issue of draft.issues) (sectionIssues[issue.section_id] ??= []).push(issue.reason);
      const storyLine = draft.story?.desire && draft.story?.callToAction ? ` 이야기: ${draft.story.desire} → ${draft.story.externalProblem || draft.story.internalProblem} → ${draft.story.callToAction}` : '';
      const completedNotice = `${draft.product} 초안 ${draft.sections.length}개 구간이 준비되었습니다.${storyLine} 문구를 확인하고 구간별로 이미지를 만드세요.`;
      const editor: PdpEditorDraftState = { ...createDefaultEditorDraftState(next, "full-image"), notice: completedNotice,
        draftSummary: { product: draft.product, category: draft.category, facts: draft.facts, gaps: draft.gaps, story: draft.story }, sectionIssues, draftReview: { status: "pending" } };
      setOutputMode("full-image"); setResult(next); setEditorDraftState(editor); setEditorSessionKey(current => current + 1);
      setLoadingProgress(100); setNotice(completedNotice); setAppState("editor"); setIsDirty(true);
      logSetupEvent("setup.draft_completed", { sectionCount: draft.sections.length, issueCount: draft.issues.length, durationMs: Date.now() - startedAt });
    } catch (error) { returnToDetailsWithError(error instanceof Error ? error.message : "초안 작성 중 문제가 발생했습니다."); }
  };

  const handleReset = async () => {
    logSetupEvent("setup.reset_requested");
    const canContinue = await confirmSaveBeforeLeaving();
    if (!canContinue) {
      logSetupEvent("setup.reset_cancelled_unsaved_changes");
      return;
    }

    resetWorkspace();
  };

  const handleGoToMain = async () => {
    logSetupEvent("setup.go_to_main_requested");
    const canContinue = await confirmSaveBeforeLeaving();
    if (!canContinue) {
      logSetupEvent("setup.go_to_main_cancelled_unsaved_changes");
      return;
    }

    resetWorkspace();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleContinueToDetails = () => {
    if (!preparedImage) {
      setErrorMessage("먼저 제품 이미지 혹은 상세페이지 이미지를 업로드해 주세요.");
      document.getElementById("pdp-maker-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
      logSetupEvent("setup.details_step_blocked", { reason: "missing_primary_image" }, "warn");
      return;
    }

    if (modelImage && !modelImageUsage) {
      setErrorMessage("모델 이미지를 업로드했다면 사용 방식을 먼저 선택해 주세요.");
      document.getElementById("model-upload-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      logSetupEvent("setup.details_step_blocked", { reason: "missing_model_usage" }, "warn");
      return;
    }

    if (hasPendingCustomerReviewAnalysis) {
      const message = customerReviewRequiresChatGptNotice
        ? getCustomerReviewChatGptNotice()
        : "고객 후기 파일을 올렸다면 ChatGPT 분석 결과를 확인한 뒤 다음 단계로 넘어갈 수 있습니다.";
      setCustomerReviewAnalysisError(message);
      setErrorMessage(message);
      document.getElementById("customer-review-upload-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      logSetupEvent(
        "setup.details_step_blocked",
        {
          reason: "pending_customer_review_analysis",
          reviewCount: customerReviewSource?.reviewCount ?? 0
        },
        "warn"
      );
      return;
    }

    setErrorMessage("");
    setErrorDetail("");
    setShowErrorDetail(false);
    setSetupStep("details");
    const scrollToWorkspace = () => {
      const workspace = document.getElementById("pdp-maker-workspace");
      if (!workspace) {
        return;
      }

      window.scrollTo({
        top: workspace.getBoundingClientRect().top + window.scrollY,
        behavior: "auto"
      });
    };
    requestAnimationFrame(scrollToWorkspace);
    window.setTimeout(scrollToWorkspace, 120);
    window.setTimeout(scrollToWorkspace, 320);
    logSetupEvent("setup.details_step_entered", {
      image: summarizePreparedImageForUsageLog(preparedImage),
      hasModelImage: Boolean(modelImage),
      modelImageUsage: modelImageUsage ?? "none",
      customerReviewCount: customerReviewAnalysis?.reviewCount ?? 0
    });
  };

  const handleOpenAiImageSettingsChange = (preferences: OpenAiImagePreferences) => {
    setClientSettings(current => ({ ...current, ...preferences }));
  };

  const handleHiggsfieldImageSettingsChange = (preferences: HiggsfieldImagePreferences) => {
    setClientSettings(current => ({ ...current, ...preferences }));
  };

  const handleSaveSettings = (nextSettings: PdpClientSettings) => {
    savePdpClientSettings(nextSettings);
    const savedSettings = loadPdpClientSettings();
    const hasSavedOpenAiKey = Boolean(resolveOpenAiApiKeyHeaderValue(savedSettings));
    setClientSettings(savedSettings);
    setAiProvider(clientPreferredProvider(savedSettings));
    if (customerReviewSource && !customerReviewAnalysis && hasSavedOpenAiKey) {
      setCustomerReviewAnalysisError("");
      setNotice("OpenAI API 키 확인을 마쳤습니다. 고객 후기 영역에서 ChatGPT 분석을 다시 실행해 주세요.");
    } else {
      setNotice("선택한 공급자의 키를 확인하고 설정을 저장했습니다. 다른 공급자는 선택해 사용할 때 검사합니다.");
    }
    logSetupEvent("setup.api_settings_saved", {
      hasGeminiKey: Boolean(resolveGeminiApiKeyHeaderValue(savedSettings)),
      hasOpenAiKey: hasSavedOpenAiKey,
      preferredAiProvider: savedSettings.preferredAiProvider || "auto"
    });
  };

  

  

  const modelUploadSection = (
    <section className={styles.optionalUploadBlock} id="model-upload-section">
      <div className={styles.optionalUploadHeader}>
        <div className={styles.onboardingBlockHeading}>
          <span className={styles.sectionStep}>2</span>
          <div>
            <span className={styles.panelLabel}>있을 경우</span>
            <h3 className={styles.optionalUploadTitle}>모델 이미지 등록</h3>
            <p className={styles.optionalUploadDescription}>특정 인물을 히어로우나 모델컷 전체에 맞출 때만 업로드하세요.</p>
          </div>
        </div>
        {modelImage ? (
          <button
            className={styles.inlineButton}
            onClick={() => {
              setModelImage(null);
              setModelImageUsage(null);
              setErrorMessage("");
              setErrorDetail("");
              setShowErrorDetail(false);
              setNotice("모델 이미지를 제거했습니다. 일반 페르소나 설정으로 계속 편집할 수 있습니다.");
              logSetupEvent("setup.model_image_removed");
            }}
            type="button"
          >
            <Trash2 size={14} />
            모델 이미지 제거
          </button>
        ) : null}
      </div>

      <UploadDropzone
        compact
        description="선택 사항입니다. 모델컷 생성 시 참조 이미지로 사용됩니다."
        hint={modelImage?.fileName ? `선택됨: ${modelImageDisplayName}` : "권장 최대 10MB"}
        onSelect={async (files) => {
          const file = files[0];
          if (file) {
            await handleModelImage(file);
          }
        }}
        selectedFileName={modelImage?.fileName}
        title="모델 이미지 등록(있을 경우)"
      />

      {modelImage ? (
        <div className={styles.uploadPreviewCard}>
          <div className={styles.previewFrame}>
            <img alt={modelImage.fileName} className={styles.selectedImage} src={modelImage.previewUrl} />
          </div>
          <div className={styles.uploadMeta}>
            <strong title={modelImage.fileName}>{modelImageDisplayName}</strong>
            <div className={styles.metaList}>
              <div className={styles.metaItem}>
                <span>적용 대상</span>
                <strong>{modelImageUsage === "all-sections" ? "전체 모델컷" : modelImageUsage === "hero-only" ? "히어로우" : "선택 필요"}</strong>
              </div>
              <div className={styles.metaItem}>
                <span>활용 방식</span>
                <strong>{formatAnalysisMode(modelImage)}</strong>
              </div>
              <div className={styles.metaItem}>
                <span>분석 크기</span>
                <strong>{formatOptimizedDimensions(modelImage)}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {modelImage ? (
        <div className={styles.modelUsagePanel}>
          <div className={styles.modelUsageHeader}>
            <strong>모델 이미지 사용 방식</strong>
            <span>업로드했다면 아래 두 옵션 중 하나를 선택해야 합니다.</span>
          </div>
          <div className={styles.modelUsageGrid}>
            <button
              className={modelImageUsage === "hero-only" ? styles.modelUsageCardActive : styles.modelUsageCard}
              onClick={() => {
                setModelImageUsage("hero-only");
                setErrorMessage("");
                logSetupEvent("setup.model_usage_selected", { modelImageUsage: "hero-only" });
              }}
              type="button"
            >
              <strong>히어로우에만 사용</strong>
              <span>첫 히어로우 섹션의 모델컷에 적용합니다.</span>
            </button>
            <button
              className={modelImageUsage === "all-sections" ? styles.modelUsageCardActive : styles.modelUsageCard}
              onClick={() => {
                setModelImageUsage("all-sections");
                setErrorMessage("");
                logSetupEvent("setup.model_usage_selected", { modelImageUsage: "all-sections" });
              }}
              type="button"
            >
              <strong>전체 일관성 유지</strong>
              <span>모델컷 생성 시 같은 인물 기준으로 맞춥니다.</span>
            </button>
          </div>
          {!modelImageUsage ? (
            <div className={styles.inlineWarning}>
              <AlertCircle size={16} />
              모델 이미지 사용 방식을 선택해 주세요.
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  const errorPanel = errorMessage ? (
    <div className={styles.errorPanel} id="pdp-error-panel" role="alert">
      <div className={styles.errorBanner}>
        <AlertCircle size={16} />
        {errorMessage}
      </div>
      {errorDetail ? (
        <div className={styles.errorDetailWrap}>
          <button className={styles.inlineButton} onClick={() => setShowErrorDetail((current) => !current)} type="button">
            {showErrorDetail ? "로그 숨기기" : "로그 보기"}
          </button>
          {showErrorDetail ? (
            <div className={styles.errorDetail}>
              <div className={styles.errorDetailHeader}>
                <strong>API Detail</strong>
                <button className={styles.inlineButton} onClick={() => navigator.clipboard.writeText(errorDetail)} type="button">
                  <Copy size={14} />
                  복사
                </button>
              </div>
              <pre>{errorDetail}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;

  const customerReviewTitle =
    customerReviewAnalysis?.fileName ?? customerReviewSource?.fileName ?? "후기 엑셀 파일을 첨부해 주세요";
  const customerReviewStatusText = customerReviewAnalysis
    ? `후기 파일을 분석했습니다 · 고객 고민/후기 섹션에 실제 문장을 반영`
    : customerReviewSource
      ? isAnalyzingCustomerReviews
        ? `후기 파일을 gpt-5.4-mini로 분석 중`
        : `후기 파일 준비 완료 · ChatGPT 분석 결과 확인 후 다음 단계 가능`
      : ".xlsx, .csv, .tsv 지원 · 후기/리뷰/내용 컬럼을 자동으로 찾습니다.";
  const customerReviewActionLabel = customerReviewAnalysis || customerReviewSource ? "후기 파일 교체" : "후기 파일 첨부";
  const customerReviewAnalysisButtonLabel = isAnalyzingCustomerReviews
    ? "ChatGPT 분석 중"
    : customerReviewAnalysis
      ? "다시 분석"
      : "ChatGPT로 후기 분석";

  if (appState === "editor" && result) {
    return (
      <>
        <PdpEditor
          key={`${activeDraftId ?? "new"}-${editorSessionKey}`}
          aspectRatio={aspectRatio}
          aiProvider={processingProvider}
          higgsfieldPreferences={clientSettings}
          onHiggsfieldImageSettingsChange={handleHiggsfieldImageSettingsChange}
          openAiImageModel={clientSettings.openAiImageModel}
          geminiImageModel={clientSettings.geminiImageModel}
          openAiImageQuality={clientSettings.openAiImageQuality}
          onOpenAiImageSettingsChange={handleOpenAiImageSettingsChange}
          outputMode={outputMode}
          onOutputModeChange={setOutputMode}
          geminiApiKey={effectiveGeminiApiKey}
          openAiApiKey={effectiveOpenAiApiKey}
          desiredTone={desiredTone}
          additionalInfo={additionalInfo}
          sourceMaterials={buildAnalyzeSourceMaterials(sourceMaterials)}
          primaryAnalysisImage={preparedImage ? { base64: preparedImage.base64, mimeType: preparedImage.mimeType } : undefined}
          onReviewMaterials={() => { setAppState("upload"); setSetupStep("upload"); setIsDirty(true); }}
          customerReviewAnalysis={customerReviewAnalysis}
          initialDraftState={editorDraftState}
          initialResult={result}
          lastSavedAt={lastSavedAt}
          manualSaveToastToken={manualSaveToastToken}
          onDraftStateChange={setEditorDraftState}
          onManualSave={() => void persistDraft("manual", { showToast: true })}
          onOpenSettings={() => {
            setIsSettingsOpen(true);
            logSetupEvent("setup.settings_opened", { trigger: "editor_header" });
          }}
          onReset={() => void handleReset()}
          apiConnectionLabel={apiConnectionLabel}
          referenceModelImage={modelImage}
          referenceModelUsage={modelImageUsage}
          saveState={saveState}
          menuExtras={backupControls}
        />
        <PdpSettingsSheet
          onOpenChange={setIsSettingsOpen}
          onSave={handleSaveSettings}
          open={isSettingsOpen}
          settings={clientSettings}
        />
      </>
    );
  }

  const selectedProviderStatusLabel = processingProvider === "higgsfield"
    ? (higgsfieldConnection.connected ? "계정 연결됨" : "계정 연결 필요")
    : (selectedProviderHasKey ? "키 저장됨" : "키 필요");
  const latestDraft = drafts[0] ?? null;
  const isUploadEmpty = !preparedImage && !visibleSourceMaterials.length;

  return (
    <main className={`${styles.page} ${styles.setupPage}`}>
      <header className={styles.appTopbar}>
        <button
          className={styles.appTopbarBrand}
          onClick={() => {
            setIsMobileMenuOpen(false);
            void handleGoToMain();
          }}
          type="button"
          aria-label="처음 화면으로 이동"
        >
          <span className={styles.brandMark} aria-hidden="true">마</span>
          <span className={styles.appTopbarTitle}>{APP_TITLE}</span>
          <span className={styles.brandEndorsement}>by 한이룸</span>
        </button>

        {appState !== "processing" && !isUploadEmpty ? (
          <nav className={styles.setupProgress} aria-label="작업 단계">
            <button
              aria-current={setupStep === "upload" ? "step" : undefined}
              className={setupStep === "upload" ? styles.setupProgressItemActive : styles.setupProgressItem}
              onClick={() => {
                setSetupStep("upload");
                logSetupEvent("setup.step_clicked", { step: "upload" });
              }}
              type="button"
            >
              <span>1</span>
              <strong>자료 등록</strong>
            </button>
            <button
              aria-current={setupStep === "details" ? "step" : undefined}
              className={setupStep === "details" ? styles.setupProgressItemActive : styles.setupProgressItem}
              disabled={!preparedImage}
              onClick={() => {
                setSetupStep("details");
                logSetupEvent("setup.step_clicked", { step: "details" });
              }}
              type="button"
            >
              <span>2</span>
              <strong>생성 설정</strong>
            </button>
          </nav>
        ) : null}
        {appState === "processing" ? <span className={styles.appTopbarBusy} role="status"><Loader2 className={styles.spinIcon} size={14} />처리 중 · 창을 닫지 마세요</span> : null}

        <span className={styles.appTopbarSpacer} />

        <button
          aria-label={`API 키 및 연결 설정 열기 · ${selectedProviderLabel} ${selectedProviderStatusLabel}`}
          className={styles.connectionPill}
          onClick={() => {
            setIsSettingsOpen(true);
            logSetupEvent("setup.settings_opened", { trigger: "topbar" });
          }}
          type="button"
        >
          <i className={selectedProviderHasKey ? styles.connectionDotOn : styles.connectionDotOff} aria-hidden="true" />
          <span className={styles.connectionPillLabel}>{selectedProviderLabel} · {selectedProviderStatusLabel}</span>
        </button>

        <div className={styles.topbarMenuWrap} ref={topbarMenuRef}>
          <button
            aria-controls="pdp-maker-navigation-menu"
            aria-expanded={isMobileMenuOpen}
            aria-haspopup="menu"
            aria-label={isMobileMenuOpen ? "작업 메뉴 닫기" : "작업 메뉴 열기"}
            className={`${styles.secondaryButton} ${styles.topbarMenuButton}`}
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            type="button"
          >
            {isMobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            <span className={styles.topbarMenuButtonLabel}>작업</span>
          </button>
          <div
            className={`${styles.topbarMenu} ${isMobileMenuOpen ? styles.topbarMenuOpen : ""}`}
            id="pdp-maker-navigation-menu"
          >
            <button
              className={styles.topbarMenuItem}
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsDraftsOpen(true);
                logSetupEvent("setup.drafts_sheet_opened", { trigger: "topbar" });
              }}
              type="button"
            >
              <FolderOpen size={16} />
              <span>기존작업 열기<small>이 브라우저에 저장된 작업</small></span>
            </button>
            <button
              className={styles.topbarMenuItem}
              onClick={() => {
                setIsMobileMenuOpen(false);
                void handleReset();
              }}
              type="button"
            >
              <Sparkles size={16} />
              <span>새 작업 시작<small>지금 화면의 입력을 비웁니다</small></span>
            </button>
            <div className={styles.topbarMenuBackup}>
              <span className={styles.topbarMenuLabel}>작업 백업 · 키를 뺀 JSON (이미지 ZIP과 별개)</span>
              {backupControls}
            </div>
            <button
              className={styles.topbarMenuItem}
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsSettingsOpen(true);
                logSetupEvent("setup.settings_opened", { trigger: "menu" });
              }}
              type="button"
            >
              <Settings2 size={16} />
              <span>API 키 설정<small>Gemini · OpenAI 키, Higgsfield 계정</small></span>
            </button>
            <a className={styles.topbarMenuItem} href="/pdp-guide.html" target="_blank" rel="noreferrer" onClick={() => setIsMobileMenuOpen(false)}>
              <Info size={16} />
              <span>3.1 시작 안내</span>
            </a>
          </div>
        </div>
      </header>

      <section className={styles.shell}>
        <div className={styles.workspaceArea}>
        <div className={styles.workspaceFrame}>

        {appState === "processing" ? (
          <section className={styles.processingPanel}>
            <div className={styles.processingIcon}>
              <Loader2 className={styles.spinIcon} size={32} />
            </div>
            <div>
              <span className={styles.startEyebrow}>처리 중 · {selectedProviderLabel}</span>
              <h2>{processingKind === "draft" ? "AI가 기획과 카피 초안을 쓰는 중입니다" : "AI가 상세페이지 구조를 만드는 중입니다"}</h2>
              <p>{loadingStep}</p>
            </div>

            <div className={styles.processingMeter}>
              <div className={styles.processingMeterHeader}>
                <strong>예상 진행 · {remainingProgressPercent}% 남음</strong>
                <span>{remainingTimeLabel} · 추정치</span>
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${loadingProgress}%` }} />
              </div>
              <div className={styles.processingStats}>
                <span>선택 모델: {selectedProviderLabel}</span>
                <span>{processingKind === "draft" ? "생성 범위: 구성·카피 초안 (이미지 없음)" : "생성 범위: 히어로우 1장"}</span>
                <span>{selectedOutputMode.label}</span>
              </div>
            </div>

            <p className={styles.processingNote}>결과는 받는 즉시 자동 저장되고 편집 화면으로 넘어가요. 창을 닫거나 새로고침하면 응답을 확인하지 못할 수 있어요.</p>

            <div className={`${styles.waitingVideoCard} ${styles.waitingVideoCardFull}`} aria-label="기다리는 동안 추천 영상">
              <div className={styles.waitingVideoFrame}>
                <PdpWaitingVideoFrame />
              </div>
            </div>
          </section>
        ) : (
          <div className={styles.setupGridSingle} id="pdp-maker-workspace">
            {setupStep === "upload" ? (
            <section className={`${styles.uploadStage} ${isUploadEmpty ? styles.uploadStageEmpty : ""}`}>
              {isUploadEmpty ? (
                <div className={styles.startHead}>
                  <span className={styles.startEyebrow}>새 상세페이지 · 자료 등록</span>
                  <h2 className={styles.startTitle}>오늘 만들 상세페이지,<br /><em>자료부터</em> 놓아 주세요</h2>
                </div>
              ) : (
                <div className={styles.panelIntro}>
                  <div className={styles.sectionHeadingCopy}>
                    <span className={styles.startEyebrow}>1 · 자료 등록</span>
                    <h2>등록한 자료 {visibleSourceMaterials.length}개 · 대표 자료를 확인해 주세요</h2>
                    <p>대표 자료가 분석과 첫 이미지의 기준이 됩니다. 보조 자료는 함께 분석해요.</p>
                  </div>
                </div>
              )}

              {isUploadEmpty ? (
                <UploadDropzone
                  accept="image/*,.pdf,application/pdf"
                  description="제품컷, 패키지컷, 기존 상세페이지 캡처 이미지와 PDF를 여러 개 한 번에 올릴 수 있어요."
                  disabled={isReadingSourceMaterials}
                  hint={isReadingSourceMaterials ? "자료를 읽는 중입니다." : "최대 8개 · 이미지는 분석용 최적화 · PDF는 텍스트와 전체 페이지 분석"}
                  multiple
                  onSelect={handleSourceMaterialFiles}
                  selectedFileName={sourceMaterialDropzoneLabel}
                  title="제품컷 · 상세페이지 캡처 · PDF를 끌어다 놓기"
                />
              ) : null}

              {isUploadEmpty ? (
                <>
                  {latestDraft ? (
                    <div className={styles.continueRow}>
                      <span className={styles.continueThumb} aria-hidden="true">
                        {latestDraft.thumbnailUrl ? <img alt="" src={latestDraft.thumbnailUrl} /> : <Sparkles size={14} />}
                      </span>
                      <span className={styles.continueText}>
                        이어서 · <strong title={latestDraft.title}>{latestDraft.title}</strong>
                        <small>{latestDraft.sectionCount}섹션 · {formatSavedDraftDate(latestDraft.updatedAt)}</small>
                      </span>
                      <button className={styles.secondaryButton} disabled={isLoadingDraft} onClick={() => void handleLoadDraft(latestDraft.id)} type="button">
                        이어서 하기
                      </button>
                      {drafts.length > 1 ? (
                        <button
                          className={styles.ghostButton}
                          onClick={() => {
                            setIsDraftsOpen(true);
                            logSetupEvent("setup.drafts_sheet_opened", { trigger: "continue_row" });
                          }}
                          type="button"
                        >
                          최근 {drafts.length}
                          <ChevronDown size={14} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <p className={styles.privacyLine}>
                    <Lock size={13} aria-hidden="true" />
                    작업은 이 PC 브라우저에 저장돼요. API 키는 요청할 때만 전송되고 서버·작업 백업에 저장되지 않아요.
                  </p>
                </>
              ) : null}

              {preparedImage ? (
                <div className={`${styles.uploadPreviewCard} ${styles.mainUploadPreviewCard}`}>
                  <div className={styles.previewFrame}>
                    <img alt={preparedImage.fileName} className={styles.selectedImage} src={preparedImage.previewUrl} />
                  </div>
                  <div className={styles.uploadMeta}>
                    <strong title={preparedImage.fileName}>{preparedImageDisplayName}</strong>
                    <div className={styles.metaList}>
                      <div className={styles.metaItem}>
                        <span>전송 포맷</span>
                        <strong>{formatAnalysisMode(preparedImage)}</strong>
                      </div>
                      <div className={styles.metaItem}>
                        <span>분석 크기</span>
                        <strong>{formatOptimizedDimensions(preparedImage)}</strong>
                      </div>
                      <div className={styles.metaItem}>
                        <span>{isLongDetailSampling(preparedImage) ? "상세페이지 절감" : "품질 기준"}</span>
                        <strong>{formatOptimizationSavings(preparedImage)}</strong>
                      </div>
	                      <div className={styles.metaItem}>
	                        <span>생성 참조</span>
	                        <strong>{formatGenerationReference(preparedImage)}</strong>
	                      </div>
	                    </div>
	                  </div>
	                </div>
	              ) : null}

	              {!isUploadEmpty ? (
	              <div className={styles.uploadSideColumn}>
	              {visibleSourceMaterials.length ? (
	                <div className={styles.sourceMaterialList} aria-label="등록된 상세페이지 자료">
	                  {visibleSourceMaterials.map((material) => (
	                    <div
	                      className={material.role === "primary" ? styles.sourceMaterialItemPrimary : styles.sourceMaterialItem}
	                      key={material.id}
	                    >
	                      <span>{material.role === "primary" ? "대표 분석 자료" : formatSourceMaterialKind(material)}</span>
	                      <strong title={material.fileName}>{formatCompactFileName(material.fileName)}</strong>
	                      <small>{formatSourceMaterialDetail(material)}</small>
                          <button className={styles.inlineButton} type="button" onClick={() => {
                            const next = visibleSourceMaterials.filter(item => item.id !== material.id);
                            if (!next.length) { setPreparedImage(null); setSourceMaterials([]); return; }
                            const chosen = next.find(item => item.role === "primary") ?? next[0];
                            setSourceMaterials(next.map(item => ({ ...item, role: item.id === chosen.id ? "primary" : "supporting" })));
                            setPreparedImage(chosen.preparedImage ?? null);
                          }} aria-label={`${material.fileName} 삭제`}>자료 삭제</button>
                          {material.role !== "primary" ? <button className={styles.inlineButton} type="button" onClick={() => {
                            setSourceMaterials(visibleSourceMaterials.map(item => ({ ...item, role: item.id === material.id ? "primary" : "supporting" })));
                            setPreparedImage(material.preparedImage ?? null);
                          }}>대표로 선택</button> : null}
	                    </div>
	                  ))}
	                </div>
	              ) : null}
	              <UploadDropzone
	                accept="image/*,.pdf,application/pdf"
	                compact
	                description="자료를 더 추가하려면 끌어다 놓거나 눌러서 선택하세요."
	                disabled={isReadingSourceMaterials}
	                hint={isReadingSourceMaterials ? "자료를 읽는 중입니다." : "최대 8개 · 이미지는 분석용 최적화 · PDF는 텍스트와 전체 페이지 분석"}
	                multiple
	                onSelect={handleSourceMaterialFiles}
	                title="자료 추가"
	              />
	              </div>
	              ) : null}

              {!isUploadEmpty ? (
              <>
              <details className={styles.optionalFold} open={modelImage ? true : undefined}>
                <summary className={styles.optionalFoldSummary}>
                  <span>모델 이미지 등록 <small>선택 · 특정 인물을 히어로우나 전체 모델컷에 맞출 때만</small></span>
                  <em>{modelImage ? (modelImageUsage ? "등록함" : "사용 방식 선택 필요") : "등록 안 함"}</em>
                  <ChevronDown className={styles.optionalFoldChevron} size={16} aria-hidden="true" />
                </summary>
                {modelUploadSection}
              </details>

              <details className={styles.optionalFold} open={additionalInfo.trim() ? true : undefined}>
                <summary className={styles.optionalFoldSummary}>
                  <span>추가 정보 <small>선택 · 상품명·대상·판매처처럼 자료에 없는 사실</small></span>
                  <em>{additionalInfo.trim() ? "입력함" : "비워둠"}</em>
                  <ChevronDown className={styles.optionalFoldChevron} size={16} aria-hidden="true" />
                </summary>
              <section className={styles.additionalInfoBlock}>
                {uploadContextGuidance ? (
                  <p className={styles.settingsHelper} role="status">
                    {uploadContextGuidance.message}
                  </p>
                ) : null}
                <div className={styles.onboardingBlockHeading}>
                  <span className={styles.sectionStep}>3</span>
                  <div>
                    <span className={styles.panelLabel}>선택 입력</span>
                    <h3 className={styles.optionalUploadTitle}>추가 정보 등록</h3>
                    <p className={styles.optionalUploadDescription}>상품명/카테고리, 타깃, 판매처, 강조할 장점, 금지 표현처럼 이미지에 없는 정보를 적어두세요.</p>
                  </div>
                </div>
                <textarea
                  className={styles.textarea}
                  id="additionalInfo"
                  onBlur={() => {
                    logSetupEvent("setup.additional_info_blurred", {
                      length: additionalInfo.trim().length
                    });
                  }}
                  onChange={(event) => setAdditionalInfo(event.target.value)}
                  placeholder="예: 상품명 부쉬맨 워터프루프 프로 선크림, 카테고리 선케어, 20대 여성, 여름 시즌, 네이버 스마트스토어용"
                  rows={5}
                  value={additionalInfo}
                />
              </section>
              </details>

              <details className={styles.optionalFold} open={customerReviewSource || customerReviewAnalysis ? true : undefined}>
                <summary className={styles.optionalFoldSummary}>
                  <span>고객 후기 <small>선택 · 실제 후기가 없으면 후기 구간을 지어내지 않아요</small></span>
                  <em>{customerReviewAnalysis ? "분석 완료" : customerReviewSource ? "분석 대기" : "등록 안 함"}</em>
                  <ChevronDown className={styles.optionalFoldChevron} size={16} aria-hidden="true" />
                </summary>
              <section className={styles.customerReviewBlock} id="customer-review-upload-section">
                <div className={styles.onboardingBlockHeading}>
                  <span className={styles.sectionStep}>4</span>
                  <div>
                    <span className={styles.panelLabel}>선택 입력</span>
                    <h3 className={styles.optionalUploadTitle}>고객 후기 입력</h3>
                    <p className={styles.optionalUploadDescription}>
                      엑셀/CSV 후기 데이터를 올리면 ChatGPT가 먼저 분석하고, 확인한 결과를 다음 제작 과정과 섹션 전체에 반영합니다.
                    </p>
                  </div>
                </div>

                <div className={styles.reviewUploadPanel}>
                  <input
                    accept=".xlsx,.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className={styles.hiddenInput}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        await handleCustomerReviewFile(file);
                      }
                      event.target.value = "";
                    }}
                    ref={customerReviewInputRef}
                    type="file"
                  />
                  <div className={styles.reviewUploadCopy}>
                    <strong>{customerReviewTitle}</strong>
                    <span>{customerReviewStatusText}</span>
                  </div>
                  <div className={styles.reviewUploadActions}>
                    <button
                      className={styles.inlineButton}
                      disabled={isReadingCustomerReviews || isAnalyzingCustomerReviews}
                      onClick={() => customerReviewInputRef.current?.click()}
                      type="button"
                    >
                      {isReadingCustomerReviews ? <Loader2 className={styles.spinIcon} size={14} /> : <FileText size={14} />}
                      {customerReviewActionLabel}
                    </button>
                    {customerReviewSource ? (
                      <button
                        className={styles.inlineButton}
                        disabled={isReadingCustomerReviews || isAnalyzingCustomerReviews}
                        onClick={() => void analyzeCustomerReviewSource(customerReviewSource)}
                        type="button"
                      >
                        {isAnalyzingCustomerReviews ? <Loader2 className={styles.spinIcon} size={14} /> : <Sparkles size={14} />}
                        {customerReviewAnalysisButtonLabel}
                      </button>
                    ) : null}
                    {customerReviewAnalysis || customerReviewSource ? (
                      <button className={styles.inlineButton} onClick={clearCustomerReviewAnalysis} type="button">
                        <Trash2 size={14} />
                        제거
                      </button>
                    ) : null}
                  </div>
                </div>

                {isAnalyzingCustomerReviews ? (
                  <div className={styles.reviewAnalysisStatus}>
                    <Loader2 className={styles.spinIcon} size={16} />
                    <div>
                      <strong>gpt-5.4-mini가 실제 후기 데이터를 분석 중입니다.</strong>
                      <span>장점, 반복된 아쉬움, 고객 고민/후기 섹션에 쓸 실제 문장을 분리하고 있습니다.</span>
                    </div>
                  </div>
                ) : null}

                {customerReviewAnalysisError || customerReviewRequiresChatGptNotice ? (
                  <div className={styles.reviewAnalysisWarning} role="status">
                    <AlertCircle size={16} />
                    <span>{customerReviewAnalysisError || getCustomerReviewChatGptNotice()}</span>
                  </div>
                ) : null}

                {customerReviewAnalysis ? (
                  <div className={styles.reviewInsightPanel}>
                    <div className={styles.reviewInsightColumn}>
                      <span>부각할 장점</span>
                      <ul>
                        {customerReviewAnalysis.topBenefits.slice(0, 3).map((benefit) => (
                          <li key={benefit}>{benefit}</li>
                        ))}
                      </ul>
                    </div>
                    <div className={styles.reviewInsightColumn}>
                      <span>개선할 아쉬움</span>
                      <ul>
                        {(customerReviewAnalysis.improvementPromises.length
                          ? customerReviewAnalysis.improvementPromises
                          : customerReviewAnalysis.painPoints
                        ).slice(0, 3).map((painPoint) => (
                          <li key={painPoint}>{painPoint}</li>
                        ))}
                      </ul>
                    </div>
                    <div className={styles.reviewQuotePanel}>
                      <span>실제 후기 샘플</span>
                      {customerReviewAnalysis.sampleReviews.slice(0, 3).map((review) => (
                        <blockquote key={review}>{review}</blockquote>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
              </details>

              <div className={styles.compressRow}>
                <span>자료가 크면 전송 전에 압축해요. API 요청 없이 이 PC에서 처리합니다.</span>
                <button className={styles.secondaryButton} disabled={!preparedImage || isCompressingInputs || isReadingSourceMaterials} onClick={() => void handleCompressInputs()} type="button">
                  {isCompressingInputs ? "전체 자료 압축 중…" : "전체 자료 압축 · 무료"}
                </button>
              </div>
              </>
              ) : null}

              {notice.startsWith("전체 자료 압축 완료") ? <p className={styles.settingsHelper} role="status">{notice}</p> : null}

              {errorPanel}

              {!isUploadEmpty ? (
              <div className={styles.setupActions}>
                <span className={styles.setupActionsNote}>자료만 있으면 바로 초안을 만들 수 있어요. 기획과 카피를 한 번에 쓰고, 이미지는 편집 화면에서 구간별로 만듭니다.</span>
                <label className={styles.settingsField}>
                  <span className={styles.fieldLabel}>구간 수</span>
                  <select value={draftSectionCount} onChange={(event) => setDraftSectionCount(Number(event.target.value))}>
                    {PDP_DRAFT_SECTION_LIMIT.options.map((count) => <option key={count} value={count}>{count}구간 안팎{count === PDP_DRAFT_SECTION_LIMIT.default ? " · 기본" : ""}</option>)}
                  </select>
                </label>
                <button
                  className={styles.primaryButtonWide}
                  disabled={!canContinueToDetails}
                  onClick={() => void handleStartSellingPlan()}
                  type="button"
                >
                  <Wand2 size={16} />기획·카피 초안 만들기
                </button>
                <button className={styles.inlineButton} disabled={!canContinueToDetails} onClick={handleContinueToDetails} type="button">
                  <Settings2 size={14} />이미지 모델·톤·비율 설정 (선택)
                </button>
              </div>
              ) : null}
            </section>
            ) : (
            <section className={styles.detailsStage}>
              <aside className={styles.detailsSummary} aria-label="등록 자료 요약">
              {preparedImage ? (
                <div className={styles.detailsSummaryThumb}>
                  <img alt={preparedImage.fileName} src={preparedImage.previewUrl} />
                </div>
              ) : null}
              <div className={styles.materialSummaryPanel}>
                <div className={styles.materialSummaryHeader}>
                  <div>
                    <span className={styles.panelLabel}>등록 자료</span>
                    <strong>첫 화면에서 등록한 자료를 기준으로 생성합니다.</strong>
                  </div>
                  <button
                    className={styles.inlineButton}
                    onClick={() => {
                      setSetupStep("upload");
                      logSetupEvent("setup.material_edit_clicked");
                    }}
                    type="button"
                  >
                    <Upload size={14} />
                    자료 수정
                  </button>
                </div>

                <div className={styles.materialSummaryGrid}>
	                  <div className={styles.materialSummaryItem}>
	                    <span>대표 분석 자료</span>
	                    <strong title={preparedImage?.fileName}>{preparedImageDisplayName || "이미지를 먼저 업로드해 주세요"}</strong>
	                    {preparedImage ? <small>{sourceMaterialSummaryLabel}</small> : null}
	                  </div>
                  <div className={styles.materialSummaryItem}>
                    <span>모델 이미지</span>
                    <strong>{modelImage ? modelImageDisplayName : "등록 안 함"}</strong>
                    {modelImage ? <small>{modelImageUsage === "all-sections" ? "전체 모델컷" : "히어로우 참고"}</small> : null}
                  </div>
                  <div className={styles.materialSummaryItem}>
                    <span>추가 정보</span>
                    <strong>{additionalInfo.trim() ? additionalInfo.trim() : "비워둠"}</strong>
                  </div>
                  <div className={styles.materialSummaryItem}>
                    <span>고객 후기</span>
                    <strong>
	                      {customerReviewAnalysis
	                        ? `후기 파일 분석 완료`
	                        : customerReviewSource
	                          ? `후기 파일 분석 대기`
	                          : "등록 안 함"}
                    </strong>
                    {customerReviewAnalysis ? <small>{customerReviewAnalysis.topBenefits.slice(0, 2).join(" · ")}</small> : null}
                  </div>
                </div>
              </div>
              <button className={`${styles.secondaryButton} ${styles.detailsCompressButton}`} disabled={!preparedImage || isCompressingInputs || isReadingSourceMaterials} onClick={() => void handleCompressInputs()} type="button">
                {isCompressingInputs ? "전체 자료 압축 중…" : "전체 자료 압축 · 무료"}
              </button>
              {notice.startsWith("전체 자료 압축 완료") ? <p className={styles.settingsHelper} role="status">{notice}</p> : null}
              </aside>

              <div className={styles.detailsMain}>
              <div className={styles.sectionHeadingCopy}>
                <span className={styles.startEyebrow}>2 · 생성 설정</span>
                <h2>어떤 모델로 만들까요?</h2>
                <p>상품 자료로 판매 기획과 카피를 먼저 만들고 검토한 뒤, 이미지는 원할 때 생성해요.</p>
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>AI 모델 <small>작업 전체에 적용 · 이 작업에 저장</small></span>
                <div className={styles.providerGrid}>
                  {AI_PROVIDER_OPTIONS.map((option) => {
                    const isLocked = false;
                    const isActive = processingProvider === option.value;
                    const hasKey = option.value === "higgsfield" ? higgsfieldConnection.connected : option.value === "openai" ? hasAvailableOpenAiKey : hasAvailableGeminiKey;

                    return (
                      <button
                        className={isLocked ? styles.providerCardDisabled : isActive ? styles.providerCardActive : styles.providerCard}
                        disabled={isLocked}
                        key={option.value}
                        onClick={() => {
                          setAiProvider(option.value);
                          logSetupEvent("setup.ai_provider_selected", {
                            aiProvider: option.value,
                            hasKey
                          });
                        }}
                        type="button"
                      >
                        <span className={styles.providerIcon}>
                          {option.value === "openai" ? <Bot size={18} /> : <Sparkles size={18} />}
                        </span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                        <em>{isLocked ? "통이미지는 OpenAI / Higgsfield" : hasKey ? option.badge : option.value === "higgsfield" ? "계정 연결 필요" : "API 키 필요"}</em>
                      </button>
                    );
                  })}
                </div>
                {!selectedProviderHasKey ? (
                  <div className={styles.inlineWarning}>
                    <AlertCircle size={16} />
                    {processingProvider === "higgsfield" ? "설정에서 Higgsfield 계정 연결과 제품 분석용 OpenAI 또는 Gemini 키를 확인해 주세요." : `${selectedProviderLabel}를 사용하려면 설정에서 해당 API 키를 저장해 주세요.`}
                  </div>
                ) : null}
              </div>

              {processingProvider === "openai" ? (
                <PdpOpenAiImageControls
                  model={clientSettings.openAiImageModel}
                  quality={clientSettings.openAiImageQuality}
                  onChange={handleOpenAiImageSettingsChange}
                />
              ) : null}

              {processingProvider === "higgsfield" ? <PdpHiggsfieldImageControls referenceCount={1 + (modelImage ? 1 : 0)} preferences={clientSettings} onChange={handleHiggsfieldImageSettingsChange} /> : null}

              <details className={styles.optionalFold} open={desiredTone ? true : undefined}>
                <summary className={styles.optionalFoldSummary}>
                  <span>원하는 톤 <small>선택 · 비워두면 AI가 상품에 맞춰 추천</small></span>
                  <em>{desiredTone || "AI 자동 추천"}</em>
                  <ChevronDown className={styles.optionalFoldChevron} size={16} aria-hidden="true" />
                </summary>
              <div className={styles.fieldGroup}>
                <div className={styles.toneGrid}>
                  {TONE_OPTIONS.map((tone) => {
                    const value = tone === "AI 자동 추천" ? "" : tone;
                    const isActive = desiredTone === value;

                    return (
                      <button
                        className={isActive ? styles.toneButtonActive : styles.toneButton}
                        key={tone}
                        onClick={() => {
                          setDesiredTone(value);
                          logSetupEvent("setup.tone_selected", {
                            tone: value || "auto"
                          });
                        }}
                        type="button"
                      >
                        {tone}
                      </button>
                    );
                  })}
                </div>
              </div>
              </details>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>이미지 비율</span>
                <div className={styles.ratioGrid}>
                  {RATIO_OPTIONS.map((option) => (
                    <button
                      className={option.value === aspectRatio ? styles.ratioButtonActive : styles.ratioButton}
                      key={option.value}
                      onClick={() => {
                        setAspectRatio(option.value);
                        logSetupEvent("setup.aspect_ratio_selected", {
                          aspectRatio: option.value
                        });
                      }}
                      type="button"
                    >
                      <span className={styles.ratioIcon}>{renderRatioIcon(option.icon)}</span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>
              </div>

              {errorPanel}
              </div>

              <div className={styles.decisionBar}>
              <div className={styles.decisionBarInner}>
              <div className={styles.decisionCost}>
              <span className={styles.decisionCostLabel}>예상 이미지 비용 · 기획·카피 분석 비용 별도</span>
              <PdpCostPreview provider={processingProvider} model={processingProvider === "higgsfield" ? clientSettings.higgsfieldImageModel : processingProvider === "openai" ? clientSettings.openAiImageModel : clientSettings.geminiImageModel} quality={processingProvider === "openai" ? clientSettings.openAiImageQuality : processingProvider === "higgsfield" ? clientSettings.higgsfieldImageQuality : "1K"} resolution={clientSettings.higgsfieldImageResolution} variant={clientSettings.higgsfieldImageVariant} aspectRatio={aspectRatio} count={1} countLabel="첫 이미지" attempts={0} />
              </div>
              <button className={styles.primaryButtonWide} disabled={!preparedImage || isCompressingInputs || isReadingSourceMaterials || hasPendingCustomerReviewAnalysis} onClick={() => void handleStartSellingPlan()} type="button">
                <Wand2 size={16} />상품 자료로 판매 기획 시작
              </button>
              </div>
              <p className={styles.settingsHelper}>기획·카피·내용 검수에는 분석 API 비용이 발생해요. 장수는 자료에 맞춰 정하고, 이미지는 카피 검토 후에 만들어요.</p>
              </div>
            </section>
            )}
          </div>
        )}

        </div>
        </div>
      </section>


      

      <PdpSettingsSheet
        onOpenChange={setIsSettingsOpen}
        onSave={handleSaveSettings}
        open={isSettingsOpen}
        settings={clientSettings}
      />
      <SavedDraftsSheet
        drafts={drafts}
        isLoadingDraft={isLoadingDraft}
        isLoadingDrafts={isLoadingDrafts}
        lastSavedAt={lastSavedAt}
        onDeleteDraft={(draftId) => void handleDeleteDraft(draftId)}
        onLoadDraft={(draftId) => void handleLoadDraft(draftId)}
        onOpenChange={setIsDraftsOpen}
        open={isDraftsOpen}
      />
      <PdpBugReportWidget
        context={{
          surface: "setup",
          appState,
          setupStep,
          outputMode,
          aiProvider: processingProvider,
          selectedProviderLabel,
          hasPreparedImage: Boolean(preparedImage),
          hasModelImage: Boolean(modelImage),
          modelImageUsage: modelImageUsage ?? "",
          hasActiveDraft: Boolean(activeDraftId),
          saveState,
          errorMessage: errorMessage || undefined
        }}
      />
    </main>
  );
}

