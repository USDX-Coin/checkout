// Helper untuk bercabang atas `ApiError` (port subset dari app USDX-150).

import { ApiError } from "./client";

export { ApiError };

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// 422 VALIDATION_ERROR — pipe global v2 (conventions.md § Validation Error). Match by
// *code* (status-agnostik) agar diperlakukan sebagai error input, bukan catch-all.
export function isValidationError(error: unknown): boolean {
  return isApiError(error) && error.code === "VALIDATION_ERROR";
}

// 429 RATE_LIMITED — throughput throttle mint (5 req/detik per user; conventions.md
// § Rate Limiting). Transient, BUKAN error sesi — backoff + toast, jangan retry
// agresif, jangan logout. (USDX-252)
export function isRateLimited(error: unknown): boolean {
  return isApiError(error) && error.status === 429 && error.code === "RATE_LIMITED";
}

// Detik tunggu dari header Retry-After saat 429 (0 kalau 429 tanpa info, null kalau bukan 429).
export function getRateLimitSeconds(error: unknown): number | null {
  if (isApiError(error) && error.status === 429) return error.retryAfterSeconds ?? 0;
  return null;
}
