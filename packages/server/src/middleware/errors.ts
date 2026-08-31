import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { AppError } from "../util/errors.js";

/**
 * Express 4 does not forward rejections from async handlers, so an awaited
 * throw becomes an unhandled rejection and the request hangs. Wrapping routes
 * here routes every failure into the error middleware below.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "No such endpoint" } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    // 499 means the client vanished; there is nobody left to answer.
    if (err.status === 499) return;
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  logger.error("unhandled request error", {
    message,
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    error: {
      code: "INTERNAL",
      // Never leak internals in production; keep them in dev for debugging.
      message: config.NODE_ENV === "production" ? "Internal server error" : message,
    },
  });
}
