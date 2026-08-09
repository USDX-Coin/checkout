import { describe, test, expect } from "vitest";
import { ApiError } from "@/lib/api/client";
import { isApiError, isValidationError, isRateLimited, getRateLimitSeconds } from "@/lib/api/errors";

describe("checkout error helpers", () => {
  describe("positive", () => {
    test("isApiError narrows ApiError instances", () => {
      expect(isApiError(new ApiError(400, "BAD_REQUEST", "x"))).toBe(true);
      expect(isApiError(new Error("x"))).toBe(false);
    });

    test("isValidationError matches VALIDATION_ERROR by code", () => {
      expect(isValidationError(new ApiError(422, "VALIDATION_ERROR", "x"))).toBe(true);
      expect(isValidationError(new ApiError(409, "INVALID_ORDER_STATE", "x"))).toBe(false);
    });

    test("isRateLimited matches 429 RATE_LIMITED only", () => {
      expect(isRateLimited(new ApiError(429, "RATE_LIMITED", "x", undefined, 3))).toBe(true);
      // Auth 429s share the status but a different code → not a throughput throttle.
      expect(isRateLimited(new ApiError(429, "TOO_MANY_ATTEMPTS", "x"))).toBe(false);
      expect(isRateLimited(new ApiError(401, "RATE_LIMITED", "x"))).toBe(false);
      expect(isRateLimited(new Error("x"))).toBe(false);
    });

    test("getRateLimitSeconds returns Retry-After seconds from a 429", () => {
      expect(getRateLimitSeconds(new ApiError(429, "RATE_LIMITED", "x", undefined, 3))).toBe(3);
    });
  });

  describe("negative", () => {
    test("getRateLimitSeconds returns null for non-429 / non-ApiError", () => {
      expect(getRateLimitSeconds(new ApiError(409, "INVALID_ORDER_STATE", "x"))).toBeNull();
      expect(getRateLimitSeconds(new Error("x"))).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("getRateLimitSeconds returns 0 for a 429 without Retry-After", () => {
      expect(getRateLimitSeconds(new ApiError(429, "RATE_LIMITED", "x"))).toBe(0);
    });
  });
});
