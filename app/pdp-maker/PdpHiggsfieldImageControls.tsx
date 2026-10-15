"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { getHiggsfieldReferenceLimit, normalizeHiggsfieldPreferences, type HiggsfieldImagePreferences, type HiggsfieldModel } from "@runacademy/shared";
import styles from "./pdp-maker.module.css";
export function useHiggsfieldConnection() {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState<number | undefined>();
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/pdp/higgsfield/status", { cache: "no-store" });
      const data = await response.json();
      setConnected(Boolean(data.ok && data.connected)); setCredits(data.credits); setError(data.ok ? "" : data.message ?? "연결 상태를 확인하지 못했습니다.");
    } catch { setConnected(false); setError("Higgsfield 연결 상태를 확인하지 못했습니다."); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    const onMessage = (event: MessageEvent) => { if (event.origin === window.location.origin && event.data?.type === "pdp-higgsfield-connected") void refresh(); };
    window.addEventListener("focus", onFocus); window.addEventListener("message", onMessage);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pdp-higgsfield") : null;
    if (channel) channel.onmessage = () => { void refresh(); };
    return () => { window.removeEventListener("focus", onFocus); window.removeEventListener("message", onMessage); channel?.close(); };
  }, [refresh]);
  return { connected, checking, credits, error, refresh };
}
const OPTION_LABELS: Record<string, string> = { low: "빠르게 · Low", medium: "표준 · Medium", high: "고품질 · High", xhigh: "더 높은 품질 · XHigh", max: "최고 품질 · Max", sunburst: "Sunburst", flare: "Flare" };
export async function validateHiggsfieldReferenceCount(modelId: string, count: number) {
  const response = await fetch("/api/pdp/higgsfield/models", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message ?? "Higgsfield 모델 제한을 확인하지 못했습니다.");
  const model = (data.models as HiggsfieldModel[]).find((item) => item.id === modelId);
  if (!model) throw new Error("선택한 Higgsfield 모델을 다시 확인해 주세요.");
  const max = getHiggsfieldReferenceLimit(model);
  if (max !== undefined && count > max) throw new Error(`${model.name}은 레퍼런스 ${max}장까지 지원합니다. 현재 ${count}장(제품·인물·수정 기준)을 사용하므로 다른 모델을 선택하거나 인물/수정 기준을 줄여 주세요.`);
}
export function PdpHiggsfieldImageControls({ preferences, onChange, disabled = false, referenceCount }: { preferences: HiggsfieldImagePreferences; onChange: (value: HiggsfieldImagePreferences) => void; disabled?: boolean; referenceCount?: number }) {
  const id = useId();
  const [models, setModels] = useState<HiggsfieldModel[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/pdp/higgsfield/models", { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.message);
      setModels(data.models);
    } catch (error) { setModels([]); setError(error instanceof Error ? error.message : "Higgsfield 모델 목록을 읽지 못했습니다."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const selected = models.find((model) => model.id === preferences.higgsfieldImageModel);
  const referenceLimit = selected ? getHiggsfieldReferenceLimit(selected) : undefined;
  useEffect(() => {
    if (!models.length) return;
    const model = models.find((item) => item.id === preferences.higgsfieldImageModel) ?? models.find((item) => item.id === "gpt_image_2_5") ?? models[0];
    const normalized = normalizeHiggsfieldPreferences(model, preferences);
    if (Object.keys(normalized).some((key) => normalized[key as keyof HiggsfieldImagePreferences] !== preferences[key as keyof HiggsfieldImagePreferences])) onChange(normalized);
  }, [models, preferences, onChange]);
  return <div className={styles.fieldGroup}>
    <div className={styles.settingsField}><label className={styles.fieldLabel} htmlFor={`${id}-model`}>Higgsfield 이미지 모델</label>
      <select id={`${id}-model`} className={styles.select} disabled={disabled || loading || !models.length} value={selected?.id ?? ""} onChange={(event) => {
        const model = models.find((item) => item.id === event.target.value); if (model) onChange(normalizeHiggsfieldPreferences(model, { ...preferences, higgsfieldImageModel: model.id }));
      }}><option value="" disabled>{loading ? "모델 목록 확인 중…" : "모델 선택"}</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name === model.id ? model.id.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") : model.name}</option>)}</select>
    </div>
    {error ? <div className={styles.settingsError}>{error}<button className={styles.secondaryButton} type="button" onClick={() => void load()}>목록 다시 확인</button></div> : null}
    {selected ? <p className={styles.settingsHelper}>제품 레퍼런스 지원 · 비율 {selected.aspect_ratios.filter((ratio) => ratio !== "auto").join(", ")}</p> : null}
    {selected ? <p className={referenceCount !== undefined && referenceLimit !== undefined && referenceCount > referenceLimit ? styles.settingsError : styles.settingsHelper}>
      레퍼런스 {referenceLimit === undefined ? "최대 수 정보 미제공" : `최대 ${referenceLimit}장`}{referenceCount !== undefined ? ` · 현재 생성에 ${referenceCount}장 사용` : ""}. 제품 대표 이미지·인물·수정 기준 이미지를 합산합니다. 보조 자료는 제품 분석에 사용됩니다.
      {referenceCount !== undefined && referenceLimit !== undefined && referenceCount > referenceLimit ? " 다른 모델을 선택하거나 인물/수정 기준을 줄여 주세요. 생성 전 차단됩니다." : ""}
    </p> : null}
    {([['variant', '모델 버전', 'higgsfieldImageVariant'], ['quality', '이미지 품질', 'higgsfieldImageQuality'], ['resolution', '이미지 해상도', 'higgsfieldImageResolution']] as const).map(([name, label, field]) => {
      const parameter = selected?.parameters.find((item) => item.name === name);
      if (!parameter?.options?.length) return null;
      return <div className={styles.settingsField} key={name}><label className={styles.fieldLabel} htmlFor={`${id}-${name}`}>{label}</label><select className={styles.select} id={`${id}-${name}`} disabled={disabled} value={preferences[field]} onChange={(event) => onChange({ ...preferences, [field]: event.target.value })}>{parameter.options.map((value) => <option key={String(value)} value={String(value)}>{OPTION_LABELS[String(value)] ?? String(value).toUpperCase()}</option>)}</select></div>;
    })}
    {selected && !selected.parameters.some((item) => item.name === "quality" && item.options?.length) ? <p className={styles.settingsHelper}>이 모델은 별도 품질 단계 없이 기본 품질로 생성합니다.</p> : null}
    <p className={styles.settingsHelper}>선택은 첫 이미지, 추가 섹션과 재생성에 적용됩니다. MCP 생성에는 Higgsfield 크레딧을 사용합니다.</p>
  </div>;
}
