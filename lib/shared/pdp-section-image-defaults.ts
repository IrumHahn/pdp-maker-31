import type { ImageGenOptions, ReferenceModelUsage, SectionBlueprint } from "./pdp";

export type PdpSectionVisualRole =
  | "hero"
  | "question"
  | "concernList"
  | "problem"
  | "bridge"
  | "guide"
  | "value"
  | "plan"
  | "proof"
  | "review"
  | "compare"
  | "detail"
  | "lifestyle"
  | "success"
  | "composition"
  | "disclosure"
  | "cta"
  | "failure"
  | "generic";

type PdpSectionImageDefaults = Pick<ImageGenOptions, "style" | "withModel" | "guidePriorityMode">;

export function inferPdpSectionVisualRole(
  section?: Partial<SectionBlueprint> | null,
  sectionIndex = 0,
  totalSections = 1
): PdpSectionVisualRole {
  if (section?.decisionDesign) {
    const roles: Record<import('./pdp-selling-plan').PdpVisualFormat, PdpSectionVisualRole> = { product: 'value', detail: 'detail', scale: 'detail', steps: 'plan', comparison: 'compare', contents: 'composition', lifestyle: 'lifestyle', facts: 'disclosure' };
    return roles[section.decisionDesign.visual];
  }
  const roleText = [
    section?.section_id,
    section?.section_name,
    section?.purpose
  ].join(" ").toLowerCase();
  const haystack = [
    section?.section_id,
    section?.section_name,
    section?.goal,
    section?.purpose,
    section?.headline,
    section?.subheadline,
    section?.layout_notes
  ].join(" ").toLowerCase();

  if (sectionIndex === 0 || /hero|히어로|첫\s*화면|메인/.test(haystack)) {
    return "hero";
  }
  if (/cta|action|offer|close|구매\s*제안|마무리|행동\s*유도|오퍼|마지막|확신/.test(roleText)) {
    return "cta";
  }
  if (/failure|loss|손실|놓쳤|후회|미루/.test(roleText)) {
    return "failure";
  }
  if (/concern\s*list|customer\s*concern|chat|bubble|고객\s*고민\s*리스팅|고민\s*리스팅|채팅|말풍선|망설임\s*리스트/.test(roleText)) {
    return "concernList";
  }
  if (/testimonial|customer\s*review|review|고객\s*후기|실사용\s*후기|사용\s*후기|구매\s*후기|리얼\s*후기|후기(?!형)|리뷰|별점/.test(roleText)) {
    return "review";
  }
  if (/success|after|change|review|사용\s*후|변화|후기|달라/.test(roleText)) {
    return "success";
  }
  if (/question|공감\s*질문|상황\s*질문|질문|적\s*없으|나요|까요/.test(roleText)) {
    return "question";
  }
  if (/bridge|전환|선언|직접\s*고쳤|개선\s*선언|해결\s*흐름/.test(roleText)) {
    return "bridge";
  }
  if (/guide|가이드|제품\s*소개|solution|해결책|소개/.test(roleText)) {
    return "guide";
  }
  if (/compare|comparison|vs|비교|경쟁|대안|차이/.test(roleText)) {
    return "compare";
  }
  if (/disclosure|spec|고시|상품정보|주의|faq|보증/.test(roleText)) {
    return "disclosure";
  }
  if (/composition|configuration|구성|구성품|세트|컬러|색상|사이즈/.test(roleText)) {
    return "composition";
  }
  if (/detail|디테일|소재|마감|원단|클로즈|부위/.test(roleText)) {
    return "detail";
  }
  if (/lifestyle|스타일|라이프|사용\s*장면|기대\s*장면|생활|착용\s*장면/.test(roleText)) {
    return "lifestyle";
  }
  if (/proof|evidence|trust|review|신뢰|근거|후기|리뷰|인증/.test(roleText)) {
    return "proof";
  }
  if (/problem|concern|objection|pain|whynow|situation|고민|문제|불편|저항|불안|장벽|왜\s*지금|필요/.test(roleText)) {
    return "problem";
  }
  if (/plan|routine|use|situation|사용|루틴|방법|계획|상황|순서/.test(roleText)) {
    return "plan";
  }
  if (/value|feature|benefit|point|why|핵심|장점|기능|선택|이유/.test(roleText)) {
    return "value";
  }

  if (/cta|action|offer|close|구매\s*제안|마무리|행동\s*유도|오퍼|마지막|확신/.test(haystack) || sectionIndex === totalSections - 1) {
    return "cta";
  }
  if (/failure|loss|손실|놓쳤|후회|미루/.test(haystack)) {
    return "failure";
  }
  if (/concern\s*list|customer\s*concern|chat|bubble|고객\s*고민\s*리스팅|고민\s*리스팅|채팅|말풍선|망설임\s*리스트/.test(haystack)) {
    return "concernList";
  }
  if (/testimonial|customer\s*review|review|고객\s*후기|실사용\s*후기|사용\s*후기|구매\s*후기|리얼\s*후기|후기(?!형)|리뷰|별점/.test(haystack)) {
    return "review";
  }
  if (/success|after|change|review|사용\s*후|변화|후기|달라/.test(haystack)) {
    return "success";
  }
  if (/question|공감\s*질문|상황\s*질문|질문|적\s*없으|나요|까요/.test(haystack)) {
    return "question";
  }
  if (/bridge|전환|선언|직접\s*고쳤|개선\s*선언|해결\s*흐름/.test(haystack)) {
    return "bridge";
  }
  if (/guide|가이드|제품\s*소개|solution|해결책|소개/.test(haystack)) {
    return "guide";
  }
  if (/compare|comparison|vs|비교|경쟁|대안|차이/.test(haystack)) {
    return "compare";
  }
  if (/disclosure|spec|고시|상품정보|주의|faq|보증/.test(haystack)) {
    return "disclosure";
  }
  if (/composition|configuration|구성|구성품|세트|컬러|색상|사이즈/.test(haystack)) {
    return "composition";
  }
  if (/detail|디테일|소재|마감|원단|클로즈|부위/.test(haystack)) {
    return "detail";
  }
  if (/lifestyle|스타일|라이프|사용\s*장면|기대\s*장면|생활|착용\s*장면/.test(haystack)) {
    return "lifestyle";
  }
  if (/proof|evidence|trust|review|신뢰|근거|후기|리뷰|인증/.test(haystack)) {
    return "proof";
  }
  if (/problem|concern|objection|pain|whynow|situation|고민|문제|불편|저항|불안|장벽|왜\s*지금|필요/.test(haystack)) {
    return "problem";
  }
  if (/plan|routine|use|situation|사용|루틴|방법|계획|상황|순서/.test(haystack)) {
    return "plan";
  }
  if (/value|feature|benefit|point|why|핵심|장점|기능|선택|이유/.test(haystack)) {
    return "value";
  }

  return "generic";
}

