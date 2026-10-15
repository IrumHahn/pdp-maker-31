"use client";

import { useId } from "react";
import {
  OPENAI_IMAGE_MODEL_OPTIONS,
  OPENAI_IMAGE_QUALITY_OPTIONS,
  normalizeOpenAiImageModel,
  normalizeOpenAiImageQuality,
  type OpenAiImageModel,
  type OpenAiImagePreferences,
  type OpenAiImageQuality
} from "@runacademy/shared";
import styles from "./pdp-maker.module.css";

interface Props {
  model: OpenAiImageModel;
  quality: OpenAiImageQuality;
  onChange: (preferences: OpenAiImagePreferences) => void;
  disabled?: boolean;
}

export function PdpOpenAiImageControls({ model, quality, onChange, disabled = false }: Props) {
  const id = useId();
  return (
    <div className={styles.fieldGroup}>
      <div className={styles.settingsField}>
        <label className={styles.fieldLabel} htmlFor={`${id}-model`}>OpenAI 이미지 모델</label>
        <select
          id={`${id}-model`}
          className={styles.select}
          disabled={disabled}
          onChange={(event) => onChange({ openAiImageModel: normalizeOpenAiImageModel(event.target.value), openAiImageQuality: quality })}
          value={model}
        >
          {OPENAI_IMAGE_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <p className={styles.settingsHelper}>{OPENAI_IMAGE_MODEL_OPTIONS.find((option) => option.value === model)?.description}</p>
      <div className={styles.settingsField}>
        <label className={styles.fieldLabel} htmlFor={`${id}-quality`}>이미지 품질</label>
        <select
          id={`${id}-quality`}
          className={styles.select}
          disabled={disabled}
          onChange={(event) => onChange({ openAiImageModel: model, openAiImageQuality: normalizeOpenAiImageQuality(event.target.value) })}
          value={quality}
        >
          {OPENAI_IMAGE_QUALITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <p className={styles.settingsHelper}>높은 품질은 생성 시간과 비용이 늘어날 수 있습니다. 선택은 다음 이미지 생성과 재생성에 적용됩니다.</p>
    </div>
  );
}
