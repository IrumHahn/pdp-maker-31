export function friendlyPdpError(message: string): string {
  if (!/내용 검수|D[a-z0-9]+_\d+|MATERIAL_\d+|bullet/i.test(message)) return message;
  const cleaned = message
    .replace(/내용 검수[:：]?\s*/g, '')
    .replace(/\bD[a-z0-9]+_\d+[:：]?\s*/gi, '')
    .replace(/\bH\d+-M\d+[:：]?\s*/g, '')
    .replace(/제공 사진\(MATERIAL_(\d+)\)/g, '추가 사진 $1')
    .replace(/\(?MATERIAL_(\d+)\)?/g, '추가 사진 $1')
    .replace(/bullets?의?/gi, '문구')
    .replace(/개수 단정 표현을 수정해야 합니다\.?/g, '정확한 개수를 확인하거나 숫자를 빼 주세요.');
  return `작성된 문구와 상품 사진이 다른 부분이 있어요. ${cleaned}`;
}
