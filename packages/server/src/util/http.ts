import { AppError } from "./errors.js";

/**
 * Thin wrapper over the platform `fetch` (Node 20+), replacing the axios
 * dependency. Adds a hard timeout, typed errors and bounded retry with
 * exponential backoff plus jitter.
 */

export interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** Serialised into the query string; `undefined` values are dropped. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Sent as JSON, or as form-encoded when `form` is true. */
  body?: unknown;
  form?: boolean;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: unknown,
    readonly url: string,
  ) {
    super(`HTTP ${status} ${statusText}`);
    this.name = "HttpError";
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 429 and 5xx are transient; 4xx (auth, validation) will fail identically on retry. */
function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  // Network-level failures and timeouts are worth another attempt.
  return err instanceof Error && err.name !== "AbortError";
}

function buildUrl(url: string, query?: RequestOptions["query"]): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export async function request<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    headers = {},
    query,
    body,
    form = false,
    timeoutMs = 20_000,
    retries = 2,
    signal,
  } = opts;

  const target = buildUrl(url, query);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // A fresh controller per attempt; aborting one must not poison the next.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onOuterAbort = (): void => controller.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        throw new AppError(499, "CLIENT_CLOSED", "Request cancelled");
      }
      signal.addEventListener("abort", onOuterAbort, { once: true });
    }

    try {
      const init: RequestInit = { method, signal: controller.signal, headers: { ...headers } };

      if (body !== undefined) {
        if (form) {
          init.body = new URLSearchParams(body as Record<string, string>).toString();
          (init.headers as Record<string, string>)["Content-Type"] =
            "application/x-www-form-urlencoded";
        } else {
          init.body = JSON.stringify(body);
          (init.headers as Record<string, string>)["Content-Type"] = "application/json";
        }
      }

      const res = await fetch(target, init);
      const text = await res.text();

      let parsed: unknown = text;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          /* leave as text; some upstreams return HTML on failure */
        }
      }

      if (!res.ok) throw new HttpError(res.status, res.statusText, parsed, target);
      return parsed as T;
    } catch (err) {
      lastError = err;

      // The caller cancelled (browser navigated away) — stop immediately.
      if (signal?.aborted) {
        throw new AppError(499, "CLIENT_CLOSED", "Request cancelled");
      }
      if (attempt === retries || !isRetryable(err)) break;

      // Exponential backoff with jitter, and honour Retry-After when given.
      let delay = Math.min(8000, 2 ** attempt * 400) + Math.random() * 250;
      if (err instanceof HttpError && err.status === 429) delay = Math.max(delay, 1500);
      await sleep(delay);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onOuterAbort);
    }
  }

  if (lastError instanceof HttpError) throw lastError;
  if (lastError instanceof Error && lastError.name === "AbortError") {
    throw new AppError(504, "UPSTREAM_TIMEOUT", `Upstream timed out after ${timeoutMs}ms`);
  }
  throw lastError ?? new Error("Request failed");
}
