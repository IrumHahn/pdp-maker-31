"use client";

import { DEFAULT_GEMINI_IMAGE_PREFERENCES, DEFAULT_HIGGSFIELD_IMAGE_PREFERENCES, DEFAULT_OPENAI_IMAGE_PREFERENCES, normalizeGeminiImageModel, normalizeOpenAiImageModel, normalizeOpenAiImageQuality } from "@runacademy/shared";
import type { GeminiImagePreferences, HiggsfieldImagePreferences, OpenAiImagePreferences, PdpAiProvider } from "@runacademy/shared";

export interface PdpClientSettings extends OpenAiImagePreferences, GeminiImagePreferences, HiggsfieldImagePreferences {
  /** 로컬 테스트 전용. 배포본에서는 항상 api. */
  textProvider?: "api" | "codex-cli";
  customGeminiApiKey: string;
  customOpenAiApiKey: string;
  preferredAiProvider: PdpAiProvider | "";
}

const PDP_SETTINGS_STORAGE_KEY = "hanirum-pdp-maker-settings-v1";

const DEFAULT_SETTINGS: PdpClientSettings = {
  ...DEFAULT_HIGGSFIELD_IMAGE_PREFERENCES,
  ...DEFAULT_OPENAI_IMAGE_PREFERENCES,
  ...DEFAULT_GEMINI_IMAGE_PREFERENCES,
  customGeminiApiKey: "",
  customOpenAiApiKey: "",
  preferredAiProvider: ""
};

export function loadPdpClientSettings(): PdpClientSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const rawValue = window.localStorage.getItem(PDP_SETTINGS_STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(rawValue) as Partial<PdpClientSettings>;
    return normalizePdpClientSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function savePdpClientSettings(settings: PdpClientSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PDP_SETTINGS_STORAGE_KEY, JSON.stringify(normalizePdpClientSettings(settings)));
}

export function resolveGeminiApiKeyHeaderValue(settings?: Pick<PdpClientSettings, "customGeminiApiKey">) {
  const nextSettings = settings ?? loadPdpClientSettings();
  const trimmed = nextSettings.customGeminiApiKey.trim();
  return trimmed || null;
}

export function resolveOpenAiApiKeyHeaderValue(settings?: Pick<PdpClientSettings, "customOpenAiApiKey">) {
  const nextSettings = settings ?? loadPdpClientSettings();
  const trimmed = nextSettings.customOpenAiApiKey.trim();
  return trimmed || null;
}

export function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= 18) {
    const visiblePrefixLength = Math.min(8, trimmed.length);
    return `${trimmed.slice(0, visiblePrefixLength)}${"•".repeat(Math.max(4, trimmed.length - visiblePrefixLength))}`;
  }

  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

export const maskGeminiApiKey = maskApiKey;
export const maskOpenAiApiKey = maskApiKey;

function normalizePdpClientSettings(settings?: Partial<PdpClientSettings> | null): PdpClientSettings {
  const preferredAiProvider =
    settings?.preferredAiProvider === "gemini" || settings?.preferredAiProvider === "openai" || settings?.preferredAiProvider === "higgsfield"
      ? settings.preferredAiProvider
      : "";

  const higgsfield = Object.fromEntries(Object.entries(DEFAULT_HIGGSFIELD_IMAGE_PREFERENCES).map(([key, value]) => {
    const saved = settings?.[key as keyof HiggsfieldImagePreferences];
    return [key, typeof saved === "string" && /^[a-z0-9_.-]{0,100}$/i.test(saved) ? saved : value];
  })) as unknown as HiggsfieldImagePreferences;
  return {
    ...higgsfield,
    textProvider: process.env.NODE_ENV === "development" && settings?.textProvider === "codex-cli" ? "codex-cli" : "api",
    openAiImageModel: normalizeOpenAiImageModel(settings?.openAiImageModel),
    geminiImageModel: normalizeGeminiImageModel(settings?.geminiImageModel),
    openAiImageQuality: normalizeOpenAiImageQuality(settings?.openAiImageQuality),
    customGeminiApiKey: settings?.customGeminiApiKey?.trim() ?? "",
    customOpenAiApiKey: settings?.customOpenAiApiKey?.trim() ?? "",
    preferredAiProvider
  };
}
