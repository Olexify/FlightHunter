/** Error carrying an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, "BAD_REQUEST", message, details);
  }
  static notFound(message = "Not found"): AppError {
    return new AppError(404, "NOT_FOUND", message);
  }
  static tooManyRequests(message: string): AppError {
    return new AppError(429, "RATE_LIMITED", message);
  }
  static upstream(message: string, details?: unknown): AppError {
    return new AppError(502, "UPSTREAM_ERROR", message, details);
  }
  static internal(message = "Internal server error"): AppError {
    return new AppError(500, "INTERNAL", message);
  }
}

/** Never let a provider's raw error object leak to the client verbatim. */
export function describeError(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
