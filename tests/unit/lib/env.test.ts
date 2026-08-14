import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { isNonProdApiBaseUrl } from "@/lib/env";

// Pagar #1: mode demo TIDAK BOLEH bisa menyala di production, walau env-nya salah set.
// Latar: build production Jenkins (`usdx/frontend-checkout/main` #8) terbukti memakai
// `--build-arg NEXT_PUBLIC_DEMO_AUTOCOMPLETE=true` bareng `NEXT_PUBLIC_API_BASE_URL=
// https://api.usdx.co.id`. Kode tak boleh bergantung pada disiplin env: satu baris salah
// tidak boleh cukup untuk membuat halaman bayar mengarang "Pembayaran diterima".

// Muat ulang `@/lib/env` dengan process.env yang di-stub — `env` dihitung sekali saat modul
// dievaluasi, jadi tiap kombinasi butuh registry modul yang bersih.
async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return (await import("@/lib/env")).env;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isNonProdApiBaseUrl", () => {
  describe("positive", () => {
    test("host non-prod terdaftar → true", () => {
      expect(isNonProdApiBaseUrl("http://localhost:3000")).toBe(true);
      expect(isNonProdApiBaseUrl("http://127.0.0.1:8080")).toBe(true);
      expect(isNonProdApiBaseUrl("http://[::1]:3000")).toBe(true);
      expect(isNonProdApiBaseUrl("http://0.0.0.0:3000")).toBe(true);
      expect(isNonProdApiBaseUrl("https://api-dev.usdx.co.id")).toBe(true);
    });

    test("port / path / kapitalisasi tidak mengubah keputusan", () => {
      expect(isNonProdApiBaseUrl("https://API-DEV.usdx.co.id/api/v2")).toBe(true);
      expect(isNonProdApiBaseUrl("https://api-dev.usdx.co.id:443")).toBe(true);
    });
  });

  describe("negative", () => {
    test("host backend production → false", () => {
      expect(isNonProdApiBaseUrl("https://api.usdx.co.id")).toBe(false);
      expect(isNonProdApiBaseUrl("https://api.usdx.co.id/api/v2")).toBe(false);
    });

    test("host tak dikenal (daftar putih, bukan daftar hitam) → false", () => {
      // Kalau ini daftar hitam host prod, semua baris di bawah lolos jadi "non-prod" dan
      // demo bisa hidup di lingkungan yang mengurus uang sungguhan.
      expect(isNonProdApiBaseUrl("https://api-staging.usdx.co.id")).toBe(false);
      expect(isNonProdApiBaseUrl("https://api2.usdx.co.id")).toBe(false);
      expect(isNonProdApiBaseUrl("https://apidev.usdx.co.id")).toBe(false);
      expect(isNonProdApiBaseUrl("https://api-dev.usdx.co.id.contoh.test")).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("kosong / relatif / tak terparse → false (dianggap production)", () => {
      expect(isNonProdApiBaseUrl("")).toBe(false);
      expect(isNonProdApiBaseUrl("/api/v2")).toBe(false);
      expect(isNonProdApiBaseUrl("bukan url")).toBe(false);
    });

    test("tanpa skema → hostname kosong → false", () => {
      // `new URL("localhost:3000")` terparse tapi hostname-nya "" — jangan diperlakukan lokal.
      expect(isNonProdApiBaseUrl("localhost:3000")).toBe(false);
      expect(isNonProdApiBaseUrl("api-dev.usdx.co.id")).toBe(false);
    });
  });
});

describe("env.demoAutocomplete", () => {
  describe("positive", () => {
    test("flag 'true' + backend dev → demo boleh nyala", async () => {
      const env = await loadEnv({
        NEXT_PUBLIC_API_BASE_URL: "https://api-dev.usdx.co.id",
        NEXT_PUBLIC_DEMO_AUTOCOMPLETE: "true",
      });
      expect(env.demoAutocomplete).toBe(true);
    });

    test("flag 'true' + localhost → demo boleh nyala", async () => {
      const env = await loadEnv({
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:3000",
        NEXT_PUBLIC_DEMO_AUTOCOMPLETE: "true",
      });
      expect(env.demoAutocomplete).toBe(true);
    });
  });

  describe("negative", () => {
    test("flag 'true' + backend PRODUCTION → demo MATI (persis build Jenkins #8)", async () => {
      const env = await loadEnv({
        NEXT_PUBLIC_API_BASE_URL: "https://api.usdx.co.id",
        NEXT_PUBLIC_DEMO_AUTOCOMPLETE: "true",
      });
      expect(env.demoAutocomplete).toBe(false);
    });

    test("flag tidak di-set + backend dev → demo mati", async () => {
      const env = await loadEnv({ NEXT_PUBLIC_API_BASE_URL: "https://api-dev.usdx.co.id" });
      expect(env.demoAutocomplete).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("NEXT_PUBLIC_API_BASE_URL kosong → dianggap production → demo mati", async () => {
      const env = await loadEnv({
        NEXT_PUBLIC_API_BASE_URL: "",
        NEXT_PUBLIC_DEMO_AUTOCOMPLETE: "true",
      });
      expect(env.demoAutocomplete).toBe(false);
    });

    test("trailing slash pada URL prod tidak membuka celah", async () => {
      const env = await loadEnv({
        NEXT_PUBLIC_API_BASE_URL: "https://api.usdx.co.id/",
        NEXT_PUBLIC_DEMO_AUTOCOMPLETE: "true",
      });
      expect(env.demoAutocomplete).toBe(false);
    });

    test("nilai flag selain 'true' persis (mis. 'TRUE', '1') → demo mati", async () => {
      for (const value of ["TRUE", "True", "1", "yes"]) {
        const env = await loadEnv({
          NEXT_PUBLIC_API_BASE_URL: "https://api-dev.usdx.co.id",
          NEXT_PUBLIC_DEMO_AUTOCOMPLETE: value,
        });
        expect(env.demoAutocomplete).toBe(false);
      }
    });
  });
});
