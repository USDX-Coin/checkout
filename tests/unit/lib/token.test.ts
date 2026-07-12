import { describe, test, expect, beforeEach } from "vitest";
import {
  readHandoffCodeFromHash,
  getToken,
  setToken,
  clearToken,
  CHECKOUT_TOKEN_KEY,
} from "@/lib/auth/token";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  // Reset to a clean checkout URL (no hash) before each case.
  window.history.replaceState(null, "", "/checkout/ord_1");
});

describe("token — one-time handoff code (USDX-378, WSTG-CLNT-12)", () => {
  describe("readHandoffCodeFromHash", () => {
    test("reads #code and returns it (WITHOUT storing — code is single-use, not a credential)", () => {
      window.location.hash = "#code=hc-abc";
      const code = readHandoffCodeFromHash();
      expect(code).toBe("hc-abc");
      // Code must NOT be persisted; only the exchanged session token is stored later.
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBeNull();
      expect(sessionStorage.length).toBe(0);
    });

    test("strips #code from the URL after read (no code left in URL/history/Referer)", () => {
      window.location.hash = "#code=hc-abc";
      readHandoffCodeFromHash();
      expect(window.location.hash).toBe("");
    });

    test("URL-decodes the code (app sends encodeURIComponent)", () => {
      window.location.hash = "#code=" + encodeURIComponent("a.b+c/d=");
      expect(readHandoffCodeFromHash()).toBe("a.b+c/d=");
    });

    test("returns null when there is no #code", () => {
      const code = readHandoffCodeFromHash();
      expect(code).toBeNull();
    });

    test("ignores a legacy #token= handoff (old insecure bearer-in-URL is no longer honored)", () => {
      window.location.hash = "#token=jwt-legacy";
      expect(readHandoffCodeFromHash()).toBeNull();
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBeNull();
    });

    test("is idempotent — second call (hash already stripped) returns null", () => {
      window.location.hash = "#code=hc-abc";
      expect(readHandoffCodeFromHash()).toBe("hc-abc");
      expect(readHandoffCodeFromHash()).toBeNull();
    });
  });

  describe("setToken / getToken", () => {
    test("setToken stores the exchanged session token in sessionStorage; getToken reads it back", () => {
      setToken("sess-xyz");
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBe("sess-xyz");
      expect(getToken()).toBe("sess-xyz");
    });

    test("session token is NEVER written to localStorage (WSTG-CLNT-12)", () => {
      setToken("sess-xyz");
      expect(localStorage.getItem(CHECKOUT_TOKEN_KEY)).toBeNull();
      expect(localStorage.length).toBe(0);
    });

    test("getToken returns null when nothing is stored (other tab/device → redirect path)", () => {
      expect(getToken()).toBeNull();
    });
  });

  describe("clearToken", () => {
    test("removes the stored token", () => {
      setToken("sess-1");
      clearToken();
      expect(getToken()).toBeNull();
    });
  });
});
