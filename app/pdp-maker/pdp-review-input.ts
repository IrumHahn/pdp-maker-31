import { compressPreparedImagePayload } from './pdp-utils';

// Only the analysis request gets this copy; never replace the saved image/export.
export async function preparePdpReviewImage(value: string, fallbackMime = 'image/png', compress = compressPreparedImagePayload) {
  const dataUrl = value.match(/^data:(image\/[^;]+);base64,([\s\S]+)$/);
  const base64 = dataUrl ? dataUrl[2] : value;
  const mimeType = dataUrl ? dataUrl[1] : fallbackMime;
  const byteBudget = 1_250_000;
  if (base64.length * 0.75 <= byteBudget) return { base64, mimeType };
  const prepared = await compress({ base64, mimeType, fileName: 'review-image' }, {
    allowLongPageSampling: false, analysisByteBudget: byteBudget, generationByteBudget: byteBudget, preserveGeneration: false
  });
  const result = { base64: prepared.generationBase64 ?? prepared.base64, mimeType: prepared.generationMimeType ?? prepared.mimeType };
  if (result.base64.length * 0.75 > byteBudget) throw new Error('검사용 이미지 용량을 줄이지 못했습니다. 원본 이미지는 보존했습니다.');
  return result;
}
