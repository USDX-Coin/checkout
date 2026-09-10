import { describe, test, expect } from "vitest";
import { PARTNER_VA_BANKS, isPartnerVaBank, partnerChannels } from "@/lib/partner/banks";
import { MODELS_WITH_PAGE, hasHostedPage } from "@/lib/partner/types";
import type { MintChannelOption } from "@/types";

// USDX-548: "Bank VA: Mandiri, BNI, BRI. Tanpa QRIS — tidak didukung provider."
// + "Tiga model dari satu basis komponen: VA (tanpa halaman), brand USDX, netral."

const VA_ALL: MintChannelOption = {
  channel: "VA",
  pgFeeIdr: "4000",
  banks: ["BCA", "BNI", "BRI", "CIMB", "DANAMON", "INA", "MANDIRI", "PERMATA", "MAYBANK"],
};
const QRIS: MintChannelOption = { channel: "QRIS", pgFeeIdr: "2000", banks: null };

describe("PARTNER_VA_BANKS", () => {
  describe("positive", () => {
    test("berisi bank yang didukung jalur partner, sesuai `MintCreate.payment_bank`", () => {
      expect([...PARTNER_VA_BANKS]).toEqual(["MANDIRI", "BNI", "BRI", "NOBU"]);
    });

    // Tes ini ada karena daftar ini SUDAH pernah tertinggal: saat NOBU masuk (USDX-622) daftarnya
    // tetap bertiga, `partnerChannels` membuang satu-satunya bank yang hidup, dan seluruh halaman
    // checkout partner berubah jadi "Metode pembayaran belum tersedia" — tanpa satu tes pun merah.
    test("NOBU termasuk — tanpanya jalur partner kehilangan satu-satunya bank yang aktif", () => {
      expect(isPartnerVaBank("NOBU")).toBe(true);
    });
  });

  describe("negative", () => {
    test("BCA TIDAK termasuk (butuh rekening BCA; bukan bagian jalur partner)", () => {
      expect(isPartnerVaBank("BCA")).toBe(false);
    });

    test("QRIS bukan bank dan bukan anggota daftar", () => {
      expect(isPartnerVaBank("QRIS")).toBe(false);
    });
  });

  describe("edge case", () => {
    test("null/undefined/kosong → bukan bank partner", () => {
      expect(isPartnerVaBank(null)).toBe(false);
      expect(isPartnerVaBank(undefined)).toBe(false);
      expect(isPartnerVaBank("")).toBe(false);
    });

    test("beda huruf besar/kecil ditolak — kode bank dikirim persis", () => {
      expect(isPartnerVaBank("bni")).toBe(false);
    });
  });
});

describe("partnerChannels", () => {
  describe("positive", () => {
    test("VA disaring ke tiga bank saja, urutan backend dipertahankan", () => {
      const [va] = partnerChannels([VA_ALL]);
      expect(va.channel).toBe("VA");
      expect(va.banks).toEqual(["BNI", "BRI", "MANDIRI"]);
    });

    test("biaya layanan dari backend dibawa apa adanya", () => {
      expect(partnerChannels([VA_ALL])[0].pgFeeIdr).toBe("4000");
    });
  });

  describe("negative", () => {
    test("QRIS DIBUANG walau backend menawarkannya", () => {
      const result = partnerChannels([QRIS, VA_ALL]);
      expect(result.map((c) => c.channel)).toEqual(["VA"]);
      expect(JSON.stringify(result)).not.toContain("QRIS");
    });

    test("HANYA QRIS → daftar kosong (jangan sodorkan jalan buntu)", () => {
      expect(partnerChannels([QRIS])).toEqual([]);
    });

    test("QRIS yang datang MEMBAWA banks tetap dibuang — yang menentukan channel-nya", () => {
      // Tanpa kasus ini, saringan channel bisa dihapus tanpa satu tes pun merah: QRIS normal
      // sudah tersaring oleh syarat "harus punya bank yang didukung". Backend yang keliru
      // mengirim QRIS berisi bank akan lolos, dan customer disodorkan pilihan yang pasti gagal.
      expect(partnerChannels([{ channel: "QRIS", pgFeeIdr: "2000", banks: ["BNI", "BRI"] }])).toEqual(
        [],
      );
    });

    test("QRIS ber-bank bercampur VA → hanya VA yang lolos", () => {
      const result = partnerChannels([
        { channel: "QRIS", pgFeeIdr: "2000", banks: ["BNI"] },
        VA_ALL,
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].channel).toBe("VA");
    });

    test("VA yang tak menyisakan bank didukung → dibuang seluruh kartunya", () => {
      expect(partnerChannels([{ channel: "VA", pgFeeIdr: "1", banks: ["BCA", "CIMB"] }])).toEqual(
        [],
      );
    });
  });

  describe("edge case", () => {
    test("null/undefined/kosong → daftar kosong", () => {
      expect(partnerChannels(null)).toEqual([]);
      expect(partnerChannels(undefined)).toEqual([]);
      expect(partnerChannels([])).toEqual([]);
    });

    test("VA dengan banks null → dibuang (bukan diartikan 'semua bank')", () => {
      expect(partnerChannels([{ channel: "VA", pgFeeIdr: "1", banks: null }])).toEqual([]);
    });

    test("channel asli TIDAK dimutasi (saringan mengembalikan salinan)", () => {
      const input: MintChannelOption[] = [
        { channel: "VA", pgFeeIdr: "4000", banks: ["BCA", "BNI"] },
      ];
      partnerChannels(input);
      expect(input[0].banks).toEqual(["BCA", "BNI"]);
    });
  });
});

