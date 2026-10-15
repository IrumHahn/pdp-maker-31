export const BRAND_PRIMARY = "#1F6F5C";
export const DEFAULT_MODEL = "gpt-4o-mini";

export type ProviderType = "openai" | "gemini" | "claude";

export interface WidgetInitConfig {
  siteId: string;
  position?: "bottom-right" | "bottom-left";
  theme?: "light" | "dark";
}

export * from "./pdp";
export * from "./pdp-image-models";
export * from "./pdp-copy-normalization";
export * from "./pdp-section-image-defaults";
export * from "./pdp-bug-report";
export * from "./pdp-usage-log";
export * from "./pdp-higgsfield";

export * from "./pdp-copy-quality";

export * from "./pdp-selling-plan";
export * from "./pdp-draft";
