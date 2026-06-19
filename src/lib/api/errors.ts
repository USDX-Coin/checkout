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
