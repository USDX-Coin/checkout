import { describe, expect, test } from "vitest";
import { formatIDR, formatUSD } from "@/lib/utils";

// Rupiah tampil bulat ke bawah, sama dengan pembulatan total di backend
// (`api/mint.yaml` § totalPayIdr: "desimal dibulatkan ke bawah").
describe("formatIDR", () => {
  describe("positive", () => {
    test("a whole rupiah amount is shown as is with thousand dots", () => {
      expect(formatIDR(167312)).toBe("Rp 167.312");
    });
  });

  describe("negative", () => {
    test("a non-number is shown as an em dash, never Rp NaN", () => {
      expect(formatIDR(Number.NaN)).toBe("—");
      expect(formatIDR(Number.POSITIVE_INFINITY)).toBe("—");
    });
  });

  describe("edge cases", () => {
    test("half a rupiah rounds down, so subtotal + fee matches the backend total (163.312,50 + 4.000 = 167.312)", () => {
      expect(formatIDR(163312.5)).toBe("Rp 163.312");
      expect(formatIDR(163312.99)).toBe("Rp 163.312");
    });
  });
});

// Transfer BNI dalam USD (USDX-749): gaya id-ID, selalu dua desimal.
describe("formatUSD", () => {
  describe("positive", () => {
    test("sen ditulis dengan koma, ribuan dengan titik", () => {
      expect(formatUSD("3.47")).toBe("$3,47");
      expect(formatUSD("1234.5")).toBe("$1.234,50");
      expect(formatUSD(0.47)).toBe("$0,47");
    });
  });

  describe("negative", () => {
    test("null, kosong, bukan angka → em dash, bukan $NaN atau $0,00", () => {
      expect(formatUSD(null)).toBe("—");
      expect(formatUSD(undefined)).toBe("—");
      expect(formatUSD("")).toBe("—");
      expect(formatUSD("abc")).toBe("—");
    });
  });

  describe("edge cases", () => {
    test("angka bulat tetap dua desimal", () => {
      expect(formatUSD("3")).toBe("$3,00");
      expect(formatUSD("3.00")).toBe("$3,00");
    });
  });
});
