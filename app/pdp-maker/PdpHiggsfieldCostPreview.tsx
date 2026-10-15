"use client";

import { useEffect, useState } from "react";
import { getHiggsfieldCreditTotal, type HiggsfieldCostOptions, type HiggsfieldCostQuote } from "@runacademy/shared";
import styles from "./pdp-maker.module.css";

const formatCredits = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 6 });

/* 1크레딧의 대략적인 값. Higgsfield 공식 가격 구성(연간 요금제·추가 충전·자동 충전)에서 계산한 범위다.
   ULTRA 연간 $70/3,000 ≈ $0.023 … 500크레딧 충전 $26 ≈ $0.052. 할인·요금제에 따라 달라지므로
   화면에는 항상 '약'과 기준일을 함께 보여준다. 가격이 바뀌면 이 한 곳만 고친다. */
const HIGGSFIELD_CREDIT_PRICE_REFERENCE = { checkedAt: "2026-10-10", usdPerCreditLow: 0.023, usdPerCreditHigh: 0.052, krwPerUsd: 1400 };
const roundKrw = (value: number) => value < 100 ? Math.round(value / 10) * 10 : value < 1000 ? Math.round(value / 50) * 50 : Math.round(value / 100) * 100;
const formatKrwRange = (credits: number) => {
  const { usdPerCreditLow, usdPerCreditHigh, krwPerUsd } = HIGGSFIELD_CREDIT_PRICE_REFERENCE;
  const low = roundKrw(credits * usdPerCreditLow * krwPerUsd), high = roundKrw(credits * usdPerCreditHigh * krwPerUsd);
  return `약 ${low.toLocaleString("ko-KR")}~${high.toLocaleString("ko-KR")}원`;
};
export function PdpHiggsfieldCostPreview({ model, quality, resolution, variant, aspectRatio, count, countLabel, attempts }: HiggsfieldCostOptions & { count: number; countLabel: string; attempts: number }) {
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; quote?: HiggsfieldCostQuote; error?: string }>();
  const key = JSON.stringify([model, quality, resolution, variant, aspectRatio]);
  const quote = result?.key === key ? result.quote : undefined;
  const error = result?.key === key ? result.error : undefined;
  const loading = !quote && !error;
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    // Wait for a sequence of option changes to settle; never display an older quote.
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ model, aspectRatio });
        if (quality) query.set("quality", quality);
        if (resolution) query.set("resolution", resolution);
        if (variant) query.set("variant", variant);
        const response = await fetch(`/api/pdp/higgsfield/cost?${query}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.ok || !data.quote) throw new Error(data.message ?? "공식 비용을 조회하지 못했습니다.");
        if (!controller.signal.aborted) setResult({ key, quote: data.quote });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "공식 비용을 조회하지 못했습니다." });
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, model, quality, resolution, variant, aspectRatio, refresh]);
  useEffect(() => {
    const reload = () => setRefresh(value => value + 1);
    const onMessage = (event: MessageEvent) => { if (event.origin === window.location.origin && event.data?.type === "pdp-higgsfield-connected") reload(); };
    window.addEventListener("focus", reload); window.addEventListener("message", onMessage);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pdp-higgsfield") : null;
    if (channel) channel.onmessage = reload;
    return () => { window.removeEventListener("focus", reload); window.removeEventListener("message", onMessage); channel?.close(); };
  }, []);
  const options = quote?.options;
  const total = quote ? getHiggsfieldCreditTotal(quote.creditsPerImage, count) : 0;
  return <div className={styles.costPreview}>
    <p className={styles.costPreviewLine} aria-live="polite" aria-busy={loading}>
      {loading ? <span className={styles.costPreviewMuted}>예상 비용 조회 중…</span> : null}
      {error ? <span className={styles.costPreviewError}>{error}</span> : null}
      {quote ? count > 0 ? <>
        <strong>{countLabel} {count}장 · {formatCredits(total)}크레딧</strong>
        <span>({formatKrwRange(total)})</span>
        {count > 1 ? <span className={styles.costPreviewMuted}>1장 {formatCredits(quote.creditsPerImage)}크레딧</span> : null}
      </> : <>
        <strong>추가로 만들 이미지 없음</strong>
        <span className={styles.costPreviewMuted}>다시 만들면 1장 {formatCredits(quote.creditsPerImage)}크레딧 ({formatKrwRange(quote.creditsPerImage)})</span>
      </> : null}
    </p>
    <details className={styles.costPreviewDetails}>
      <summary>{quote ? "요금제에 따라 다름 · 자세히" : "자세히"}</summary>
      {quote ? <p>{options!.model} · {options!.quality || "기본 품질"}{options!.resolution ? ` · ${options!.resolution.toUpperCase()}` : ""}{options!.variant ? ` · ${options!.variant}` : ""} · {options!.aspectRatio}</p> : null}
      {quote ? <p>Higgsfield 공식 견적 · {new Date(quote.quotedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 조회 · 옵션을 바꾸면 자동으로 다시 조회해요.</p> : null}
      <p>1크레딧 ≈ ${HIGGSFIELD_CREDIT_PRICE_REFERENCE.usdPerCreditLow}~{HIGGSFIELD_CREDIT_PRICE_REFERENCE.usdPerCreditHigh} · 요금제·충전 방식에 따라 달라요 ({HIGGSFIELD_CREDIT_PRICE_REFERENCE.checkedAt} 확인, 1달러 {HIGGSFIELD_CREDIT_PRICE_REFERENCE.krwPerUsd.toLocaleString("ko-KR")}원 가정).</p>
      <p>이 작업의 이미지 요청 {attempts}회 · 실제 차감은 Higgsfield 사용 내역에서 확인하세요. 분석용 OpenAI·Gemini API 비용은 별도예요. <a href="https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp" target="_blank" rel="noreferrer">Higgsfield 공식 안내</a></p>
      <button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>공식 비용 다시 조회 · 무료</button>
    </details>
  </div>;
}
