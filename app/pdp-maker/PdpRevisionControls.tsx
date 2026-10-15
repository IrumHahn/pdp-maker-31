"use client";

import { useState } from "react";
import { getPdpCopyIssues, isPdpImageCopyStale } from "@runacademy/shared";
import type { ImageGenOptions, PdpAiProvider, SectionBlueprint } from "@runacademy/shared";
import styles from "./pdp-maker.module.css";
import { PdpHiggsfieldCostPreview } from "./PdpHiggsfieldCostPreview";

export function PdpRevisionControls({ section, options, originalImage, fullImage, disabled, onApplyText, onOptionsChange, onSectionChange }: {
  section: SectionBlueprint;
  options: ImageGenOptions;
  originalImage: string;
  fullImage: boolean;
  disabled: boolean;
  onApplyText?: () => void;
  onOptionsChange: (patch: Partial<ImageGenOptions>) => void;
  onSectionChange: (patch: Partial<SectionBlueprint>) => void;
}) {
  const copyIssues = getPdpCopyIssues(section, fullImage);
  const stale = fullImage && isPdpImageCopyStale(section);
  return <div className={styles.copySection}>
    <h3>이 페이지의 문구</h3>
    <p className={styles.settingsHelper}>문구 저장에는 API 비용이 들지 않습니다. {fullImage ? "이미지 안의 글자는 다시 생성하면 반영됩니다." : "생성 후 텍스트 레이어를 직접 수정할 수 있습니다."}</p>
    {copyIssues.length ? <div role="alert" className={styles.warningBox}><strong>생성 전 카피 수정 필요</strong><ul>{copyIssues.map(issue => <li key={issue}>{issue}</li>)}</ul><p>전체 카피 다시 작성 또는 직접 편집으로 수정할 수 있습니다.</p></div> : null}
    {stale ? <p role="status" className={styles.warningBox}>카피가 변경됐습니다. 현재 이미지에는 이전 문구가 남아 있습니다. 이미지 재생성 후 반영됩니다.</p> : null}

    <label className={styles.fieldLabel}>헤드라인<input className={styles.input} disabled={disabled} value={section.headline} onChange={event => onSectionChange({ headline: event.target.value })} /></label>
    <label className={styles.fieldLabel}>설명<textarea className={styles.textarea} disabled={disabled} value={section.subheadline} onChange={event => onSectionChange({ subheadline: event.target.value })} /></label>
    <label className={styles.fieldLabel}>핵심 문구 · 한 줄에 하나<textarea className={styles.textarea} disabled={disabled} value={section.bullets.join("\n")} onChange={event => onSectionChange({ bullets: event.target.value.split("\n").filter(Boolean) })} /></label>
    {!fullImage && section.generatedImage ? <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={onApplyText}>현재 문구를 텍스트 레이어에 적용</button> : null}

    <details><summary>보존 조건·원본 비교·이력</summary>
    <label className={styles.fieldLabel}>바꾸면 안 되는 것<textarea className={styles.textarea} disabled={disabled} placeholder="예: 제품 형태, 날개 수, 버튼 위치, 색상, 로고" value={options.preserveConstraints ?? ""} onChange={event => onOptionsChange({ preserveConstraints: event.target.value })} /></label>
    <p className={styles.settingsHelper}>수정 요청에는 제품 원본과 현재 결과를 함께 보냅니다. AI가 만든 제품은 원본과 직접 비교해 주세요.</p>
    {section.generation ? <p role="status" className={styles.settingsHelper}>{({ queued: "대기", running: "생성 중", succeeded: "이미지 수신 완료", failed: "실패", unknown: "응답 확인 필요" })[section.generation.status]} · {section.generation.provider} · {section.generation.model} · {section.generation.quality} · 요청 {section.generation.attempts}회{section.generation.usage ? ` · 공급자 보고 토큰 입력 ${section.generation.usage.inputTokens ?? "미제공"} / 출력 ${section.generation.usage.outputTokens ?? "미제공"}` : ""}{section.generation.message ? ` · ${section.generation.message}` : ""}</p> : null}
    {section.generatedImage ? <div className={styles.settingsHelper} role="status">
      {stale ? '카피가 변경된 이미지입니다. 아래 최근 검사 결과와 새 문구를 함께 확인하세요.' : section.qualityReview?.status === 'passed' ? 'AI 문구·제품 검사 통과 · 최종 원본 비교는 직접 확인해 주세요.' : section.qualityReview?.status === 'needs-review' ? '이미지 문구·제품 확인 필요' : '이미지 문구·제품 검사 미완료'}
      {section.qualityReview?.issues.length ? <ul>{section.qualityReview.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul> : null}
    </div> : null}
    {section.copyEvidence?.length ? <details><summary>카피의 상품 자료 근거</summary><ul>{section.copyEvidence.map((fact, i) => <li key={i}>{fact}</li>)}</ul></details> : null}
    {section.referenceReviewRequired ? <p className={styles.warningBox}>인물 참조 검증을 통과하지 못했거나 검증 응답을 받지 못했습니다. 결과를 검토하세요. 추가 이미지를 자동 생성하지 않습니다.</p> : null}
    {section.generation?.status === "unknown" ? <p className={styles.warningBox}>자동 재시도하지 않습니다. 공급자 결과·사용량을 확인한 뒤 아래 버튼으로 다시 생성하면 추가 비용이 발생할 수 있습니다.</p> : null}
    {section.previousGeneratedImage ? <button className={styles.secondaryButton} type="button" disabled={disabled} onClick={() => onSectionChange({ generatedImage: section.previousGeneratedImage, previousGeneratedImage: section.generatedImage, imageCopySignature: undefined, qualityReview: undefined, generation: section.generation ? { ...section.generation, message: "이전 이미지로 되돌렸습니다." } : undefined })}>이전 이미지로 되돌리기</button> : null}
    {section.generatedImage ? <>
      <label className={styles.checkboxRow}><input type="checkbox" disabled={disabled} checked={Boolean(section.originalProduct)} onChange={event => onSectionChange({ originalProduct: event.target.checked ? { x: 20, y: 20, width: 180, height: 180 } : undefined })} /><span>원본 제품 사진 고정</span></label>
      <p className={styles.settingsHelper}>원본 참조 사진을 그대로 올립니다. 캔버스에서 이동·크기 조절할 수 있고 다운로드에도 반영됩니다. 제품만 남기려면 투명 배경 제품컷을 대표 자료로 등록하세요.</p>
      <details><summary>원본과 결과 비교</summary><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><figure style={{ margin: 0 }}><img alt="제품 원본 비교" src={originalImage} style={{ width: "100%" }} /><figcaption>원본</figcaption></figure><figure style={{ margin: 0 }}><img alt="생성 결과 비교" src={section.generatedImage} style={{ width: "100%" }} /><figcaption>생성 결과</figcaption></figure></div></details>
    </> : null}
    </details>
  </div>;
}

export function PdpCostPreview({ provider, model, quality, resolution, variant, aspectRatio = "9:16", count, countLabel = "미생성 이미지", attempts }: { provider: PdpAiProvider; model: string; quality: string; resolution?: string; variant?: string; aspectRatio?: string; count: number; countLabel?: string; attempts: number }) {
  const [estimates, setEstimates] = useState<Record<string, { low: string; high: string }>>({});
  const key = `${provider}:${model}:${quality}`;
  const estimate = estimates[key] ?? { low: "", high: "" };
  const low = Number(estimate.low), high = Number(estimate.high);
  const hasEstimate = estimate.low !== "" && estimate.high !== "" && Number.isFinite(low) && Number.isFinite(high) && low >= 0 && high >= low;
  if (provider === "higgsfield") return <PdpHiggsfieldCostPreview model={model} quality={quality} resolution={resolution} variant={variant} aspectRatio={aspectRatio} count={count} countLabel={countLabel} attempts={attempts} />;
  return <details className={styles.copySection}>
    <summary>생성 비용 확인 · {countLabel} {count}장 · 이미지 요청 {attempts}회</summary>
    <p className={styles.settingsHelper}>{model} · {quality}. 도구 이용료와 AI API 비용은 별개입니다. ChatGPT·Gemini 채팅 구독으로 API 비용이 결제되지 않습니다.</p>
    {provider === "gemini" ? <p className={styles.settingsHelper}>1K 이미지 출력만 장당 $0.067, {count}장 ${(.067 * count).toFixed(3)}. 입력·분석·인물 검증·재생성 비용은 추가됩니다. <a href="https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-image" target="_blank" rel="noreferrer">Google 공식 가격</a> · 2026-10-05 확인</p> : <p className={styles.settingsHelper}>Image 2.5는 모델·품질·크기·입력 토큰에 따라 과금됩니다. 고정 장당 가격으로 계산하지 않습니다. <a href="https://developers.openai.com/api/docs/guides/image-generation" target="_blank" rel="noreferrer">OpenAI 공식 안내</a>에서 조건을 확인하세요.</p>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><label>예상 장당 최소 $<input aria-label="예상 장당 최소 비용" type="number" min="0" step="0.001" value={estimate.low} onChange={event => setEstimates(current => ({ ...current, [key]: { ...estimate, low: event.target.value } }))} style={{ width: 90 }} /></label><label>예상 장당 최대 $<input aria-label="예상 장당 최대 비용" type="number" min="0" step="0.001" value={estimate.high} onChange={event => setEstimates(current => ({ ...current, [key]: { ...estimate, high: event.target.value } }))} style={{ width: 90 }} /></label></div>
    <p>{hasEstimate ? `누락 ${count}장 예상 $${(low * count).toFixed(3)}–$${(high * count).toFixed(3)} · 사용자 입력 기준` : "총액 미확정 · 공식 계산기/실제 사용량의 장당 범위를 입력하면 총 예상 범위를 계산합니다."}</p>
    <p className={styles.settingsHelper}>실제 청구액은 공급자 사용량에서 확인하세요. 모델·품질마다 입력한 견적을 따로 유지합니다. 실패나 응답 확인 필요 요청도 과금될 수 있습니다. Gemini 인물 확인 실패 시 추가 이미지를 자동 생성하지 않습니다.</p>
  </details>;
}
