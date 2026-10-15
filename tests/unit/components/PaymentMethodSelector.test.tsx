import { describe, test, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  PaymentMethodSelector,
  cheapestChannel,
  priceOf,
} from "@/components/checkout/PaymentMethodSelector";
import type { MintChannelOption } from "@/types";

// Pemilih metode D25 (USDX-764). Kontrak: `sot/api/mint.yaml` ChannelOption / ChannelBankOption
// (rev-16/17), pola UX `sot/phase-2/week2.md` § Checkout, aturan `sot/bni-integration.md` §4.3.
// Semua kartu dari `channels[]` — tidak ada kartu statis, tidak ada urutan yang dipatok FE.

// ── Fixture sesuai kontrak D25 + USDX-749 (Transfer BNI = transfer USD) ───────────────────────
// 5 USDX, kurs dasar 16.200: dasar $5,00 (Rp 81.000), batas atas $5,99 (Rp 97.038). Tanpa kurs BNI
// (effectiveRate = kurs dasar, rateUpdatedAt null) dan tanpa mint fee.
const BNI: MintChannelOption = {
  channel: "BANK_TRANSFER",
  rateAdjustmentPct: null,
  effectiveRate: "16200.0000",
  rateUpdatedAt: null,
  subtotalIdr: "81000.00",
  mintFeeIdr: "0.00",
  pgFeeIdr: "0.00",
  estimatedTotalPayIdr: "81000.00",
  estimatedTotalPayMaxIdr: "82809.00",
  currency: "USD",
  estimatedTotalPayUsd: "5.00",
  estimatedTotalPayMaxUsd: "5.99",
  available: true,
  unavailableReason: null,
  maxAmountIdr: "10000000.00",
  banks: ["BNI"],
  bankOptions: [
    {
      paymentMethodId: "019e5c10-0000-7000-8000-000000000001",
      bank: "BNI",
      feeType: "FLAT_IDR",
      feeValue: "0.00",
      pgFeeIdr: "0.00",
      estimatedTotalPayIdr: "81000.00",
      estimatedTotalPayMaxIdr: "82809.00",
      currency: "USD",
      estimatedTotalPayUsd: "5.00",
      estimatedTotalPayMaxUsd: "5.99",
      available: true,
      unavailableReason: null,
      maxAmountIdr: "10000000.00",
    },
  ],
};

const VA: MintChannelOption = {
  channel: "VA",
  rateAdjustmentPct: "2.5",
  effectiveRate: "16400.00",
  rateUpdatedAt: null,
  subtotalIdr: "82000.00",
  mintFeeIdr: "820.00",
  pgFeeIdr: "4000.00",
  estimatedTotalPayIdr: "86820.00",
  estimatedTotalPayMaxIdr: "86820.00",
  available: true,
  unavailableReason: null,
  maxAmountIdr: null,
  banks: ["NOBU"],
  bankOptions: [
    {
      paymentMethodId: "019e5c10-0000-7000-8000-000000000000",
      bank: "NOBU",
      feeType: "FLAT_IDR",
      feeValue: "4000.00",
      pgFeeIdr: "4000.00",
      estimatedTotalPayIdr: "86820.00",
      estimatedTotalPayMaxIdr: "86820.00",
      available: true,
    },
  ],
  disabledBanks: ["BNI", "MANDIRI", "BRI"],
};

function renderSelector(channels: MintChannelOption[], onPay = vi.fn()) {
  const props = { isPaying: false, payError: null, onPay, onCancel: vi.fn(), mintFeePct: "1" };
  const view = render(<PaymentMethodSelector channels={channels} {...props} />);
  return {
    ...view,
    onPay,
    /** Muat ulang dengan `channels[]` baru, meniru respons GET berikutnya. */
    repoll: (next: MintChannelOption[]) =>
      view.rerender(<PaymentMethodSelector channels={next} {...props} />),
  };
}

const card = (name: RegExp) => screen.getByRole("radio", { name });
const payButton = () => screen.getByRole("button", { name: /Bayar|Pilih metode|Lanjut/ });
const BNI_SUBTITLE = "Bayar USD lewat aplikasi wondr, kurs mengikuti BNI.";

