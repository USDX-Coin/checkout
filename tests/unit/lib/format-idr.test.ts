import { describe, expect, test } from "vitest";
import { formatIDR } from "@/lib/utils";

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
