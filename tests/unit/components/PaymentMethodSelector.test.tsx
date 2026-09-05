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
      // Dua channel dari backend + kartu "Transfer bank BNI" yang selalu ada (Figma A1a).
      expect(screen.getAllByRole("radio")).toHaveLength(3);
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
      fireEvent.click(screen.getByRole("radio", { name: /Virtual Account/ }));
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

// Aturan F6 lama ("metode/bank tunggal dipilih dari awal") DICABUT, keputusan pemilik produk
// 5 September 2026. Premisnya — "cuma ada satu pilihan, jadi mengkliknya sia-sia" — sudah tidak
// berlaku sejak kartu "Transfer bank BNI" digambar permanen: layar ini selalu punya lebih dari
// satu kartu. Akibat aturan itu nyata: dengan satu channel dari backend, layar terbuka dengan
// Virtual Account sudah tercentang, jadi keadaan A1a Figma (`2639:31770`, "belum dipilih, tidak
// dipra-pilih") tidak pernah terlihat sama sekali.
describe("tidak ada yang dipra-pilih (Figma A1a)", () => {
  describe("positive", () => {
    test("satu metode dari backend → tetap belum ada yang tercentang", () => {
      renderSelector([VA]);
      expect(screen.getByRole("radio", { name: /Virtual Account/ })).not.toBeChecked();
      expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
      expect(screen.getByText(/Pilih metode pembayaran untuk lanjut/)).toBeInTheDocument();
    });

    test("satu metode + satu bank → bayar tetap mati sampai keduanya diketuk", () => {
      renderSelector([{ channel: "VA", pgFeeIdr: "4000", banks: ["BNI"] }]);
      expect(screen.getByText("Bayar sekarang").closest("button")).toBeDisabled();
      fireEvent.click(screen.getByRole("radio", { name: /Virtual Account/ }));
      expect(screen.getByRole("radio", { name: "BNI" })).not.toBeChecked();
      expect(screen.getByText("Bayar sekarang").closest("button")).toBeDisabled();
      fireEvent.click(screen.getByRole("radio", { name: "BNI" }));
      expect(screen.getByText("Bayar sekarang").closest("button")).not.toBeDisabled();
    });
  });

  describe("negative", () => {
    test("lebih dari satu metode → tak ada yang dipilih diam-diam", () => {
      renderSelector([VA, QRIS_MAHAL]);
      expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
      expect(screen.getByText("Bayar sekarang").closest("button")).toBeDisabled();
    });

    test("lapis bank belum muncul sebelum metode dipilih", () => {
      renderSelector([VA]);
      expect(screen.queryByRole("radiogroup", { name: "Pilih bank" })).not.toBeInTheDocument();
    });

    test("satu metode tapi banyak bank → bayar tetap terkunci sampai bank dipilih", () => {
      renderSelector([VA]);
      fireEvent.click(screen.getByRole("radio", { name: /Virtual Account/ }));
      expect(screen.getByText("Bayar sekarang").closest("button")).toBeDisabled();
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

// Kartu kedua Figma A1a/A1b (`2639:31820`). TIDAK datang dari `channels[]` — transfer bank
// langsung belum ada di backend, dan justru itu yang diberitahukan kartunya.
describe("kartu 'Transfer bank BNI' segera hadir", () => {
  describe("positive", () => {
    test("selalu dirender, bahkan saat backend cuma mengirim satu channel", () => {
      renderSelector([VA]);
      expect(screen.getByRole("radio", { name: /Transfer bank BNI/ })).toBeInTheDocument();
      expect(screen.getByText("Segera hadir")).toBeInTheDocument();
    });

    test("pembaca layar tahu ia belum tersedia: badge ikut jadi namanya", () => {
      renderSelector([VA]);
      expect(
        screen.getByRole("radio", { name: /Transfer bank BNI.*Segera hadir/ }),
      ).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("benar-benar mati: disabled, lepas dari roving focus, tak bisa dicentang", () => {
      renderSelector([VA]);
      const kartu = screen.getByRole("radio", { name: /Transfer bank BNI/ });
      expect(kartu).toBeDisabled();
      expect(kartu).toHaveAttribute("data-disabled");
      expect(kartu).toHaveAttribute("tabindex", "-1");
      fireEvent.click(kartu);
      expect(kartu).not.toBeChecked();
      expect(screen.getByText("Bayar sekarang").closest("button")).toBeDisabled();
    });

    test("tidak ikut menghitung biaya — ia bukan channel", () => {
      renderSelector([VA]);
      // Total tetap dari VA saja: 162.500 + 4.000.
      expect(screen.getByText("Rp 166.500")).toBeInTheDocument();
    });
  });
});

// Figma A1b (`2639:32217`) menggambar Mandiri → BRI → BNI. Backend tidak menjanjikan urutan,
// dan halaman ini mem-poll GET terus-menerus: urutan yang ikut respons berarti ubin bank bisa
// bertukar tempat di bawah jari orang yang sedang memilih rekening tujuan.
describe("urutan bank ditentukan di sini, bukan oleh urutan respons", () => {
  describe("positive", () => {
    test("ubin bank urut Mandiri → BRI → BNI apa pun urutan backend", () => {
      renderSelector([{ channel: "VA", pgFeeIdr: "4000", banks: ["BNI", "MANDIRI", "BRI"] }]);
      fireEvent.click(screen.getByRole("radio", { name: /Virtual Account/ }));
      const grup = screen.getByRole("radiogroup", { name: "Pilih bank" });
      const nama = Array.from(grup.querySelectorAll("[data-slot=radio-group-item]")).map((el) =>
        el.getAttribute("aria-label"),
      );
      expect(nama).toEqual(["MANDIRI", "BRI", "BNI"]);
    });

    test("keterangan kartu VA memakai nama yang dibaca orang, urut sama", () => {
      renderSelector([{ channel: "VA", pgFeeIdr: "4000", banks: ["BNI", "MANDIRI", "BRI"] }]);
      expect(screen.getByText("Mandiri · BRI · BNI")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("bank di luar daftar urutan tetap tampil, di belakang", () => {
      renderSelector([{ channel: "VA", pgFeeIdr: "4000", banks: ["BCA", "BNI", "MANDIRI"] }]);
      expect(screen.getByText("Mandiri · BNI · BCA")).toBeInTheDocument();
    });
  });
});
