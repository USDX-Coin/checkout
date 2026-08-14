import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MintOrderDetail } from "@/types";

// Tugas 6 (catatan/TUGAS-6-PERBAIKI-CHECKOUT.md) — dua janji yang menyangkut uang user:
//  1. Banner "Mode simulasi: pembayaran tidak diproses ke bank sungguhan" HANYA saat backend
//     menyatakan paymentMode === "SIMULATION". Field absen/tak dikenal → JANGAN tampil.
//  2. Order PAID (belum COMPLETED) tidak boleh lagi menampilkan tagihan — nomor VA + "Jumlah
//     yang harus dibayar" pada user yang sudah transfer = risiko bayar dua kali.

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ orderId: "ord_1" }),
  useRouter: () => ({ back: mockBack, push: vi.fn(), replace: vi.fn() }),
}));

const mockUseCheckout = vi.fn();
vi.mock("@/hooks/useCheckout", () => ({ useCheckout: (id: string) => mockUseCheckout(id) }));

import { CheckoutContent } from "@/components/checkout/CheckoutContent";

function makeOrder(o: Partial<MintOrderDetail> = {}): MintOrderDetail {
  return {
    id: "ord_1",
    orderNumber: "USDX-1",
    customerName: "Demo",
    type: "MINT",
    userAddress: "0xabc0000000000000000000000000000000000def",
    chain: "polygon",
    inputCurrency: "IDR",
    amount: "10",
    baseRate: "16000",
    spreadBuyPct: "2.5",
    effectiveRate: "16400",
    subtotalIdr: "160000",
    mintFeePct: "1",
    mintFeeIdr: "2500",
    totalBeforePgFeeIdr: "162500",
    paymentChannel: "VA",
    pgFeeIdr: "4000",
    totalFeeIdr: "6500",
    totalPayIdr: "166500",
    paymentBank: "BCA",
    paymentStatus: "WAITING_FOR_PAYMENT",
    safeStatus: "NONE",
    status: "WAITING_FOR_PAYMENT",
    paymentProvider: "DURIANPAY_SNAP",
    virtualAccountNo: "8878471690378849",
    paymentUrl: null,
    paymentRef: "ref-1",
    paidAt: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    safeTxHash: null,
    onChainTxHash: null,
    createdAt: "2026-08-13T13:00:00Z",
    updatedAt: "2026-08-13T13:00:00Z",
    ...o,
  };
}

// Empat keadaan yang harus diverifikasi: belum bayar → sudah bayar/menunggu approval →
// selesai → kedaluwarsa.
const BELUM_BAYAR = makeOrder();
const SUDAH_BAYAR = makeOrder({
  paymentStatus: "PAID",
  status: "WAITING_FOR_APPROVAL",
  safeStatus: "PENDING_APPROVAL",
  safeTxHash: "0xsafe",
  paidAt: "2026-08-13T14:03:44Z", // 21.03 WIB
});
const SELESAI = makeOrder({
  paymentStatus: "PAID",
  status: "COMPLETED",
  safeStatus: "EXECUTED",
  onChainTxHash: "0xdeadbeefcafe",
  paidAt: "2026-08-13T14:03:44Z",
});

function renderWith(order: MintOrderDetail | null, over: Record<string, unknown> = {}) {
  mockUseCheckout.mockReturnValue({
    order,
    isLoading: false,
    isError: false,
    isUnauthorized: false,
    pay: vi.fn(),
    isPaying: false,
    payError: null,
    secondsLeft: 900,
    isExpired: false,
    isTerminal: false,
    ...over,
  });
  return render(<CheckoutContent />);
}

const BANNER = /Mode simulasi: pembayaran tidak diproses ke bank sungguhan/;
const TAGIHAN = /Jumlah yang harus dibayar/;

beforeEach(() => {
  mockUseCheckout.mockReset();
  mockBack.mockReset();
});

