import type { PdpCopyPlanRequest, PdpProductFact } from './pdp-copy-quality';
import type { SectionBlueprint } from './pdp';

export const PDP_VISUAL_FORMATS = {
  product: '제품 중심', detail: '확대·디테일', scale: '크기·비례', steps: '사용 순서',
  comparison: '비교·선택 기준', contents: '구성 펼쳐 보기', lifestyle: '사용 장면', facts: '핵심 정보'
} as const;
export type PdpVisualFormat = keyof typeof PDP_VISUAL_FORMATS;
export const PDP_PERSUASION_JOBS = {
  relevance: '나와 관련된 이야기', desire: '원하는 모습·사용 장면', difference: '이 제품을 고를 이유',
  trust: '믿을 수 있는 근거', reassurance: '구매 불안 해소', action: '선택과 구매'
} as const;
export const PDP_STORY_BEATS = {
  hero: '히어로', problem: '문제·공감', guide: '가이드 등장', plan: '해결 계획',
  success: '성공 장면', stakes: '피하는 실패', info: '구매 전 확인', action: '선택·행동'
} as const;
export type PdpStoryBeat = keyof typeof PDP_STORY_BEATS;
/** StoryBrand 7요소. 초안의 모든 구간은 이 뼈대에서 파생된다. */
export interface PdpStorySpine {
  character: string; desire: string; externalProblem: string; internalProblem: string;
  guideEmpathy: string; guideAuthority: string; plan: string[]; callToAction: string; success: string; failure: string;
}
export interface PdpPersuasion {
  job: keyof typeof PDP_PERSUASION_JOBS;
  beliefBefore: string; beliefAfter: string; mechanism: string;
  basis: 'customer-hypothesis' | 'product-evidence';
}
export interface PdpNarrative {
  framework: string; desire: string; tension: string; promise: string;
  journey: string; assumptions: string[];
}
export interface PdpDecisionModule {
  id: string; name: string; question: string; answer: string; factIds: string[];
  visual: PdpVisualFormat; visualBrief: string; persuasion?: PdpPersuasion;
}
export interface PdpStoryArc {
  externalProblem: string; internalProblem: string; principle: string;
  empathy: string; authority: string; plan: string[]; success: string; avoidedFailure: string;
  concerns: { problem: string; introducedBy: string; resolvedBy: string; proofFactIds: string[] }[];
  reviewStatus: string;
}
export interface PdpSellingHypothesis {
  id: string; title: string; audience: string; motivation: string; barrier: string;
  rationale: string; testQuestion: string; storyArc?: PdpStoryArc; narrative?: PdpNarrative; modules: PdpDecisionModule[];
}
export interface PdpEvidenceGap { question: string; needed: string; reason: string; }
export interface PdpPlanReviewIssue { path: string; reason: string; }
export interface PdpPlanRecovery {
  status: 'pending' | 'repaired';
  original: unknown; candidate: unknown; issues: PdpPlanReviewIssue[];
}
export interface PdpSellingPlan {
  recovery?: PdpPlanRecovery;
  completion?: { mode: 'grounded-basic'; message: string };
  product: string; category: string; facts: PdpProductFact[];
  gaps: PdpEvidenceGap[]; hypotheses: PdpSellingHypothesis[];
}
export interface PdpSellingContext { audience: string; channel: string; priority: string; desire?: string; hesitation?: string; awareness?: string; }
export type PdpSellingPlanRequest = Omit<PdpCopyPlanRequest, 'sections'> & { context?: PdpSellingContext; repair?: { candidate: unknown; original: unknown; issues?: PdpPlanReviewIssue[] } };
export interface PdpDecisionDesign extends PdpDecisionModule { hypothesis: string; storyArc?: PdpStoryArc; narrative?: PdpNarrative; beat?: PdpStoryBeat; bridgeIn?: string; bridgeOut?: string; }
export interface PdpPlanningState {
  plan: PdpSellingPlan | null; context: PdpSellingContext; selectedId: string;
  appliedId?: string;
  previousPlan?: PdpSellingPlan;
  additionalEvidence?: string;
}
// Only a non-factual customer invitation may omit product evidence. Old drafts stay strict.
export function isCustomerMotivationModule(module: Pick<PdpDecisionModule, 'persuasion'> | undefined): boolean {
  return module?.persuasion?.basis === 'customer-hypothesis' && ['relevance', 'desire', 'action'].includes(module.persuasion.job);
}

export function createPlanningPlaceholder(): SectionBlueprint {
  return { section_id: 'planning_start', section_name: '상품 기획', goal: '자료에서 구매 이유와 증거를 찾습니다.', headline: '', headline_en: '', subheadline: '', subheadline_en: '', bullets: [], bullets_en: [], trust_or_objection_line: '', trust_or_objection_line_en: '', CTA: '', CTA_en: '', layout_notes: '', compliance_notes: '', image_id: 'planning_start', purpose: '', prompt_ko: '', prompt_en: '', negative_prompt: '', style_guide: '', reference_usage: '' };
}

// Provider-supported ratios; dense copy gets a taller canvas instead of clipping.
export function getSellingSectionRatio(section: SectionBlueprint, fallback: import('./pdp').AspectRatio): import('./pdp').AspectRatio {
  if (!section.decisionDesign || fallback === '9:16') return fallback;
  const size = section.headline.length * 2 + section.subheadline.length + section.bullets.join('').length;
  if (size > 210 || section.decisionDesign.visual === 'lifestyle') return '9:16';
  if (size > 100 || ['product', 'detail', 'scale'].includes(section.decisionDesign.visual)) return '3:4';
  return '1:1';
}
