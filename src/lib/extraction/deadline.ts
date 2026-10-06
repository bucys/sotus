export const DEADLINE_MS = 75_000;
/** Kept after the last step for the save or the finish. */
export const FINISH_MARGIN_MS = 10_000;

export const STEP_BUDGET_MS = {
  authAndDedup: 2_000,
  fetch: 8_000,
  gemini: 30_000,
} as const;

export type Deadline = {
  readonly start: number;
  readonly at: number;
  readonly signal: AbortSignal;
};

/** One per request, created from `Date.now()` on the action's first line. */
export function createDeadline(start: number): Deadline {
  const at = start + DEADLINE_MS;
  return {
    start,
    at,
    signal: AbortSignal.timeout(Math.max(0, at - Date.now())),
  };
}

const cutoff = (deadline: Deadline) => deadline.at - FINISH_MARGIN_MS;

/** No step starts after `deadline minus 10 s`. */
export function canStart(deadline: Deadline, now = Date.now()): boolean {
  return now < cutoff(deadline);
}

/** Whether a step with this budget still ends before `deadline minus 10 s`. */
export function fitsBudget(
  deadline: Deadline,
  budgetMs: number,
  now = Date.now(),
): boolean {
  return now + budgetMs <= cutoff(deadline);
}

/** The deadline combined with the step's own budget. */
export function stepSignal(deadline: Deadline, budgetMs: number): AbortSignal {
  return AbortSignal.any([deadline.signal, AbortSignal.timeout(budgetMs)]);
}

/** For calls that take no signal: rejects when the signal aborts first. */
export function raceSignal<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Waits, unless the signal aborts first; never rejects. */
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
