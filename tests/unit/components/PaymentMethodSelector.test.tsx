import { describe, test, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PaymentMethodSelector } from "@/components/checkout/PaymentMethodSelector";
import type { MintChannelOption } from "@/types";

// Temuan audit D4: layar pertama checkout hanya menampilkan "Nilai pesanan" dan biaya layanan
// per metode — angka yang benar-benar harus dibayar baru muncul SETELAH kartu metode diklik.
// Di halaman pembayaran, itu terlambat.
//
// Temuan audit D5: satu angka, satu nama. "Total bayar" dipakai di sini, di ringkasan, di
// rincian biaya, dan di blok instruksi VA.

const VA: MintChannelOption = { channel: "VA", pgFeeIdr: "4000", banks: ["BCA", "BNI"] };
const QRIS: MintChannelOption = { channel: "QRIS", pgFeeIdr: "4000", banks: null };
const QRIS_MAHAL: MintChannelOption = { channel: "QRIS", pgFeeIdr: "5500", banks: null };

function renderSelector(channels: MintChannelOption[]) {
  return render(
    <PaymentMethodSelector
      channels={channels}
      totalBeforePgFeeIdr="162500"
      isPaying={false}
      payError={null}
      onPay={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

describe("total bayar terbaca sejak awal (D4)", () => {
  describe("positive", () => {
    test("satu metode → total pasti tampil sebelum apa pun diklik", () => {
      renderSelector([VA]);
      expect(screen.getByText("Total bayar")).toBeInTheDocument();
      expect(screen.getByText("Rp 166.500")).toBeInTheDocument();
    });

    test("beberapa metode berbiaya sama → tetap satu angka pasti", () => {
      renderSelector([VA, QRIS]);
      expect(screen.getByText("Rp 166.500")).toBeInTheDocument();
      expect(screen.queryByText(/mengikuti metode/)).not.toBeInTheDocument();
    });

    test("setelah metode dipilih, totalnya jadi angka metode itu", () => {
      renderSelector([VA, QRIS_MAHAL]);
      fireEvent.click(screen.getByText("QRIS"));
      expect(screen.getByText("Rp 168.000")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("biaya antar-metode BERBEDA → rentang + catatan, bukan satu angka yang dikarang", () => {
      renderSelector([VA, QRIS_MAHAL]);
      expect(screen.getByText("Rp 166.500 – Rp 168.000")).toBeInTheDocument();
      expect(screen.getByText(/mengikuti metode/)).toBeInTheDocument();
    });

    test("biaya tak diketahui (refresh tanpa channels lengkap) → tak ada angka yang dikarang", () => {
      renderSelector([{ channel: "VA", pgFeeIdr: "", banks: ["BCA"] }]);
      expect(screen.queryByText("Total bayar")).not.toBeInTheDocument();
    });
  });
});

describe("penamaan angka (D5)", () => {
  describe("negative", () => {
    test("tidak memakai label lama yang berbeda-beda untuk angka yang sama", () => {
      renderSelector([VA]);
      expect(screen.queryByText("Total yang dibayar")).not.toBeInTheDocument();
      expect(screen.queryByText("Jumlah yang harus dibayar")).not.toBeInTheDocument();
    });
  });
});


// ── Migrasi ke `ui/radio-group` (temuan F5/F6/D4, peta migrasi D.1) ──────────────────────────
// Dulu metode dan bank dirender sebagai <button aria-pressed>. `aria-pressed` menyatakan TOGGLE
// yang bisa menyala sendiri-sendiri; ini pilihan eksklusif. Radix memberi peran, keterkaitan
// grup, navigasi panah, dan satu tab stop — semuanya hilang di versi buatan tangan.
describe("pilihan memakai semantik radio, bukan tombol toggle", () => {
  describe("positive", () => {
    test("metode dirender sebagai satu grup radio bernama", () => {
      renderSelector([VA, QRIS_MAHAL]);
      expect(screen.getByRole("radiogroup", { name: "Metode pembayaran" })).toBeInTheDocument();
      expect(screen.getAllByRole("radio")).toHaveLength(2);
    });

    test("memilih metode menandai tepat satu radio terpilih", () => {
      renderSelector([VA, QRIS_MAHAL]);
      fireEvent.click(screen.getByRole("radio", { name: /QRIS/ }));
      expect(screen.getByRole("radio", { name: /QRIS/ })).toBeChecked();
      expect(screen.getByRole("radio", { name: /Virtual Account/ })).not.toBeChecked();
    });

    test("bank jadi grup radio TERPISAH (dua RovingFocusGroup bersarang berebut tombol panah)", () => {
      renderSelector([VA, QRIS_MAHAL]);
      fireEvent.click(screen.getByRole("radio", { name: /Virtual Account/ }));
      const grup = screen.getAllByRole("radiogroup");
      expect(grup).toHaveLength(2);
      expect(screen.getByRole("radiogroup", { name: "Pilih bank" })).toBeInTheDocument();
      // Grup bank bukan keturunan grup metode.
      const metode = screen.getByRole("radiogroup", { name: "Metode pembayaran" });
      expect(metode.contains(screen.getByRole("radiogroup", { name: "Pilih bank" }))).toBe(false);
    });

    test("tiap bank punya nama yang terbaca, bukan cuma gambar", () => {
      renderSelector([VA]);
      expect(screen.getByRole("radio", { name: "BCA" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "BNI" })).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("tidak ada lagi aria-pressed (itu semantik toggle, bukan pilihan eksklusif)", () => {
      const { container } = renderSelector([VA, QRIS_MAHAL]);
      expect(container.querySelector("[aria-pressed]")).toBeNull();
    });
  });
});

// Temuan F6: pilihan yang tak punya alternatif bukan pilihan, cuma rintangan.
describe("metode/bank tunggal dipilih dari awal (F6)", () => {
  describe("positive", () => {
    test("satu metode → terpilih tanpa diklik", () => {
      renderSelector([VA]);
      expect(screen.getByRole("radio", { name: /Virtual Account/ })).toBeChecked();
    });

    test("satu metode + satu bank → tombol bayar langsung hidup", () => {
      renderSelector([{ channel: "VA", pgFeeIdr: "4000", banks: ["BNI"] }]);
      expect(screen.getByRole("radio", { name: "BNI" })).toBeChecked();
      expect(screen.getByText("Bayar Sekarang").closest("button")).not.toBeDisabled();
    });
  });

  describe("negative", () => {
    test("lebih dari satu metode → tak ada yang dipilih diam-diam", () => {
      renderSelector([VA, QRIS_MAHAL]);
      expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
      expect(screen.getByText("Bayar Sekarang").closest("button")).toBeDisabled();
    });

    test("satu metode tapi banyak bank → bayar tetap terkunci sampai bank dipilih", () => {
      renderSelector([VA]);
      expect(screen.getByText("Bayar Sekarang").closest("button")).toBeDisabled();
      expect(screen.getByText(/Pilih bank dulu untuk lanjut/)).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("pindah metode melepas bank yang tadi dipilih", () => {
      renderSelector([VA, QRIS_MAHAL]);
      fireEvent.click(screen.getByRole("radio", { name: /Virtual Account/ }));
      fireEvent.click(screen.getByRole("radio", { name: "BNI" }));
      fireEvent.click(screen.getByRole("radio", { name: /QRIS/ }));
      fireEvent.click(screen.getByRole("radio", { name: /Virtual Account/ }));
      expect(screen.getByRole("radio", { name: "BNI" })).not.toBeChecked();
    });
  });
});
