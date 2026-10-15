import { getPdpSectionOutputMode, getSellingSectionRatio, getPdpImageCopySignature, isPdpImageCopyStale, type PdpImageQualityReview } from "@runacademy/shared";
import type { PdpGenerationRecord, SectionBlueprint } from "@runacademy/shared";
import { PdpRequestError } from "./pdp-utils";

export async function runPdpImageQueue(input: {
  sections: SectionBlueprint[];
  config: Omit<PdpGenerationRecord, "status" | "attempts" | "updatedAt">;
  generate: (section: SectionBlueprint, index: number) => Promise<string | { image: string; reviewRequired?: boolean; qualityReview?: PdpImageQualityReview; usage?: PdpGenerationRecord["usage"] }>;
  update: (id: string, patch: Partial<SectionBlueprint>) => void;
  progress: (completed: number, total: number) => void;
  shouldPause?: () => boolean;
  concurrency?: number;
  regenerateChanged?: boolean;
}) {
  const tasks = input.sections.map((section, index) => ({ section, index }))
    .filter(({ section }) => (!section.generatedImage || (input.regenerateChanged && isPdpImageCopyStale(section))) && section.generation?.status !== "unknown");
  let cursor = 0, succeeded = 0, failed = 0, unknown = 0, completed = 0;
  const record = (section: SectionBlueprint, status: PdpGenerationRecord["status"], message?: string): PdpGenerationRecord => ({
    ...input.config, outputMode: getPdpSectionOutputMode(section, input.config.outputMode ?? "full-image"), aspectRatio: getSellingSectionRatio(section, input.config.aspectRatio), status, message,
    attempts: (section.generation?.attempts ?? 0) + (status === "queued" ? 0 : 1),
    updatedAt: new Date().toISOString()
  });
  for (const { section } of tasks) input.update(section.section_id, { generation: record(section, "queued") });
  const worker = async () => {
    while (cursor < tasks.length && !input.shouldPause?.()) {
      const { section, index } = tasks[cursor++];
      const started = Date.now();
      input.update(section.section_id, { generation: record(section, "running") });
      try {
        const result = await input.generate(section, index);
        const generatedImage = typeof result === "string" ? result : result.image;
        input.update(section.section_id, { generatedImage, previousGeneratedImage: section.generatedImage || section.previousGeneratedImage, imageCopySignature: getPdpImageCopySignature(section), qualityReview: typeof result === "string" ? undefined : result.qualityReview, referenceReviewRequired: typeof result !== "string" && Boolean(result.reviewRequired), generation: { ...record(section, "succeeded", typeof result !== "string" && result.reviewRequired ? "인물 참조 일치를 확인해 주세요. 자동 추가 생성은 수행하지 않았습니다." : undefined), elapsedMs: Date.now() - started, usage: typeof result === "string" ? undefined : result.usage } });
        succeeded++;
      } catch (error) {
        const status = error instanceof PdpRequestError && error.outcomeUnknown ? "unknown" : "failed";
        const message = error instanceof Error ? error.message : String(error);
        input.update(section.section_id, { generation: { ...record(section, status, message), elapsedMs: Date.now() - started } });
        if (status === "unknown") unknown++; else failed++;
      }
      input.progress(++completed, tasks.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(tasks.length, Math.max(1, Math.min(2, input.config.provider === "higgsfield" ? 1 : input.concurrency ?? 2))) }, worker));
  return { succeeded, failed, unknown, queued: tasks.length - completed, requested: tasks.length };
}

export function toGenerationSection(section: SectionBlueprint): SectionBlueprint {
  const { productReference, generatedImage, previousGeneratedImage, generation, originalProduct, referenceReviewRequired, qualityReview, imageCopySignature, ...blueprint } = section;
  return blueprint;
}

/** A detail section should use its cited source photograph, not an unrelated hero crop. */
export function getPdpSectionReference(section: SectionBlueprint, materials: import('@runacademy/shared').PdpSourceMaterial[], fallback: { base64: string; mimeType?: string; fileName?: string }) {
  if (section.productReference) return section.productReference;
  if (section.decisionDesign?.visual !== 'detail') return fallback;
  for (const evidence of section.copyEvidence ?? []) {
    const match = /^MATERIAL_(\d+)(?:_P(\d+))?:/.exec(evidence);
    if (!match) continue;
    const material = materials[Number(match[1]) - 1];
    if (!material) continue;
    if (match[2]) {
      const page = material.analysisPages?.find(item => item.page === Number(match[2]));
      if (page) return { base64: page.base64, mimeType: page.mimeType, fileName: material.fileName };
    } else if (material.imageBase64) return { base64: material.imageBase64, mimeType: material.imageMimeType ?? material.mimeType, fileName: material.fileName };
  }
  return fallback;
}
