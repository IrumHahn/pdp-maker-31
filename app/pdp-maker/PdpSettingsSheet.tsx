"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, KeyRound, ShieldCheck, Type } from "lucide-react";
import { GEMINI_IMAGE_MODEL_OPTIONS, OPENAI_IMAGE_MODEL_OPTIONS, getGeminiImageModelName, getOpenAiImageModelName, normalizeGeminiImageModel, normalizeOpenAiImageModel } from "@runacademy/shared";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import styles from "./pdp-maker.module.css";
import { type PdpClientSettings, maskGeminiApiKey, maskOpenAiApiKey } from "./pdp-settings";
import { validateGeminiApiKey, validateOpenAiApiKey } from "./pdp-utils";
import { PdpHiggsfieldImageControls, useHiggsfieldConnection } from "./PdpHiggsfieldImageControls";
import { PdpOpenAiImageControls } from "./PdpOpenAiImageControls";

interface PdpSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PdpClientSettings;
  onSave: (settings: PdpClientSettings) => void;
}

export function PdpSettingsSheet({
  open,
  onOpenChange,
  settings,
  onSave
}: PdpSettingsSheetProps) {
  const higgsfield = useHiggsfieldConnection();
  const [localSettings, setLocalSettings] = useState(settings);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalSettings(settings);
      setErrorMessage("");
      setSuccessMessage("");
      setIsValidating(false);
    }
  }, [open, settings]);

  const maskedGeminiApiKey = localSettings.customGeminiApiKey ? maskGeminiApiKey(localSettings.customGeminiApiKey) : "";
  const maskedOpenAiApiKey = localSettings.customOpenAiApiKey ? maskOpenAiApiKey(localSettings.customOpenAiApiKey) : "";
  const hasGeminiKey = Boolean(localSettings.customGeminiApiKey.trim());
  const hasOpenAiKey = Boolean(localSettings.customOpenAiApiKey.trim());

  const handleSave = async () => {
    const candidateGeminiKey = localSettings.customGeminiApiKey.trim();
    const candidateOpenAiKey = localSettings.customOpenAiApiKey.trim();

    if (localSettings.textProvider === "codex-cli") {
      setIsValidating(true); setErrorMessage("");
      try {
        const response = await fetch("/api/pdp/codex-cli", { method: "POST" });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message);
      } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Codex 연결을 확인하지 못했습니다."); setIsValidating(false); return; }
      setIsValidating(false);
      if (!candidateGeminiKey && !candidateOpenAiKey) { onSave(localSettings); onOpenChange(false); return; }
    } else if (!candidateGeminiKey && !candidateOpenAiKey) {
      setErrorMessage("Gemini 또는 OpenAI API 키 중 하나 이상을 입력해 주세요.");
      return;
    }

    // 저장 시점의 연결 상태로 이미지 엔진을 확정한다: 연결됨 → Higgsfield 우선, 아니면 고른 API 모델.
    localSettings.preferredAiProvider = higgsfield.connected ? "higgsfield" : apiImageProvider;

    setIsValidating(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const messages: string[] = [];

      const validateGemini = (localSettings.preferredAiProvider === "gemini" || (localSettings.preferredAiProvider === "openai" && !candidateOpenAiKey)) || (!candidateOpenAiKey && localSettings.preferredAiProvider === "higgsfield") || !localSettings.preferredAiProvider;
      const validateOpenAi = (localSettings.preferredAiProvider === "openai" || (localSettings.preferredAiProvider === "gemini" && !candidateGeminiKey)) || (Boolean(candidateOpenAiKey) && localSettings.preferredAiProvider === "higgsfield");
      if (candidateGeminiKey && validateGemini) {
        const geminiValidation = await validateGeminiApiKey(candidateGeminiKey, localSettings.preferredAiProvider === "higgsfield");

        if (!geminiValidation.ok) {
          setErrorMessage(geminiValidation.message);
          return;
        }

        messages.push(geminiValidation.message);
      }

      if (candidateOpenAiKey && validateOpenAi) {
        const openAiValidation = await validateOpenAiApiKey(candidateOpenAiKey, localSettings.openAiImageModel, localSettings.preferredAiProvider === "higgsfield");

        if (!openAiValidation.ok) {
          setErrorMessage(openAiValidation.message);
          return;
        }

        messages.push(openAiValidation.message);
      }

      let preferredAiProvider: PdpClientSettings["preferredAiProvider"] = localSettings.preferredAiProvider;
      if (preferredAiProvider === "openai" && !candidateOpenAiKey) {
        preferredAiProvider = candidateGeminiKey ? "gemini" : "";
      }
      if (preferredAiProvider === "gemini" && !candidateGeminiKey) {
        preferredAiProvider = candidateOpenAiKey ? "openai" : "";
      }
      if (!preferredAiProvider) {
        preferredAiProvider = candidateOpenAiKey && !candidateGeminiKey ? "openai" : "gemini";
      }

      onSave({
        ...localSettings,
        openAiImageModel: localSettings.openAiImageModel,
        openAiImageQuality: localSettings.openAiImageQuality,
        customGeminiApiKey: candidateGeminiKey,
        customOpenAiApiKey: candidateOpenAiKey,
        preferredAiProvider
      });
      setSuccessMessage(messages.join(" "));
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "API 키 연결 상태를 확인하지 못했습니다.");
    } finally {
      setIsValidating(false);
    }
  };

  // Higgsfield가 연결되어 있으면 이미지는 항상 Higgsfield. 아니면 아래에서 고른 API 모델.
  const apiImageProvider: "openai" | "gemini" = localSettings.preferredAiProvider === "gemini" ? "gemini" : localSettings.preferredAiProvider === "openai" ? "openai" : (hasOpenAiKey || !hasGeminiKey ? "openai" : "gemini");
  const imageEngine: "openai" | "gemini" | "higgsfield" = higgsfield.connected ? "higgsfield" : apiImageProvider;
  const apiImageModelValue = apiImageProvider === "gemini" ? `gemini:${localSettings.geminiImageModel}` : `openai:${localSettings.openAiImageModel}`;
  const textEngineLabel = localSettings.textProvider === "codex-cli" ? "Codex CLI (로컬)" : hasOpenAiKey ? "OpenAI API" : hasGeminiKey ? "Gemini API" : "키 필요";
  const imageEngineLabel = imageEngine === "higgsfield" ? "Higgsfield 우선" : imageEngine === "openai" ? (hasOpenAiKey ? getOpenAiImageModelName(localSettings.openAiImageModel) : "OpenAI 키 필요") : hasGeminiKey ? getGeminiImageModelName(localSettings.geminiImageModel) : "Gemini 키 필요";
  const clearMessages = () => { if (errorMessage) setErrorMessage(""); if (successMessage) setSuccessMessage(""); };
  const keyField = (label: string, value: string, placeholder: string, masked: string, onChange: (value: string) => void) => (
    <label className={styles.settingsField}>
      <span className={styles.fieldLabel}>{label} <small>{masked ? `저장됨 · ${masked}` : "아직 없음"}</small></span>
      <input autoComplete="off" className={styles.settingsInput} disabled={isValidating} onChange={(event) => { onChange(event.target.value); clearMessages(); }} placeholder={placeholder} type="password" value={value} />
    </label>
  );

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className={styles.settingsSheet} side="right">
        <SheetHeader className={styles.settingsSheetHeader}>
          <div className={styles.settingsSheetKicker}>
            <KeyRound size={14} />
            설정
          </div>
          <SheetTitle className={styles.settingsSheetTitle}>AI 연결</SheetTitle>
          <SheetDescription className={styles.settingsSheetDescription}>
            연결은 두 가지입니다. ① 텍스트(기획·카피 작성)는 OpenAI 또는 Gemini API 키로 합니다. ② 이미지 생성은 같은 API 키로 하거나, Higgsfield 계정을 대신 쓸 수 있습니다. Higgsfield를 써도 ①의 API 키 하나는 필요합니다.
          </SheetDescription>
        </SheetHeader>

        <div className={styles.settingsSheetBody}>
          <section className={styles.settingsCard}>
            <div className={styles.settingsStatusList}>
              <div className={styles.settingsStatusRow}><Type size={14} /><span>① 텍스트</span><strong>{textEngineLabel}</strong></div>
              <div className={styles.settingsStatusRow}><ImageIcon size={14} /><span>② 이미지</span><strong>{imageEngineLabel}</strong></div>
            </div>
          </section>

          <section className={styles.settingsCard}>
            <div className={styles.settingsCardHeader}>
              <div>
                <span className={styles.panelLabel}>① 텍스트 · 기획과 카피</span>
                <h3 className={styles.settingsCardTitle}>API 키</h3>
              </div>
              <span className={hasGeminiKey || hasOpenAiKey ? styles.settingsStatusStrong : styles.settingsStatusSoft}>{hasGeminiKey || hasOpenAiKey ? "저장됨" : "미설정"}</span>
            </div>
            <p className={styles.settingsHelper}>둘 중 하나만 있으면 됩니다. 둘 다 있으면 텍스트 작성은 OpenAI를 씁니다. 이 키는 ②에서 OpenAI·Gemini 이미지 생성에도 그대로 쓰입니다.</p>
            {keyField("OpenAI API 키", localSettings.customOpenAiApiKey, "sk-...", maskedOpenAiApiKey, (value) => setLocalSettings((current) => ({ ...current, customOpenAiApiKey: value })))}
            {keyField("Gemini API 키", localSettings.customGeminiApiKey, "AIza...", maskedGeminiApiKey, (value) => setLocalSettings((current) => ({ ...current, customGeminiApiKey: value })))}
            {process.env.NODE_ENV === "development" ? <label className={styles.settingsField}>
              <span className={styles.fieldLabel}>텍스트 작성 엔진 <small>로컬 테스트 전용 · 배포본에는 없음</small></span>
              <select value={localSettings.textProvider ?? "api"} disabled={isValidating} onChange={event => setLocalSettings(current => ({ ...current, textProvider: event.target.value as "api" | "codex-cli" }))}>
                <option value="api">위 API 키 사용 (비용 발생)</option>
                <option value="codex-cli">Codex CLI · 이 PC의 ChatGPT 로그인 (API 비용 없음)</option>
              </select>
            </label> : null}
          </section>

          <section className={styles.settingsCard}>
            <div className={styles.settingsCardHeader}>
              <div>
                <span className={styles.panelLabel}>② 이미지 생성</span>
                <h3 className={styles.settingsCardTitle}>{imageEngine === "higgsfield" ? "Higgsfield 계정으로 생성" : "API 이미지 모델"}</h3>
              </div>
              <span className={imageEngine === "higgsfield" || (apiImageProvider === "openai" ? hasOpenAiKey : hasGeminiKey) ? styles.settingsStatusStrong : styles.settingsStatusSoft}>{imageEngineLabel}</span>
            </div>
            <p className={styles.settingsHelper}>Higgsfield 계정을 연결하면 이미지는 항상 Higgsfield 크레딧으로 만듭니다. 연결하지 않으면 ①의 API 키로 아래 모델을 씁니다. 텍스트 작성은 어느 쪽이든 ①의 API 키를 씁니다.</p>

            {imageEngine !== "higgsfield" ? <>
              <label className={styles.settingsField}>
                <span className={styles.fieldLabel}>이미지 모델</span>
                <select value={apiImageModelValue} disabled={isValidating} onChange={(event) => { const [provider, model] = event.target.value.split(":"); setLocalSettings((current) => provider === "gemini" ? { ...current, preferredAiProvider: "gemini", geminiImageModel: normalizeGeminiImageModel(model) } : { ...current, preferredAiProvider: "openai", openAiImageModel: normalizeOpenAiImageModel(model) }); clearMessages(); }}>
                  <optgroup label={`OpenAI${hasOpenAiKey ? "" : " · 키 필요"}`}>
                    {OPENAI_IMAGE_MODEL_OPTIONS.map((option) => <option key={option.value} value={`openai:${option.value}`} disabled={!hasOpenAiKey}>{option.label}</option>)}
                  </optgroup>
                  <optgroup label={`Gemini${hasGeminiKey ? "" : " · 키 필요"}`}>
                    {GEMINI_IMAGE_MODEL_OPTIONS.map((option) => <option key={option.value} value={`gemini:${option.value}`} disabled={!hasGeminiKey}>{option.label}</option>)}
                  </optgroup>
                </select>
              </label>
              <p className={styles.settingsHelper}>{apiImageProvider === "openai" ? OPENAI_IMAGE_MODEL_OPTIONS.find((option) => option.value === localSettings.openAiImageModel)?.description : GEMINI_IMAGE_MODEL_OPTIONS.find((option) => option.value === localSettings.geminiImageModel)?.description} 장당 API 요금이 청구됩니다.</p>
              {apiImageProvider === "openai" ? <PdpOpenAiImageControls model={localSettings.openAiImageModel} quality={localSettings.openAiImageQuality} disabled={isValidating} onChange={(preferences) => { setLocalSettings((current) => ({ ...current, ...preferences })); clearMessages(); }} /> : null}
            </> : null}

            <details className={styles.compactEditorGroup} open={imageEngine === "higgsfield" ? true : undefined}>
              <summary>Higgsfield 계정 {higgsfield.connected ? "· 연결됨 (이미지에 우선 사용)" : "· 미연결 (연결하면 우선 사용)"}</summary>
              {higgsfield.connected && typeof higgsfield.credits === "number" ? <p className={styles.settingsHelper}>잔여 크레딧: {higgsfield.credits}</p> : null}
              {higgsfield.error ? <div className={styles.settingsError}>{higgsfield.error}</div> : null}
              <div className={styles.settingsActions}>
                <button className={styles.primaryButton} type="button" onClick={() => { window.open("/api/pdp/higgsfield/connect", "pdp-higgsfield-login", "popup,width=600,height=760"); }}>{higgsfield.connected ? "계정 다시 연결" : "Higgsfield 계정 연결"}</button>
                <button className={styles.secondaryButton} type="button" disabled={higgsfield.checking} onClick={() => void higgsfield.refresh()}>연결 확인</button>
                {higgsfield.connected ? <button className={styles.secondaryButton} type="button" onClick={async () => { await fetch("/api/pdp/higgsfield/disconnect", { method: "POST" }); await higgsfield.refresh(); }}>연결 해제 · API 모델로 전환</button> : null}
              </div>
              {higgsfield.connected ? <PdpHiggsfieldImageControls preferences={localSettings} disabled={isValidating} onChange={(preferences) => setLocalSettings((current) => ({ ...current, ...preferences }))} /> : null}
            </details>
          </section>

          <section className={styles.settingsCard}>
            <div className={styles.settingsLockedNotice}>
              <ShieldCheck size={16} />
              API 키는 이 브라우저에만 저장되고 요청 때 서버를 거쳐 공급자로 전달됩니다. 서버에 저장하지 않습니다. 도구 이용료와 API 과금은 별개이며 ChatGPT·Gemini 채팅 구독으로는 API 비용을 낼 수 없습니다.
            </div>
            {errorMessage ? <div className={styles.settingsError}>{errorMessage}</div> : null}
            {successMessage ? <div className={styles.settingsSuccess}>{successMessage}</div> : null}
            <div className={styles.settingsActions}>
              <button className={styles.secondaryButton} disabled={isValidating} onClick={() => onOpenChange(false)} type="button">닫기</button>
              <button className={styles.primaryButton} disabled={isValidating} onClick={() => void handleSave()} type="button">{isValidating ? "연결 확인 중..." : "저장"}</button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
