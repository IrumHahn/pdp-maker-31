import type { PdpSourceMaterial, PdpCustomerReviewAnalysis, SectionBlueprint, PdpAiProvider, PdpOutputMode } from './pdp';

export interface PdpCopyPlanRequest {
  originalImageBase64: string;
  originalImageMimeType?: string;
  sourceMaterials?: PdpSourceMaterial[];
  additionalInfo?: string;
  desiredTone?: string;
  customerReviewAnalysis?: PdpCustomerReviewAnalysis | null;
  aiProvider?: PdpAiProvider;
  outputMode?: PdpOutputMode;
  storyContext?: {
    mode: 'insert' | 'replace'; position: number;
    previousSectionId?: string; nextSectionId?: string;
    sections: Array<Pick<SectionBlueprint, 'section_id' | 'section_name' | 'headline' | 'subheadline' | 'bullets' | 'goal'>>;
  };
  sections: Array<{ section_id: string; section_name: string; goal: string; decisionDesign?: import("./pdp-selling-plan").PdpDecisionDesign }>;
}
export interface PdpProductFact { id: string; source: string; quote: string; }
export interface PdpCopyPlan { sections: SectionBlueprint[]; facts: PdpProductFact[]; }
export interface PdpImageQualityReview {
  status: 'passed' | 'needs-review' | 'unavailable' | 'stale';
  issues: string[];
  checkedAt: string;
}

