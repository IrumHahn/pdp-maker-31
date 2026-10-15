import { AsyncLocalStorage } from 'node:async_hooks';

export const COPY_BUDGET_MS = 55000;
export const COPY_BUDGET_PER_SECTION_MS = 5000;
export const COPY_BUDGET_MAX_MS = 180000;
export const COPY_TIMEOUT_MESSAGE = '카피 작성이 제한 시간 안에 완료되지 않아 중단했습니다. 기존 작업은 유지됩니다. 잠시 후 다시 작성해 주세요.';
export const copyBudgetContext = new AsyncLocalStorage<AbortSignal>();

/** 섹션 수에 비례한 예산. 1~3섹션은 기본 55초, 9섹션은 85초, 상한 180초(라우트 maxDuration 300초 이내). */
export function copyBudgetMs(sectionCount: number): number {
  const count = Number.isFinite(sectionCount) && sectionCount > 0 ? Math.floor(sectionCount) : 1;
  return Math.min(COPY_BUDGET_MAX_MS, COPY_BUDGET_MS + Math.max(0, count - 3) * COPY_BUDGET_PER_SECTION_MS);
}

// One deadline covers writing and the optional correction together.
// Providers receive this signal so expiry also stops the underlying work.
export async function withCopyBudget<T>(execute: () => Promise<T>, ms = COPY_BUDGET_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(COPY_TIMEOUT_MESSAGE);
      reject(error);
      controller.abort(error);
    }, ms);
  });
  try { return await Promise.race([copyBudgetContext.run(controller.signal, execute), expiry]); }
  catch (error) { controller.abort(error); throw error; }
  finally { clearTimeout(timer!); }
}
