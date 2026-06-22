import { describe, test, expect, beforeEach } from "vitest";
import {
  captureTokenFromHash,
  getToken,
  clearToken,
  CHECKOUT_TOKEN_KEY,
} from "@/lib/auth/token";

beforeEach(() => {
  sessionStorage.clear();
  // Reset to a clean checkout URL (no hash) before each case.
  window.history.replaceState(null, "", "/checkout/ord_1");
});

describe("token — URL-hash handoff (USDX-239)", () => {
  describe("captureTokenFromHash", () => {
    test("reads #token, stores it to sessionStorage, and returns it", () => {
      window.location.hash = "#token=jwt-abc";
      const tok = captureTokenFromHash();
      expect(tok).toBe("jwt-abc");
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBe("jwt-abc");
    });

    test("strips #token from the URL after capture (no credential left in URL)", () => {
      window.location.hash = "#token=jwt-abc";
      captureTokenFromHash();
      expect(window.location.hash).toBe("");
    });

    test("URL-decodes the token (app sends encodeURIComponent)", () => {
      window.location.hash = "#token=" + encodeURIComponent("a.b+c/d=");
      expect(captureTokenFromHash()).toBe("a.b+c/d=");
    });

    test("returns null and stores nothing when there is no #token", () => {
      const tok = captureTokenFromHash();
      expect(tok).toBeNull();
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBeNull();
    });

    test("overwrites a previously stored token on a fresh handoff", () => {
      sessionStorage.setItem(CHECKOUT_TOKEN_KEY, "old");
      window.location.hash = "#token=new";
      captureTokenFromHash();
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBe("new");
    });

    test("is idempotent — second call (hash already stripped) keeps the token", () => {
      window.location.hash = "#token=jwt-abc";
      captureTokenFromHash();
      const second = captureTokenFromHash();
      expect(second).toBeNull(); // nothing new in URL
      expect(getToken()).toBe("jwt-abc"); // still authorized (refresh-safe)
    });
  });

  describe("getToken", () => {
    test("returns the stored token (survives without a hash → refresh-safe)", () => {
      sessionStorage.setItem(CHECKOUT_TOKEN_KEY, "jwt-xyz");
      expect(getToken()).toBe("jwt-xyz");
    });

    test("returns null when nothing is stored (other tab/device → 401 path)", () => {
      expect(getToken()).toBeNull();
    });
  });

  describe("clearToken", () => {
    test("removes the stored token", () => {
      sessionStorage.setItem(CHECKOUT_TOKEN_KEY, "jwt");
      clearToken();
      expect(getToken()).toBeNull();
    });
  });
});
