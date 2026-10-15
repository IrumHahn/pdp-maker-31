export interface HiggsfieldParameter {
  name: string;
  options?: Array<string | number>;
  default?: string | number | boolean;
  required?: string;
}
export interface HiggsfieldModel {
  id: string;
  name: string;
  description?: string;
  output_type: string;
  parameters: HiggsfieldParameter[];
  medias: Array<{ type: string; roles: string[]; max?: number }>;
  aspect_ratios: string[];
}
export interface HiggsfieldImagePreferences {
  higgsfieldImageModel: string;
  higgsfieldImageQuality: string;
  higgsfieldImageResolution: string;
  higgsfieldImageVariant: string;
}
export interface HiggsfieldCostOptions {
  model: string;
  quality?: string;
  resolution?: string;
  variant?: string;
  aspectRatio: string;
}
export interface HiggsfieldCostQuote {
  creditsPerImage: number;
  exactCreditsPerImage: number;
  options: HiggsfieldCostOptions;
  quotedAt: string;
}
// Every PDP section is a separate one-image job. Multiply its quoted cost,
// rather than quoting a count-N batch with different rounding/variant rules.
export function getHiggsfieldCreditTotal(creditsPerImage: number, count: number) {
  if (!Number.isFinite(creditsPerImage) || creditsPerImage < 0 || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid Higgsfield cost or image count");
  return Number((creditsPerImage * count).toFixed(6));
}
export const DEFAULT_HIGGSFIELD_IMAGE_PREFERENCES: HiggsfieldImagePreferences = {
  higgsfieldImageModel: "gpt_image_2_5",
  higgsfieldImageQuality: "medium",
  higgsfieldImageResolution: "2k",
  higgsfieldImageVariant: "sunburst"
};
// Editing utilities require their own workflows; they cannot generate a PDP section.
const UTILITY_MODELS = new Set(["autosprite", "ms_image", "marketing_studio_image", "marketing_studio_2_image", "image_auto", "flux_2_pro_outpaint", "image_background_remover", "outpaint", "topaz_image", "topaz_image_generative", "image_decompose", "bytedance_image_upscale"]);
export function isHiggsfieldReferenceModel(model: HiggsfieldModel): boolean {
  return model.output_type === "image" && !UTILITY_MODELS.has(model.id) &&
    !model.parameters?.some((parameter) => parameter.required === "required" && parameter.default === undefined && !["prompt", "aspect_ratio", "quality", "resolution", "variant"].includes(parameter.name)) &&
    model.medias?.some((media) => media.type === "image" && media.max !== 0 && media.roles?.some((role) => role === "image" || role === "image_references"));
}
export function getHiggsfieldReferenceMedia(model: HiggsfieldModel, count = 1) {
  const medias = model.medias?.filter((media) => media.type === "image" && media.max !== 0 && media.roles?.some((role) => role === "image" || role === "image_references")) ?? [];
  return medias.find((media) => media.max === undefined || media.max >= count) ?? medias[0];
}
export function getHiggsfieldReferenceLimit(model: HiggsfieldModel): number | undefined {
  const medias = model.medias?.filter((media) => media.type === "image" && media.max !== 0 && media.roles?.some((role) => role === "image" || role === "image_references")) ?? [];
  // Missing metadata is unknown, never a claim of unlimited references.
  if (!medias.length || medias.some((media) => media.max === undefined)) return undefined;
  return Math.max(...medias.map((media) => media.max!));
}
export function getHiggsfieldParameterValue(model: HiggsfieldModel, name: string, requested: string) {
  const parameter = model.parameters?.find((item) => item.name === name);
  if (!parameter) return undefined;
  if (parameter.options?.length) {
    const options = parameter.options.map(String);
    return options.includes(requested) ? requested : options.includes(String(parameter.default)) ? String(parameter.default) : options[0];
  }
  return parameter.default;
}
export function normalizeHiggsfieldPreferences(model: HiggsfieldModel, preferences: HiggsfieldImagePreferences): HiggsfieldImagePreferences {
  return {
    higgsfieldImageModel: model.id,
    higgsfieldImageQuality: String(getHiggsfieldParameterValue(model, "quality", preferences.higgsfieldImageQuality) ?? ""),
    higgsfieldImageResolution: String(getHiggsfieldParameterValue(model, "resolution", preferences.higgsfieldImageResolution) ?? ""),
    higgsfieldImageVariant: String(getHiggsfieldParameterValue(model, "variant", preferences.higgsfieldImageVariant) ?? "")
  };
}
