import type { NextFunction, Request, Response } from "express";

/**
 * Fixed-window per-IP limiter. Small enough to own outright rather than take a
 * dependency, and the expensive endpoint (search) is the only one that needs it.
 */
interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Identifies the caller; defaults to the request IP. */
  keyFor?: (req: Request) => string;
}

export function rateLimit({ windowMs, max, keyFor }: RateLimitOptions) {
  const windows = new Map<string, Window>();

  // Periodic sweep so keys from one-off visitors do not accumulate forever.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, w] of windows) {
      if (now >= w.resetAt) windows.delete(key);
    }
  }, Math.max(windowMs, 30_000));
  sweep.unref();

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const key = keyFor?.(req) ?? req.ip ?? "unknown";
    const now = Date.now();

    let window = windows.get(key);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + windowMs };
      windows.set(key, window);
    }
    window.count++;

    const remaining = Math.max(0, max - window.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil((window.resetAt - now) / 1000)));

    if (window.count > max) {
      const retryAfter = Math.ceil((window.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Try again in ${retryAfter}s.`,
        },
      });
      return;
    }

    next();
  };
}
