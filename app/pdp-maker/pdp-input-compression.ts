import type { PreparedImageDraft, PdpSourceMaterialDraft } from "./pdp-drafts";
import { compressPreparedImagePayload } from "./pdp-utils";

// 8 analysis images + product reference + person remain below the 3.8MB JSON
// ceiling after base64 expansion, with room for PDF text and request metadata.
export const PDP_ANALYSIS_IMAGE_BYTES = 160 * 1024;
export const PDP_PRODUCT_REFERENCE_BYTES = 768 * 1024;
export const PDP_PERSON_IMAGE_BYTES = 512 * 1024;
export function imagePayloadBytes(base64?: string) {
  const raw = base64?.replace(/^data:[^,]+,/, "") ?? "";
  return Math.max(0, Math.floor(raw.length * 3 / 4) - (raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0));
}
function needsCompression(image: PreparedImageDraft, analysisBudget: number, generationBudget: number) {
  return !image.analysisMetadata || imagePayloadBytes(image.base64) > analysisBudget || imagePayloadBytes(image.generationBase64 ?? image.base64) > generationBudget;
}
export async function compressPdpInputs(
  input: { primary: PreparedImageDraft; materials: PdpSourceMaterialDraft[]; person: PreparedImageDraft | null },
  compress = compressPreparedImagePayload
) {
  let compressedCount = 0;
  const prepare = async (image: PreparedImageDraft, person = false, auxiliary = false) => {
    const analysisByteBudget = person ? PDP_PERSON_IMAGE_BYTES : PDP_ANALYSIS_IMAGE_BYTES;
    const generationByteBudget = person ? PDP_PERSON_IMAGE_BYTES : auxiliary ? PDP_ANALYSIS_IMAGE_BYTES : PDP_PRODUCT_REFERENCE_BYTES;
    if (!needsCompression(image, analysisByteBudget, generationByteBudget)) return image;
    const next = await compress(image, { allowLongPageSampling: !person, analysisByteBudget, generationByteBudget: Math.max(128 * 1024, generationByteBudget), preserveGeneration: !auxiliary });
    compressedCount++;
    // Auxiliary references are analysis-only. Avoid keeping a redundant reference.
    return auxiliary ? { ...next, generationBase64: next.base64, generationMimeType: next.mimeType, generationPreviewUrl: next.previewUrl } : next;
  };
  const primary = await prepare(input.primary);
  const materials: PdpSourceMaterialDraft[] = [];
  for (const material of input.materials) {
    const isPrimary = material.role === "primary" || material.preparedImage === input.primary;
    // Some older drafts store their image inline instead of in preparedImage.
    const image = material.preparedImage ?? (material.imageBase64 ? { base64: material.imageBase64, mimeType: material.imageMimeType ?? "image/jpeg", fileName: material.fileName, previewUrl: `data:${material.imageMimeType ?? "image/jpeg"};base64,${material.imageBase64}` } : undefined);
    const preparedImage = isPrimary ? primary : image ? await prepare(image, false, true) : undefined;
    materials.push({ ...material, imageBase64: undefined, imageMimeType: undefined, preparedImage, previewUrl: preparedImage?.previewUrl ?? material.previewUrl });
  }
  const person = input.person ? await prepare(input.person, true) : null;
  return { primary, materials, person, compressedCount };
}
