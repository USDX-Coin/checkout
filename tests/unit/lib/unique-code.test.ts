import { describe, test, expect } from "vitest";
import { uniqueCodeAmount } from "@/lib/checkout/unique-code";

// Kontrak rev-17 R2 (`sot/api/mint.yaml` MintOrder.uniqueCode): `001`–`999`, tidak pernah `000`.
describe("uniqueCodeAmount", () => {
  describe("positive", () => {
    test("kode 3 digit ber-nol depan → rupiahnya", () => {
      expect(uniqueCodeAmount("007")).toBe(7);
      expect(uniqueCodeAmount("417")).toBe(417);
      expect(uniqueCodeAmount("999")).toBe(999);
    });
  });

  describe("negative", () => {
    test("000, kosong, null, bukan digit → null", () => {
      expect(uniqueCodeAmount("000")).toBeNull();
      expect(uniqueCodeAmount("")).toBeNull();
      expect(uniqueCodeAmount(null)).toBeNull();
      expect(uniqueCodeAmount(undefined)).toBeNull();
      expect(uniqueCodeAmount("4a7")).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("lebih dari 3 digit (4 digit = langkah terencana, belum kontrak) → null", () => {
      expect(uniqueCodeAmount("1234")).toBeNull();
    });
  });
});
