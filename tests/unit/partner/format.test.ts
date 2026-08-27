import { describe, test, expect } from "vitest";
import {
  formatDestination,
  formatRateIdr,
  formatSpacedCountdown,
  formatUsdxAmount,
  formatWibTime,
} from "@/lib/partner/format";

// USDX-548 — angka di halaman partner mengikuti Figma persis. Dua di antaranya TIDAK boleh
// dibulatkan seperti nominal tagihan: kurs (2 desimal) dan jumlah aset (6 desimal on-chain).

describe("formatRateIdr", () => {
  describe("positive", () => {
    test("dua desimal, gaya Indonesia — sama dengan desain", () => {
      expect(formatRateIdr("16582.50")).toBe("Rp 16.582,50");
    });

    test("nilai bulat tetap memperlihatkan dua desimal", () => {
      expect(formatRateIdr("16000")).toBe("Rp 16.000,00");
    });
  });

  describe("negative", () => {
    test("bukan angka → null (baris kurs disembunyikan, bukan menampilkan NaN)", () => {
      expect(formatRateIdr("bukan-angka")).toBeNull();
    });

    test("null/kosong → null", () => {
      expect(formatRateIdr(null)).toBeNull();
      expect(formatRateIdr("")).toBeNull();
    });
  });

  describe("edge case", () => {
    test("desimal ketiga dibulatkan ke dua, tidak dipotong sewenang-wenang", () => {
      expect(formatRateIdr("16582.567")).toBe("Rp 16.582,57");
    });
  });
});

describe("formatUsdxAmount", () => {
  describe("positive", () => {
    test("enam desimal, gaya Indonesia — sama dengan desain", () => {
      expect(formatUsdxAmount("60.60606")).toBe("60,606060");
    });

    test("presisi penuh dipertahankan", () => {
      expect(formatUsdxAmount("60.606060")).toBe("60,606060");
    });
  });

  describe("negative", () => {
    test("bukan angka → null", () => {
      expect(formatUsdxAmount("abc")).toBeNull();
    });
  });

  describe("edge case", () => {
    test("nol tetap enam desimal (bukan '0')", () => {
      expect(formatUsdxAmount("0")).toBe("0,000000");
    });

    test("ribuan diberi pemisah titik", () => {
      expect(formatUsdxAmount("1234.5")).toBe("1.234,500000");
    });
  });
});

describe("formatWibTime", () => {
  describe("positive", () => {
    test("UTC → WIB (+7) dengan pemisah titik dua seperti desain", () => {
      // 02:28 UTC = 09:28 WIB
      expect(formatWibTime("2026-08-27T02:28:11Z")).toBe("09:28");
    });

    test("pemisahnya titik dua, BUKAN titik (locale id-ID memakai titik)", () => {
      expect(formatWibTime("2026-08-27T02:28:11Z")).not.toContain(".");
    });
  });

  describe("negative", () => {
    test("timestamp tak valid → null", () => {
      expect(formatWibTime("bukan-tanggal")).toBeNull();
    });

    test("null → null", () => {
      expect(formatWibTime(null)).toBeNull();
    });
  });

  describe("edge case", () => {
    test("melewati tengah malam WIB dihitung di zona Jakarta, bukan zona mesin", () => {
      // 18:00 UTC = 01:00 WIB hari berikutnya
      expect(formatWibTime("2026-08-27T18:00:00Z")).toBe("01:00");
    });

    test("format 24 jam (tanpa AM/PM)", () => {
      expect(formatWibTime("2026-08-27T13:05:00Z")).toBe("20:05");
    });
  });
});

describe("formatSpacedCountdown", () => {
  describe("positive", () => {
    test("gaya desain: mm : ss dengan spasi", () => {
      expect(formatSpacedCountdown(1427)).toBe("23 : 47");
    });
  });

  describe("negative", () => {
    test("negatif dijepit ke nol, tidak menampilkan waktu minus", () => {
      expect(formatSpacedCountdown(-5)).toBe("00 : 00");
    });
  });

  describe("edge case", () => {
    test("lebih dari 60 menit tidak dipotong ke jam", () => {
      expect(formatSpacedCountdown(3600)).toBe("60 : 00");
    });

    test("pecahan detik dibulatkan ke bawah", () => {
      expect(formatSpacedCountdown(59.9)).toBe("00 : 59");
    });
  });
});

describe("formatDestination", () => {
  describe("positive", () => {
    test("alamat dipendekkan + rantai berhuruf kapital, seperti desain", () => {
      expect(formatDestination("0x1f2e0000000000000000000000000000000093a4", "polygon")).toBe(
        "0x1f2e…93a4 · Polygon",
      );
    });
  });

  describe("negative", () => {
    test("tanpa alamat → null (barisnya disembunyikan)", () => {
      expect(formatDestination(null, "polygon")).toBeNull();
    });
  });

  describe("edge case", () => {
    test("alamat pendek tidak dipendekkan lagi", () => {
      expect(formatDestination("0x1234", "polygon")).toBe("0x1234 · Polygon");
    });

    test("tanpa rantai → hanya alamat", () => {
      expect(formatDestination("0x1f2e0000000000000000000000000000000093a4", null)).toBe(
        "0x1f2e…93a4",
      );
    });
  });
});
