import type { PdpCopyPlanRequest, PdpProductFact } from './pdp-copy-quality';
import type { PdpEvidenceGap, PdpSellingContext, PdpStorySpine } from './pdp-selling-plan';
import type { SectionBlueprint } from './pdp';

/** 분석·기획·카피를 한 번에 요청한다. 이미지는 생성하지 않는다. */
export type PdpDraftRequest = Omit<PdpCopyPlanRequest, 'sections' | 'storyContext'> & {
  context?: PdpSellingContext;
  /** 목표 구간 수. 모델은 이 수를 목표로 쓰고 최소 (목표-2)개는 채운다. */
  sectionCount?: number;
};
export interface PdpDraftIssue { section_id: string; reason: string; source: 'rule' | 'review'; }
export interface PdpDraftPlan {
  product: string;
  category: string;
  /** 구간을 파생시킨 이야기 뼈대. 구 초안에는 없다. */
  story?: PdpStorySpine;
  facts: PdpProductFact[];
  gaps: PdpEvidenceGap[];
  sections: SectionBlueprint[];
  /** 서버 규칙 검사에서 나온 확인 필요 항목. 초안 적용을 막지 않는다. */
  issues: PdpDraftIssue[];
}
export interface PdpDraftReviewRequest {
  originalImageBase64: string;
  originalImageMimeType?: string;
  sourceMaterials?: PdpCopyPlanRequest['sourceMaterials'];
  additionalInfo?: string;
  customerReviewAnalysis?: PdpCopyPlanRequest['customerReviewAnalysis'];
  aiProvider?: PdpCopyPlanRequest['aiProvider'];
  sections: Array<Pick<SectionBlueprint, 'section_id' | 'section_name' | 'headline' | 'subheadline' | 'bullets' | 'copyEvidence'>>;
}
export interface PdpDraftReview { issues: PdpDraftIssue[]; checkedAt: string; }
export const PDP_DRAFT_SECTION_LIMIT = { default: 12, min: 6, max: 16, options: [10, 12, 14] } as const;