describe("daftar metode datang dari backend (rev-16)", () => {
  describe("positive", () => {
    test("Transfer BNI dideskripsikan tanpa angka; Virtual Account tetap satu angka total", () => {
      renderSelector([BNI, VA]);
      expect(card(/Transfer BNI/)).toBeInTheDocument();
      expect(card(/Virtual Account/)).toBeInTheDocument();
      // Keputusan PM 14 Okt 2026: baris BNI tanpa USD dan tanpa rupiah — kode unik belum ada,
      // rupiahnya ikut kurs BNI. VA tetap rupiah.
      expect(screen.getByText(BNI_SUBTITLE)).toBeInTheDocument();
      expect(screen.queryByText("$5,00")).not.toBeInTheDocument();
      expect(screen.getByText("Rp 86.820")).toBeInTheDocument();
    });

    test("urutan kartu = urutan backend (sortOrder admin), bukan urutan yang dipatok FE", () => {
      renderSelector([VA, BNI]);
      const names = screen.getAllByRole("radio").map((r) => r.getAttribute("value"));
      expect(names).toEqual(["VA", "BANK_TRANSFER"]);
    });

    test("urutan bank = urutan backend", () => {
      renderSelector([{ ...VA, banks: ["BRI", "NOBU", "MANDIRI"], bankOptions: undefined, disabledBanks: undefined }]);
      fireEvent.click(card(/Virtual Account/));
      const group = screen.getByRole("radiogroup", { name: "Pilih bank" });
      const banks = within(group).getAllByRole("radio").map((r) => r.getAttribute("value"));
      expect(banks).toEqual(["BRI", "NOBU", "MANDIRI"]);
    });
  });

  describe("negative", () => {
    test("tanpa BANK_TRANSFER di channels[], TIDAK ada kartu Transfer BNI sama sekali", () => {
      renderSelector([VA]);
      expect(screen.queryByText(/Transfer BNI|Transfer bank BNI/)).not.toBeInTheDocument();
      expect(screen.getAllByRole("radio")).toHaveLength(1);
    });

    test("channel yang tak dikenal (enum terbuka) tidak dirender sebagai pilihan", () => {
      renderSelector([VA, { ...VA, channel: "EWALLET" as never }]);
      expect(screen.getAllByRole("radio")).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    test("backend lama tanpa estimasi per metode → total = harga order + biaya layanan", () => {
      render(
        <PaymentMethodSelector
          channels={[{ channel: "VA", pgFeeIdr: "4000", banks: ["NOBU"] }]}
          totalBeforePgFeeIdr="162500"
          subtotalIdr="162500.00"
          mintFeeIdr="0.00"
          effectiveRate="16250.0000"
          isPaying={false}
          payError={null}
          onPay={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByText("Rp 166.500")).toBeInTheDocument();
    });

    test("biaya mint nol tetap menampilkan rincian (nol itu sah, bukan data hilang)", () => {
      renderSelector([{ ...VA, mintFeeIdr: "0.00" }]);
      fireEvent.click(card(/Virtual Account/));
      expect(screen.getByText(/Nilai USDX/)).toBeInTheDocument();
      expect(screen.getByText("Rp 0")).toBeInTheDocument();
    });
  });
});

describe("penanda 'Paling hemat' (rev-17 R8)", () => {
  describe("positive", () => {
    test("menempel di estimatedTotalPayMaxIdr terkecil", () => {
      renderSelector([BNI, VA]);
      expect(within(card(/Transfer BNI/).closest("label")!).getByText("Paling hemat")).toBeInTheDocument();
      expect(screen.getAllByText("Paling hemat")).toHaveLength(1);
    });

    test("bisa jatuh ke Virtual Account — tidak ada penanda tetap untuk BNI", () => {
      const mahal = { ...BNI, estimatedTotalPayIdr: "86500.00", estimatedTotalPayMaxIdr: "87499.00" };
      expect(cheapestChannel([mahal, VA])).toBe("VA");
    });
  });

  describe("negative", () => {
    test("dinilai TERMASUK kode unik: BNI lebih murah tanpa kode, tapi +999 lebih mahal → VA", () => {
      // 86.000 < 86.820 tanpa kode unik, tapi 86.999 > 86.820 dengan batas atasnya.
      const bni = { ...BNI, estimatedTotalPayIdr: "86000.00", estimatedTotalPayMaxIdr: "86999.00" };
      expect(cheapestChannel([bni, VA])).toBe("VA");
    });

    test("opsi available=false tidak pernah diberi penanda", () => {
      const bni = { ...BNI, available: false, unavailableReason: "AMOUNT_ABOVE_METHOD_MAX" };
      expect(cheapestChannel([bni, VA])).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("seri → tidak ada penanda", () => {
      expect(cheapestChannel([{ ...BNI, estimatedTotalPayMaxIdr: "86820.00" }, VA])).toBeNull();
    });

    test("backend tanpa estimatedTotalPayMaxIdr → tidak ada penanda (tak bisa dinilai jujur)", () => {
      expect(
        cheapestChannel([{ ...BNI, estimatedTotalPayMaxIdr: undefined }, VA]),
      ).toBeNull();
    });

    test("satu metode → tak ada pembanding", () => {
      expect(cheapestChannel([VA])).toBeNull();
    });
  });
});

describe("opsi yang tidak tersedia untuk order ini (rev-17)", () => {
  const BNI_DI_ATAS_BATAS: MintChannelOption = {
    ...BNI,
    estimatedTotalPayIdr: "10000500.00",
    estimatedTotalPayMaxIdr: "10001499.00",
    available: false,
    unavailableReason: "AMOUNT_ABOVE_METHOD_MAX",
  };

  describe("positive", () => {
    test("tampil non-aktif beserta alasannya, bukan disembunyikan", () => {
      renderSelector([BNI_DI_ATAS_BATAS, VA]);
      expect(card(/Transfer BNI/)).toBeDisabled();
      expect(screen.getByText(/melebihi batas Rp 10\.000\.000/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("tidak bisa dipilih dan tidak bisa dibayar", () => {
      const { onPay } = renderSelector([BNI_DI_ATAS_BATAS, VA]);
      fireEvent.click(card(/Transfer BNI/));
      expect(card(/Transfer BNI/)).not.toBeChecked();
      expect(payButton()).toBeDisabled();
      expect(onPay).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    test("alasan yang tak dikenal → teks umum, tetap non-aktif", () => {
      renderSelector([{ ...BNI, available: false, unavailableReason: "ALASAN_BARU" }, VA]);
      expect(card(/Transfer BNI/)).toBeDisabled();
      expect(screen.getByText(/tidak bisa dipakai untuk pesanan ini/)).toBeInTheDocument();
    });

    test("metode terpilih berubah tidak tersedia di muatan berikutnya → tombol bayar mati lagi", () => {
      const { repoll } = renderSelector([BNI, VA]);
      fireEvent.click(card(/Transfer BNI/));
      expect(payButton()).toBeEnabled();
      repoll([BNI_DI_ATAS_BATAS, VA]);
      expect(payButton()).toBeDisabled();
    });

    test("semua opsi tidak tersedia → kalimat yang menjelaskan, bukan perintah memilih", () => {
      renderSelector([BNI_DI_ATAS_BATAS]);
      expect(screen.getByText(/Belum ada metode pembayaran yang bisa dipakai/)).toBeInTheDocument();
    });
  });
});

describe("Transfer BNI dipilih (USD, USDX-749 — keputusan PM 14 Okt 2026)", () => {
  describe("positive", () => {
    test("detail: hanya penjelasan bahwa nominal muncul di langkah berikutnya", () => {
      renderSelector([BNI, VA]);
      fireEvent.click(card(/Transfer BNI/));
      const detail = screen.getByTestId("detail-BANK_TRANSFER");
      expect(detail).toHaveTextContent(
        "Nominal transfer (termasuk kode unik sen yang ikut jadi USDX) muncul di langkah berikutnya.",
      );
    });

    test("tombol 'Lanjut, lihat nominal transfer' mengirim channel=BANK_TRANSFER, bank=BNI", () => {
      const { onPay } = renderSelector([BNI, VA]);
      fireEvent.click(card(/Transfer BNI/));
      expect(payButton()).toHaveTextContent(/^Lanjut, lihat nominal transfer$/);
      fireEvent.click(payButton());
      expect(onPay).toHaveBeenCalledWith("BANK_TRANSFER", "BNI");
    });

    test("badge 'Paling hemat' tetap menempel di baris BNI yang tak berangka", () => {
      renderSelector([BNI, VA]);
      const label = card(/Transfer BNI/).closest("label")!;
      expect(within(label).getByText("Paling hemat")).toBeInTheDocument();
      expect(label).not.toHaveTextContent(/\$|Rp/);
    });
  });

  describe("negative", () => {
    test("tidak meminta pilih bank", () => {
      renderSelector([BNI, VA]);
      fireEvent.click(card(/Transfer BNI/));
      expect(screen.queryByRole("radiogroup", { name: "Pilih bank" })).not.toBeInTheDocument();
    });

    test("detail tanpa angka: tanpa Total bayar, tanpa USD, tanpa rupiah, tanpa kurs", () => {
      renderSelector([{ ...BNI, rateUpdatedAt: "2026-10-13T02:00:00Z" }, VA]);
      fireEvent.click(card(/Transfer BNI/));
      const detail = screen.getByTestId("detail-BANK_TRANSFER");
      expect(within(detail).queryByText(/Total bayar/)).not.toBeInTheDocument();
      expect(detail).not.toHaveTextContent(/\$\d|Rp|≈/);
      expect(within(detail).queryByText(/^Kurs/)).not.toBeInTheDocument();
      expect(within(detail).queryByText(/Diperbarui/)).not.toBeInTheDocument();
      expect(screen.queryByText("Rp 81.000")).not.toBeInTheDocument();
    });

    test("subjudul BNI satu kalimat polos: tanpa '·' dan tanpa 'tanpa biaya'", () => {
      renderSelector([BNI, VA]);
      const label = card(/Transfer BNI/).closest("label")!;
      expect(label).not.toHaveTextContent(/·|tanpa biaya/);
    });

    test("tombol Transfer BNI tidak pernah 'Bayar $X' atau 'Bayar Rp X'", () => {
      renderSelector([BNI, VA]);
      fireEvent.click(card(/Transfer BNI/));
      expect(payButton()).not.toHaveTextContent(/Bayar/);
    });

    test("tombol Virtual Account tidak berubah: tetap 'Bayar Rp X'", () => {
      renderSelector([BNI, VA]);
      fireEvent.click(card(/Virtual Account/));
      fireEvent.click(screen.getByRole("radio", { name: "Nobu" }));
      expect(payButton()).toHaveTextContent("Bayar Rp 86.820");
    });
  });

  describe("edge cases", () => {
    test("estimatedTotalPayUsd absen → baris & tombol sama saja, tidak jatuh ke rupiah", () => {
      renderSelector([{ ...BNI, estimatedTotalPayUsd: null }, VA]);
      expect(screen.queryByText("Rp 81.000")).not.toBeInTheDocument();
      expect(screen.getByText(BNI_SUBTITLE)).toBeInTheDocument();
      fireEvent.click(card(/Transfer BNI/));
      expect(payButton()).toHaveTextContent(/^Lanjut, lihat nominal transfer$/);
    });

    test("estimasi bersen ($3,12) dari backend tetap tidak ditampilkan", () => {
      renderSelector([{ ...BNI, estimatedTotalPayUsd: "3.12", estimatedTotalPayMaxUsd: "4.11" }]);
      expect(screen.queryByText("$3,12")).not.toBeInTheDocument();
      expect(screen.queryByText("$4,11")).not.toBeInTheDocument();
    });

    test("opsi BNI tidak tersedia → alasan menggantikan subjudul, label 'Tidak tersedia'", () => {
      renderSelector([{ ...BNI, available: false, unavailableReason: "AMOUNT_ABOVE_METHOD_MAX" }, VA]);
      expect(screen.queryByText(BNI_SUBTITLE)).not.toBeInTheDocument();
      expect(within(card(/Transfer BNI/).closest("label")!).getByText("Tidak tersedia")).toBeInTheDocument();
    });

    test("BNI satu-satunya opsi (tanpa pembanding) → tanpa badge dan tanpa kolom kanan", () => {
      renderSelector([BNI]);
      const label = card(/Transfer BNI/).closest("label")!;
      expect(within(label).queryByText("Paling hemat")).not.toBeInTheDocument();
      expect(label.querySelector('[data-slot="card-choice-trailing"]')).toBeNull();
    });
  });
});

describe("Virtual Account dipilih", () => {
  describe("positive", () => {
    test("pilih bank lalu bayar mengirim channel=VA + bank", () => {
      const { onPay } = renderSelector([BNI, VA]);
      fireEvent.click(card(/Virtual Account/));
      fireEvent.click(screen.getByRole("radio", { name: "Nobu" }));
      fireEvent.click(payButton());
      expect(onPay).toHaveBeenCalledWith("VA", "NOBU");
    });

    test("biaya per bank dari bankOptions[] — total tombol ikut bank yang dipilih", () => {
      const va: MintChannelOption = {
        ...VA,
        banks: ["NOBU", "MANDIRI"],
        disabledBanks: undefined,
        bankOptions: [
          { ...VA.bankOptions![0] },
          {
            paymentMethodId: "m2",
            bank: "MANDIRI",
            feeType: "FLAT_IDR",
            feeValue: "5000.00",
            pgFeeIdr: "5000.00",
            estimatedTotalPayIdr: "87820.00",
            estimatedTotalPayMaxIdr: "87820.00",
          },
        ],
      };
      renderSelector([va]);
      // Sebelum bank dipilih, angka channel = bank termurah dan diberi awalan "mulai".
      expect(screen.getByText("mulai Rp 86.820")).toBeInTheDocument();
      fireEvent.click(card(/Virtual Account/));
      fireEvent.click(screen.getByRole("radio", { name: "Mandiri" }));
      expect(payButton()).toHaveTextContent("Bayar Rp 87.820");
    });

    test("bank di disabledBanks tampil 'Segera hadir', bukan pilihan", () => {
      renderSelector([BNI, VA]);
      fireEvent.click(card(/Virtual Account/));
      const list = screen.getByRole("list", { name: "Bank yang belum tersedia" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(3);
      const group = screen.getByRole("radiogroup", { name: "Pilih bank" });
      expect(within(group).getAllByRole("radio")).toHaveLength(1);
    });
  });

  describe("negative", () => {
    test("tanpa bank dipilih, tombol bayar mati", () => {
      renderSelector([BNI, VA]);
      fireEvent.click(card(/Virtual Account/));
      expect(payButton()).toBeDisabled();
      expect(screen.getByText("Pilih bank dulu untuk lanjut.")).toBeInTheDocument();
    });

    test("bank yang pindah ke disabledBanks setelah dipilih tidak ikut terkirim", () => {
      const { onPay, repoll } = renderSelector([BNI, VA]);
      fireEvent.click(card(/Virtual Account/));
      fireEvent.click(screen.getByRole("radio", { name: "Nobu" }));
      repoll([BNI, { ...VA, disabledBanks: ["NOBU", "BNI"] }]);
      fireEvent.click(payButton());
      expect(onPay).not.toHaveBeenCalled();
    });

    test("bank dengan bankOptions available=false tidak bisa dipilih", () => {
      renderSelector([
        {
          ...VA,
          disabledBanks: undefined,
          bankOptions: [{ ...VA.bankOptions![0], available: false, unavailableReason: "AMOUNT_ABOVE_METHOD_MAX", maxAmountIdr: "50000.00" }],
        },
      ]);
      fireEvent.click(card(/Virtual Account/));
      expect(screen.queryByRole("radiogroup", { name: "Pilih bank" })).not.toBeInTheDocument();
      expect(screen.getByText(/melebihi batas Rp 50\.000/)).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("tanpa satu pun bank aktif → tidak ada perintah yang mustahil dituruti", () => {
      renderSelector([{ ...VA, banks: [], bankOptions: [] }]);
      fireEvent.click(card(/Virtual Account/));
      expect(screen.queryByText("Pilih bank dulu untuk lanjut.")).not.toBeInTheDocument();
      expect(screen.getByText(/Belum ada bank yang bisa dipakai/)).toBeInTheDocument();
    });
  });
});

describe("tidak ada yang dipra-pilih (Figma A1a)", () => {
  describe("positive", () => {
    test("tombol utama mati dan menyebut alasannya sebelum memilih", () => {
      renderSelector([BNI, VA]);
      expect(payButton()).toBeDisabled();
      expect(payButton()).toHaveTextContent("Pilih metode pembayaran");
    });
  });

  describe("negative", () => {
    test("satu metode dari backend → tetap belum tercentang", () => {
      renderSelector([BNI]);
      expect(card(/Transfer BNI/)).not.toBeChecked();
    });
  });

  describe("edge cases", () => {
    test("ganti metode mereset bank", () => {
      const { onPay } = renderSelector([BNI, VA]);
      fireEvent.click(card(/Virtual Account/));
      fireEvent.click(screen.getByRole("radio", { name: "Nobu" }));
      fireEvent.click(card(/Transfer BNI/));
      fireEvent.click(card(/Virtual Account/));
      expect(payButton()).toBeDisabled();
      expect(onPay).not.toHaveBeenCalled();
    });
  });
});

describe("priceOf", () => {
  test("positive — bank terpilih memakai angka bankOptions-nya", () => {
    const p = priceOf(VA, {}, { ...VA.bankOptions![0], pgFeeIdr: "5000.00", estimatedTotalPayIdr: "87820.00" });
    expect(p.total).toBe(87820);
    expect(p.pgFee).toBe(5000);
  });

  test("negative — tanpa estimasi dan tanpa harga order → total null, bukan Rp 0", () => {
    expect(priceOf({ channel: "VA", pgFeeIdr: "4000", banks: [] }, { totalBeforePgFeeIdr: null }).total).toBeNull();
  });

  test("edge — string kosong tidak dibaca sebagai nol", () => {
    expect(priceOf({ channel: "VA", pgFeeIdr: "", banks: [] }, { totalBeforePgFeeIdr: "1000" }).total).toBeNull();
  });
});