describe("hasHostedPage", () => {
  describe("positive", () => {
    test("USDX & NEUTRAL punya halaman", () => {
      expect(hasHostedPage("USDX")).toBe(true);
      expect(hasHostedPage("NEUTRAL")).toBe(true);
    });
  });

  describe("negative", () => {
    test("VA TIDAK punya halaman — nomornya dikembalikan lewat API ke partner", () => {
      expect(hasHostedPage("VA")).toBe(false);
    });
  });

  describe("edge case", () => {
    test("tepat dua model yang punya halaman, dari tiga model yang ada", () => {
      expect([...MODELS_WITH_PAGE]).toEqual(["USDX", "NEUTRAL"]);
      expect(MODELS_WITH_PAGE).toHaveLength(2);
    });
  });
});

// USDX-622 — bank yang tampil tapi belum bisa dipilih, di jalur partner.
describe("partnerChannels · bank yang belum aktif", () => {
  const VA_NOBU: MintChannelOption = {
    channel: "VA",
    pgFeeIdr: "4000",
    banks: ["NOBU"],
    disabledBanks: ["BNI", "MANDIRI", "BRI"],
  };

  describe("positive", () => {
    test("channel dengan NOBU saja tetap hidup, tidak dibuang", () => {
      const [va] = partnerChannels([VA_NOBU]);
      expect(va).toBeDefined();
      expect(va.banks).toEqual(["NOBU"]);
    });

    test("disabledBanks ikut lewat, supaya partner menampilkan yang sama dengan konsumen", () => {
      const [va] = partnerChannels([VA_NOBU]);
      expect(va.disabledBanks).toEqual(["BNI", "MANDIRI", "BRI"]);
    });
  });

  describe("negative", () => {
    test("bank di luar daftar partner dibuang juga dari disabledBanks", () => {
      const [va] = partnerChannels([
        { channel: "VA", pgFeeIdr: "4000", banks: ["NOBU"], disabledBanks: ["BCA", "BNI"] },
      ]);
      expect(va.disabledBanks).toEqual(["BNI"]);
    });

    // Bank mati tidak menyelamatkan channel: VA tanpa satu pun bank yang bisa dipilih adalah
    // jalan buntu yang sama, hanya lebih sopan.
    test("VA yang hanya berisi bank mati tetap dibuang", () => {
      expect(partnerChannels([{ channel: "VA", pgFeeIdr: "4000", banks: [], disabledBanks: ["BNI"] }])).toEqual([]);
    });
  });

  describe("edge case", () => {
    test("tanpa disabledBanks, field-nya tidak ditempelkan", () => {
      const [va] = partnerChannels([{ channel: "VA", pgFeeIdr: "4000", banks: ["NOBU"] }]);
      expect("disabledBanks" in va).toBe(false);
    });
  });
});
