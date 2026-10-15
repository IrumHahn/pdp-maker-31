export type PdpCopyProductKind = "sunCare" | "runningSocks" | "generic";

const REVIEW_EVIDENCE_PATTERN = /(후기|리뷰|상품평|구매평|평이|인정|검증|증명|인증|고객\s*반응|사용자\s*반응)/i;

export function inferPdpCopyProductKind(values: Array<string | null | undefined>): PdpCopyProductKind {
  const haystack = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/선\s*크림|썬\s*크림|선스크린|sunscreen|sun\s*screen|spf|pa\+|백탁|워터\s*프루프|waterproof|물놀이|자외선\s*차단/.test(haystack)) {
    return "sunCare";
  }

  if (/러닝\s*양말|런닝\s*양말|운동\s*양말|양말|삭스|socks?|러닝|런닝|마라톤|조깅/.test(haystack)) {
    return "runningSocks";
  }

  return "generic";
}

export function normalizePdpReviewBenefitSalesCopyList(
  values: string[] | undefined,
  productKind: PdpCopyProductKind = "generic",
  limit = 8,
  maxLength = 90
) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const normalized = normalizePdpReviewBenefitSalesCopy(value, productKind, maxLength);
    const key = normalizePdpCopyKey(normalized);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(normalized);
  });

  return result.slice(0, limit);
}

export function normalizePdpReviewBenefitSalesCopy(
  value?: string,
  productKind: PdpCopyProductKind = "generic",
  maxLength = 90
) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  const mapped = mapReviewBenefitToSalesCopy(normalized, productKind);
  if (mapped) {
    return shortenPdpCopy(mapped, maxLength);
  }

  const cleaned = stripReviewEvidenceWording(normalized);
  return shortenPdpCopy(cleaned, maxLength);
}

export function containsPdpReviewEvidenceWording(value?: string) {
  return REVIEW_EVIDENCE_PATTERN.test(value ?? "");
}

function mapReviewBenefitToSalesCopy(value: string, productKind: PdpCopyProductKind) {
  const haystack = value.toLowerCase();

  if (/백탁|하얗게\s*뜸|하얗게\s*뜨|white\s*cast/.test(haystack)) {
    return "하얗게 뜨지 않는 백탁 방지";
  }

  if (/워터\s*프루프|water\s*proof|waterproof|방수|물에도|물놀이|물과\s*땀|땀에도|지워지|쉽게\s*안\s*지워|지속/.test(haystack)) {
    return "물과 땀에 강한 워터프루프";
  }

  if (/끈적|산뜻|보송|번들|흡수|가벼|부드럽|발림/.test(haystack)) {
    return "끈적임 적은 산뜻한 사용감";
  }

  if (/자외선|차단|햇빛|spf|pa\+/.test(haystack)) {
    return "햇빛 강한 날 챙기는 차단 루틴";
  }

  if (/휴대|간편|챙|파우치|작고|가방/.test(haystack)) {
    return "야외 활동 전 간편한 휴대";
  }

  if (productKind === "runningSocks") {
    if (/쫀쫀|핏|잡아|고정|밀림|흘러내/.test(haystack)) {
      return "러닝 중 흔들림 적은 핏";
    }
    if (/쿠션|도톰|충격|발바닥|착지/.test(haystack)) {
      return "착지를 받쳐주는 쿠션감";
    }
    if (/땀|통기|쾌적|답답|냄새|건조/.test(haystack)) {
      return "오래 신어도 쾌적한 착용감";
    }
    if (/쓸림|마찰|물집|뒤꿈치|발목/.test(haystack)) {
      return "마찰 부담을 줄인 마감";
    }
  }

  if (productKind === "sunCare" && /순하|민감|자극|저자극/.test(haystack)) {
    return "부담 적은 순한 사용감";
  }

  return "";
}

function stripReviewEvidenceWording(value: string) {
  return normalizeWhitespace(
    value
      .replace(/(후기|리뷰|상품평|구매평)\s*(에서|에선|로|기반으로)\s*/gi, "")
      .replace(/(?:이|가)?\s*(?:좋|좋다|좋다는|만족|만족스럽다는|많(?:았|은)|있(?:었|다는)|없(?:다는)|적(?:다|다는|은)|인정(?:한|된)?|검증(?:된)?|증명(?:된)?)\s*(후기|리뷰|상품평|구매평|평이|평가)\s*$/gi, "")
      .replace(REVIEW_EVIDENCE_PATTERN, "")
      .replace(/\s*(좋다는|적다는|많다는|있다는|없다는|인정한|인정된)\s*$/g, "")
      .replace(/^[·,:;\-\s]+|[·,:;\-\s]+$/g, "")
  );
}

function normalizeWhitespace(value?: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}|…/g, "")
    .replace(/^[-•\d.]+\s*/, "")
    .trim();
}

function shortenPdpCopy(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value.replace(/[.,;:]+$/g, "");
  }

  const clipped = value.slice(0, maxLength).replace(/[\s.,;:]+$/g, "");
  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.6)) {
    return clipped.slice(0, lastSpace).replace(/[\s.,;:]+$/g, "");
  }

  return clipped;
}

function normalizePdpCopyKey(value: string) {
  return value
    .replace(/[\s·.,!?'"“”‘’()[\]{}:;_/\-]+/g, "")
    .toLowerCase();
}