describe("banner mode simulasi (Tugas 6 poin 1)", () => {
  describe("positive", () => {
    test("paymentMode SIMULATION → banner tampil", () => {
      renderWith(makeOrder({ paymentMode: "SIMULATION", paymentProvider: "MOCK" }));
      expect(screen.getByText(BANNER)).toBeInTheDocument();
      expect(screen.getByText(/Mode simulasi — pembayaran tidak diproses/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("paymentMode LIVE → banner TIDAK tampil", () => {
      renderWith(makeOrder({ paymentMode: "LIVE" }));
      expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
      expect(screen.queryByText(/Mode simulasi/)).not.toBeInTheDocument();
    });

    test("field paymentMode ABSEN (backend lama) → banner TIDAK tampil (default aman)", () => {
      renderWith(BELUM_BAYAR);
      expect(screen.queryByText(/Mode simulasi/)).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("nilai paymentMode tak dikenal → diperlakukan LIVE, banner TIDAK tampil", () => {
      const order = makeOrder();
      (order as unknown as Record<string, string>).paymentMode = "SANDBOX";
      renderWith(order);
      expect(screen.queryByText(/Mode simulasi/)).not.toBeInTheDocument();
    });

    test("SIMULATION tapi sudah COMPLETED → banner tak perlu lagi", () => {
      renderWith(makeOrder({ ...SELESAI, paymentMode: "SIMULATION" }));
      expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    });
  });
});

describe("keadaan: belum bayar", () => {
  describe("positive", () => {
    test("tampil nomor VA + tagihan + countdown", () => {
      renderWith(BELUM_BAYAR);
      expect(screen.getByText("8878 4716 9037 8849")).toBeInTheDocument();
      expect(screen.getByText(TAGIHAN)).toBeInTheDocument();
      expect(screen.getByText(/Pembayaran berakhir dalam/)).toBeInTheDocument();
    });
  });
});

describe("keadaan: sudah bayar / menunggu approval (Tugas 6 poin 2, 3, 4)", () => {
  describe("positive", () => {
    test("tampil konfirmasi 'Pembayaran diterima' + nominal + waktu WIB", () => {
      renderWith(SUDAH_BAYAR);
      expect(screen.getByText("Pembayaran diterima")).toBeInTheDocument();
      expect(screen.getAllByText("Rp 166.500").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/21\.03 WIB/).length).toBeGreaterThan(0);
    });

    test("langkah on-chain menjelaskan sedang menunggu persetujuan & boleh ditutup", () => {
      renderWith(SUDAH_BAYAR);
      expect(screen.getByText(/menunggu persetujuan/)).toBeInTheDocument();
      expect(screen.getByText(/halaman ini boleh ditutup/)).toBeInTheDocument();
    });

    test("nomor VA masih bisa dirujuk lewat accordion 'Detail pembayaran'", () => {
      renderWith(SUDAH_BAYAR);
      expect(screen.getByText("Detail pembayaran")).toBeInTheDocument();
      expect(screen.getByText("8878 4716 9037 8849")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("TIDAK ada lagi 'Jumlah yang harus dibayar' maupun perintah transfer persis", () => {
      renderWith(SUDAH_BAYAR);
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
      expect(screen.queryByText(/Transfer nominal/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Cara pembayaran/)).not.toBeInTheDocument();
    });

    test("countdown 'Pembayaran berakhir dalam' tidak tampil setelah lunas", () => {
      renderWith(SUDAH_BAYAR);
      expect(screen.queryByText(/Pembayaran berakhir dalam/)).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("paidAt null → blok konfirmasi tetap tampil tanpa baris waktu", () => {
      renderWith(makeOrder({ ...SUDAH_BAYAR, paidAt: null }));
      expect(screen.getByText("Pembayaran diterima")).toBeInTheDocument();
      expect(screen.queryByText(/WIB/)).not.toBeInTheDocument();
    });

    test("paidAt tak valid → tidak menampilkan 'Invalid Date'", () => {
      renderWith(makeOrder({ ...SUDAH_BAYAR, paidAt: "bukan-tanggal" }));
      expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    });

    test("COMPLETED tanpa onChainTxHash → masih keadaan sudah-bayar, BUKAN layar sukses", () => {
      // Guard USDX-293 tetap berlaku: tanpa bukti tx on-chain jangan bilang berhasil.
      renderWith(makeOrder({ ...SUDAH_BAYAR, status: "COMPLETED", onChainTxHash: null }));
      expect(screen.getByText("Pembayaran diterima")).toBeInTheDocument();
      expect(screen.queryByText("Mint Berhasil")).not.toBeInTheDocument();
    });
  });
});

describe("keadaan: selesai", () => {
  describe("positive", () => {
    test("COMPLETED + txHash → layar sukses, tanpa instruksi bayar", () => {
      renderWith(SELESAI);
      expect(screen.getByText("Mint Berhasil")).toBeInTheDocument();
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
      expect(screen.queryByText("Pembayaran diterima")).not.toBeInTheDocument();
    });
  });
});

describe("keadaan: kedaluwarsa", () => {
  describe("positive", () => {
    test("isExpired → pesan kedaluwarsa, tanpa nomor VA/tagihan", () => {
      renderWith(BELUM_BAYAR, { isExpired: true, secondsLeft: 0 });
      expect(screen.getByText("Pesanan kedaluwarsa.")).toBeInTheDocument();
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
      expect(screen.queryByText("8878 4716 9037 8849")).not.toBeInTheDocument();
    });
  });
});

describe("penamaan angka (Tugas 6 poin 5)", () => {
  describe("positive", () => {
    test("dua angka punya nama berbeda + rincian biaya bisa dibuka", () => {
      renderWith(BELUM_BAYAR);
      expect(screen.getByText("Nilai pesanan")).toBeInTheDocument();
      expect(screen.getAllByText("Total yang dibayar").length).toBeGreaterThan(0);
      expect(screen.getByText("Rincian biaya")).toBeInTheDocument();
      // Rincian memecah komponennya, bukan mengulang label ringkasan.
      expect(screen.getByText("Nilai USDX")).toBeInTheDocument();
      expect(screen.getByText("Biaya mint (1%)")).toBeInTheDocument();
      expect(screen.getByText("Biaya layanan pembayaran")).toBeInTheDocument();
    });

    test("tidak ada lagi label lama 'Total Pembayaran' yang bertabrakan artinya", () => {
      renderWith(BELUM_BAYAR);
      expect(screen.queryByText("Total Pembayaran")).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("selisih yang tak tertutup pgFee (kode unik) tetap dirinci agar menjumlah", () => {
      // BNI menempelkan kode unik ke total_pay_idr; tanpa baris ini rincian tak menjumlah.
      renderWith(makeOrder({ totalPayIdr: "166637", pgFeeIdr: "4000" }));
      expect(screen.getByText("Kode unik")).toBeInTheDocument();
      expect(screen.getByText("Rp 137")).toBeInTheDocument();
    });

    test("belum pilih metode (totalPayIdr null) → hanya nilai pesanan, tanpa rincian", () => {
      renderWith(
        makeOrder({ paymentStatus: "REQUESTED", totalPayIdr: null, pgFeeIdr: null, channels: [] }),
      );
      expect(screen.getByText("Nilai pesanan")).toBeInTheDocument();
      expect(screen.queryByText("Total yang dibayar")).not.toBeInTheDocument();
      expect(screen.queryByText("Rincian biaya")).not.toBeInTheDocument();
    });
  });
});

describe("logo bank tidak dobel dengan namanya", () => {
  describe("positive", () => {
    test("bank berlogo → hanya logo (nama tetap terbaca lewat alt), bukan 'BCA BCA'", () => {
      renderWith(BELUM_BAYAR);
      const row = screen.getByText("Virtual Account").parentElement!;
      expect(row.querySelector("img")).toHaveAttribute("alt", "BCA");
      expect(row.textContent).not.toContain("BCA");
    });
  });
});

// ── Temuan verifikasi netral adversarial (Tugas 6, putaran 2) ────────────────────────────
// Ketiganya satu keluarga: layar tak boleh menagih user yang uangnya sudah bergerak, atau yang
// VA-nya sudah mati.

describe("order mati: EXPIRED/FAILED dari backend tidak boleh menampilkan tagihan", () => {
  // Expiry Handler backend menulis paymentStatus=EXPIRED DAN status=FAILED sekaligus
  // (expiry-handler.repository.ts). Karena FAILED itu terminal, `isExpired` dari hook selalu
  // false untuk kasus ini — dulu order jatuh ke cabang terakhir dan memasang tagihan lagi.
  const MATI_BACKEND = makeOrder({ paymentStatus: "EXPIRED", status: "FAILED" });

  describe("positive", () => {
    test("EXPIRED+FAILED → layar kedaluwarsa, VA dinyatakan tak berlaku", () => {
      renderWith(MATI_BACKEND, { isExpired: false });
      expect(screen.getByText("Pesanan kedaluwarsa.")).toBeInTheDocument();
      expect(screen.getByText(/sudah tidak berlaku/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("EXPIRED+FAILED → TIDAK ada nomor VA, tagihan, maupun perintah transfer", () => {
      renderWith(MATI_BACKEND, { isExpired: false });
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
      expect(screen.queryByText("8878 4716 9037 8849")).not.toBeInTheDocument();
      expect(screen.queryByText(/Transfer nominal/)).not.toBeInTheDocument();
    });

    test("FAILED tanpa EXPIRED (gagal sebab lain, uang belum masuk) → 'Transaksi gagal', bukan tagihan", () => {
      renderWith(makeOrder({ paymentStatus: "WAITING_FOR_PAYMENT", status: "FAILED" }), {
        isExpired: false,
      });
      expect(screen.getByText("Transaksi gagal.")).toBeInTheDocument();
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
    });

    test("countdown tidak tampil untuk order mati", () => {
      renderWith(MATI_BACKEND, { isExpired: false });
      expect(screen.queryByText(/Pembayaran berakhir dalam/)).not.toBeInTheDocument();
    });
  });
});

describe("PAID + FAILED tidak boleh menjanjikan 'sedang diproses'", () => {
  const BAYAR_LALU_GAGAL = makeOrder({
    ...SUDAH_BAYAR,
    status: "FAILED",
    safeStatus: "REJECTED",
  });

  describe("positive", () => {
    test("uang tetap diakui diterima (jangan bikin user kira uangnya hangus)", () => {
      renderWith(BAYAR_LALU_GAGAL);
      expect(screen.getByText("Pembayaran diterima")).toBeInTheDocument();
      expect(screen.getByText(/Transaksi gagal/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("TIDAK bilang 'sedang diproses' tepat di atas banner gagal", () => {
      renderWith(BAYAR_LALU_GAGAL);
      expect(screen.queryByText(/sedang diproses/)).not.toBeInTheDocument();
    });

    test("tetap tanpa tagihan", () => {
      renderWith(BAYAR_LALU_GAGAL);
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
    });
  });
});

describe("HELD: uang sudah masuk tapi ditahan untuk ditinjau", () => {
  // paymentStatus HELD reachable lewat DurianPay (durianpay-notif.repository.ts) — nominal tak
  // cocok / telat / dobel. Populasi paling rawan transfer ulang, jadi tagihan wajib hilang.
  const DITAHAN = makeOrder({
    paymentStatus: "HELD",
    status: "HELD",
    paidAt: "2026-08-13T14:03:44Z",
  });

  describe("positive", () => {
    test("tampil 'Pembayaran sedang ditinjau' + larangan transfer ulang", () => {
      renderWith(DITAHAN);
      expect(screen.getByText("Pembayaran sedang ditinjau")).toBeInTheDocument();
      expect(screen.getByText(/Jangan transfer lagi/)).toBeInTheDocument();
    });

    test("detail pembayaran tetap bisa dirujuk", () => {
      renderWith(DITAHAN);
      expect(screen.getByText("Detail pembayaran")).toBeInTheDocument();
      expect(screen.getByText("8878 4716 9037 8849")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("TIDAK menampilkan tagihan / perintah transfer / countdown", () => {
      renderWith(DITAHAN);
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
      expect(screen.queryByText(/Transfer nominal/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Pembayaran berakhir dalam/)).not.toBeInTheDocument();
    });

    test("TIDAK mengaku 'Pembayaran diterima' — nominalnya justru belum cocok", () => {
      renderWith(DITAHAN);
      expect(screen.queryByText("Pembayaran diterima")).not.toBeInTheDocument();
    });
  });
});

describe("mode demo harus mengaku palsu", () => {
  describe("positive", () => {
    test("isDemoOverride → blok konfirmasi diberi label DEMO", () => {
      renderWith(SUDAH_BAYAR, { isDemoOverride: true });
      expect(screen.getByText(/DEMO — PEMBAYARAN TIDAK NYATA/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("pembayaran sungguhan tidak diberi label DEMO", () => {
      renderWith(SUDAH_BAYAR);
      expect(screen.queryByText(/DEMO/)).not.toBeInTheDocument();
    });
  });
});

describe("rincian biaya tidak salah melabeli", () => {
  describe("edge cases", () => {
    test("pgFeeIdr null → baris biaya layanan disembunyikan, sisanya BUKAN dilabeli 'Kode unik'", () => {
      renderWith(makeOrder({ pgFeeIdr: null, totalPayIdr: "166500" }));
      expect(screen.queryByText("Biaya layanan pembayaran")).not.toBeInTheDocument();
      expect(screen.queryByText("Kode unik")).not.toBeInTheDocument();
      expect(screen.getByText("Penyesuaian")).toBeInTheDocument();
    });

    test("sisa negatif → label netral, bukan 'Kode unik' yang mustahil negatif", () => {
      renderWith(makeOrder({ totalPayIdr: "166000", pgFeeIdr: "4000" }));
      expect(screen.queryByText("Kode unik")).not.toBeInTheDocument();
      expect(screen.getByText("Penyesuaian")).toBeInTheDocument();
    });
  });
});