export function getPdpSectionImageDefaults(
  section: Partial<SectionBlueprint> | null | undefined,
  sectionIndex: number,
  totalSections: number,
  referenceModelUsage: ReferenceModelUsage | null | undefined
): PdpSectionImageDefaults {
  const role = inferPdpSectionVisualRole(section, sectionIndex, totalSections);
  const style = getDefaultStyleForVisualRole(role);
  const withModel =
    referenceModelUsage === "all-sections"
      ? true
      : referenceModelUsage === "hero-only"
        ? sectionIndex === 0
        : false;

  return {
    style,
    withModel,
    guidePriorityMode: "guide-first"
  };
}

function getDefaultStyleForVisualRole(role: PdpSectionVisualRole): NonNullable<ImageGenOptions["style"]> {
  if (role === "question" || role === "problem" || role === "plan" || role === "lifestyle" || role === "success" || role === "failure" || role === "cta") {
    return "lifestyle";
  }
  if (role === "generic") {
    return "studio";
  }

  return "studio";
}

function shouldRoleUseHumanModel(role: PdpSectionVisualRole) {
  return [
    "hero",
    "question",
    "problem",
    "bridge",
    "guide",
    "plan",
    "lifestyle",
    "success",
    "failure",
    "cta",
    "generic"
  ].includes(role);
}
