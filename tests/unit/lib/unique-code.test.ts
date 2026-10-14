import { describe, test, expect } from "vitest";
import { uniqueCodeUsd } from "@/lib/checkout/unique-code";

// Transfer BNI dalam USD (keputusan PM 14 Okt 2026, USDX-749): kode unik = sen `01`–`99`.
describe("uniqueCodeUsd", () => {
  describe("positive", () => {
    test("kode sen → dolar", () => {
      expect(uniqueCodeUsd("47")).toBe(0.47);
      expect(uniqueCodeUsd("99")).toBe(0.99);
    });

    test("kode ber-nol depan tetap terbaca", () => {
      expect(uniqueCodeUsd("07")).toBe(0.07);
      expect(uniqueCodeUsd("7")).toBe(0.07);
    });
  });

  describe("negative", () => {
    test("00, kosong, null, bukan digit → null", () => {
      expect(uniqueCodeUsd("00")).toBeNull();
      expect(uniqueCodeUsd("")).toBeNull();
      expect(uniqueCodeUsd(null)).toBeNull();
      expect(uniqueCodeUsd(undefined)).toBeNull();
      expect(uniqueCodeUsd("4a")).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("kode 3 digit (Transfer BNI rupiah lama) tidak dibaca sebagai sen", () => {
      expect(uniqueCodeUsd("417")).toBeNull();
      expect(uniqueCodeUsd("047")).toBeNull();
    });
  });
});