// These are known scaffold phrases, not a product-category classifier. Never invent
// replacement copy when a line fails; return an actionable issue to the writer.
const SCAFFOLD_COPY = /삽입\s*예정|추가\s*예정|자료\s*확인\s*필요|실제\s*후기\s*(?:준비|대기)|구매\s*직전\s*망설임이\s*남는\s*이유|좋아\s*보여도\s*구매\s*직전|^반복되는\s*불편$|^구매\s*전\s*남는\s*망설임$|^나에게\s*맞을지\s*모르는\s*불안$|해결책이\s*되는\s*이유|선택해야\s*하는\s*이유를?\s*확인|^필요한\s*순간\s*확인$|^간단히\s*사용$|달라진\s*장면\s*경험|제품이\s*어떤\s*불편을|바로\s*쓸\s*수\s*있는\s*이유가|받고\s*나서\s*바로\s*쓰는\s*간단한\s*순서|이\s*섹션|섹션의?\s*역할|고객이\s*자기\s*(이야기|상황)|구매\s*흐름을\s*만|히어로우?\s*문구/;
export const PDP_COPY_LIMITS = { headline: 54, subheadline: 100, bullet: 48 } as const;
export function getPdpCopyIssues(section: Pick<SectionBlueprint, 'headline' | 'subheadline' | 'bullets'> & Partial<Pick<SectionBlueprint, 'trust_or_objection_line' | 'CTA'>>, fullImage = true): string[] {
  const issues: string[] = [];
  if (!section.headline?.trim()) issues.push('상품에 맞는 헤드라인을 작성해 주세요.');
  const fields: Array<[string, string, number]> = [
    ['헤드라인', section.headline ?? '', PDP_COPY_LIMITS.headline],
    ['설명', section.subheadline ?? '', PDP_COPY_LIMITS.subheadline],
    ['보조 문구', section.trust_or_objection_line ?? '', PDP_COPY_LIMITS.subheadline],
    ['행동 문구', section.CTA ?? '', PDP_COPY_LIMITS.bullet],
    ...(section.bullets ?? []).map((value, index): [string, string, number] => [`핵심 문구 ${index + 1}`, value, PDP_COPY_LIMITS.bullet])
  ];
  for (const [label, value, limit] of fields) {
    // Consumer copy must state the benefit/fact, not describe the writing or
    // evidence presentation. Keep these rules specific to avoid banning FAQs.
    if (/(?:[세두네몇]|[2-9])\s*(?:가지\s*)?문장|(?:함량|성분|영양|수치)(?:은|는|을|를)?\s*숫자로\s*확인|(?:로|으로)?\s*소개됩니다|(?:맛|구매|선택)\s*기대를?\s*(?:더하|높이)|(?:신뢰|구매욕|구매\s*심리)(?:를|을)\s*(?:형성|자극)|(?:구매\s*이유|선택\s*기준)(?:를|을)\s*(?:제시|전달)합니다/.test(value)) {
      issues.push(`${label}「${value}」: 카피의 역할이나 자료 제시 방식을 설명하는 내부 문장입니다. 확인된 제품 사실 또는 고객이 얻는 경험을 직접 말하는 문장으로 작성하세요.`);
    }
    if (SCAFFOLD_COPY.test(value)) issues.push(`${label}: 상품의 실제 불편·특징을 설명하는 문장으로 다시 작성해 주세요.`);
    if (/(?:기능|설계|제품|강화).{0,18}내세(?:운|웁|우)|(?:기능|구조)(?:을|를)?\s*(?:함께\s*)?강조|고려했습니다|먼저\s*보여\s*줍니다|맥락을\s*더했|(?:선수명|경력).*(?:추가하지|확인되지)|메시지로|성격을.*보여|문구가?\s*(?:표시되어|있습니다|제시)|상세\s*이미지에는|기획\s*(?:의도|메모)|함께\s*소개|사례가.{0,12}소개|(?:효능|예방|방지).{0,12}표시|소개된\s*\S+|자료에\s*확인된|라벨에는.+표시되어|확인된\s*정보로|확인하지\s*않으면\s*아쉽/.test(value)) issues.push(`${label}「${value}」: 자료 검수 설명 대신 고객에게 전달할 상품의 특징을 직접 말해 주세요.`);
    if (fullImage && Array.from(value).length > limit) issues.push(`${label}: ${limit}자 이내의 완결된 문장으로 다듬어 주세요. 자동으로 자르지 않습니다.`);
    if (/망설임이[.!\s]*$|어떤\s*불편을[.!\s]*$|경험으로[.!\s]*$|\uFFFD|[가-힣][ㄱ-ㅎㅏ-ㅣ]{2,}/.test(value)) issues.push(`${label}: 문장이 끝났는지 확인해 주세요.`);
  }
  if (fullImage && (section.bullets?.length ?? 0) > 3) issues.push('핵심 문구는 최대 3개로 정리해 주세요.');
  if (!section.subheadline?.trim() && !(section.bullets ?? []).some(line => line.trim()) && /이유|구조|궁금|질문|안내|방법|순서|비교/.test(section.headline)) issues.push('제목에서 약속한 이유·구조·안내에 대한 실제 답변을 넣어 주세요.');
  const lines = fields.map(([, value]) => copyKey(value)).filter(Boolean);
  if (new Set(lines).size !== lines.length) issues.push('같은 문구를 제목·설명·포인트에서 반복하지 마세요.');
  return [...new Set(issues)];
}
export function copyKey(value: string) { return value.normalize('NFC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase(); }
export function getPdpImageCopySignature(section: Pick<SectionBlueprint, 'headline' | 'subheadline' | 'bullets'>) {
  return JSON.stringify([section.headline, section.subheadline, section.bullets]);
}
export function isPdpImageCopyStale(section: SectionBlueprint) {
  if (section.copyPresentation === 'editable' && section.generation?.outputMode === 'editable') return false;
  return Boolean(section.generatedImage && section.imageCopySignature && section.imageCopySignature !== getPdpImageCopySignature(section));
}
export function getPdpPageCopyIssues(sections: SectionBlueprint[], fullImage = true) {
  const issues = sections.flatMap(section => getPdpCopyIssues(section, fullImage).map(issue => `${section.section_name}: ${issue}`));
  const headlines = sections.map(section => copyKey(section.headline)).filter(Boolean);
  if (new Set(headlines).size !== headlines.length) issues.push('여러 섹션에 같은 제목이 반복됩니다. 각 섹션의 메시지를 다르게 작성해 주세요.');
  return [...new Set(issues)];
}

/** Shared by preview, generation, queue and export. No migration of legacy drafts. */
export function getPdpSectionOutputMode(section: Pick<SectionBlueprint, 'copyPresentation'>, fallback: PdpOutputMode): PdpOutputMode {
  return section.copyPresentation === 'editable' || section.copyPresentation === 'full-image' ? section.copyPresentation : fallback;
}
export function needsPdpEditableCopy(section: Pick<SectionBlueprint, 'section_name' | 'decisionDesign'>): boolean {
  // 구매 전 확인 정보는 통이미지로 그린다(2026-10-15 한이룸 결정). 후기·FAQ·정책만 편집 가능.
  if (section.decisionDesign?.beat === 'info') return false;
  return /후기|리뷰|FAQ|질문|배송|교환|반품|정책|가격|옵션|사이즈|규격|관리법|세탁|구성품/i.test(section.section_name + ' ' + (section.decisionDesign?.question ?? ''));
}
export const PDP_COMMON_CONTENT_RULES = `모든 상품에 적용하는 제작 기준:
- 고객의 욕망과 상황에서 출발하고, 제기한 문제는 뒤의 해결 방식과 실제 근거로 답한다. 상품군마다 문제와 구매 장벽을 새로 판단한다.
- 이유·구조·안내를 제목에 약속하면 같은 장에서 구체적 이유·실제 구조·질문과 답을 제공한다. 안내 제목만 있는 장을 만들지 않는다.
- 원문 없는 후기, 선수 추천, 효능, 인증, 가격, 배송·반품 정책을 만들지 않는다. 부족한 자료는 소비자 카피 밖에 분리한다.
- 삽입 예정, 자료 확인 필요, 기획 의도, 자료 판독 설명을 소비자 이미지에 출력하지 않는다.
- 사진의 장소·구도·거리와 정보 배치를 섹션 역할에 따라 바꾼다. 사용 장면, 제품 중심, 실제 디테일, 정보 장면을 구별한다. 같은 배경이나 카드 레이아웃을 반복하지 않는다.
- 실제 구조를 보여줘야 할 때 원본 디테일 사진을 사용한다. 상상한 단면도나 직조 구조를 증거처럼 만들지 않는다.
- 후기·가격·옵션·정책·FAQ는 편집 가능한 정보로 구분한다. 확인된 사실만 사용하며 장수를 채우려고 빈 구간을 만들지 않는다.`;
