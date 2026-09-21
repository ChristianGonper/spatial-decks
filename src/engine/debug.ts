function debugEnabled(): boolean {
  try {
    if (typeof process !== 'undefined' && process.env?.PREZI_DEBUG === '1') {
      return true;
    }
  } catch {
    // sin process (cliente)
  }
  const g = globalThis as { __PREZI_DEBUG?: unknown };
  return g.__PREZI_DEBUG === true || g.__PREZI_DEBUG === 1 || g.__PREZI_DEBUG === '1';
}

export function debugLayout(...args: unknown[]): void {
  if (!debugEnabled()) return;
  console.error('[prezi-layout]', ...args);
}
