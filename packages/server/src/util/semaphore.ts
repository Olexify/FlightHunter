/**
 * Minimal concurrency limiter — the ~25 lines of `p-limit` we actually used.
 *
 * Every queued task runs exactly once and the returned promise always settles,
 * so a rejecting task cannot wedge the queue or leak a permit.
 */
export function createLimiter(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const release = (): void => {
    active--;
    const next = queue.shift();
    if (next) next();
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = (): void => {
        active++;
        // Wrap in resolve() so a synchronous throw inside `fn` still releases.
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(release);
      };

      if (active < concurrency) run();
      else queue.push(run);
    });
  };
}

export type Limiter = ReturnType<typeof createLimiter>;
