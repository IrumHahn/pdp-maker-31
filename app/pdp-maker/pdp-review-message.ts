// Preserve raw diagnostics in the saved plan; this is a display fallback, not a translation.
export function reviewMessageForDisplay(reason: string): string {
  const han = (reason.match(/[\u3400-\u9fff]/g) ?? []).length;
  const hangul = (reason.match(/[가-힣]/g) ?? []).length;
  if (han >= 5 && han > hangul) return '검수 설명이 한국어로 작성되지 않았습니다. 상품 자료와 기획 내용의 일치 여부를 다시 확인해야 합니다.';
  return reason;
}
