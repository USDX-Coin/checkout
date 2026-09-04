import { describe, test, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MintOrderDetail } from "@/types";

// Tugas 6 (catatan/TUGAS-6-PERBAIKI-CHECKOUT.md) — dua janji yang menyangkut uang user:
//  1. Banner "Mode simulasi: pembayaran tidak diproses ke bank sungguhan" HANYA saat backend
//     menyatakan paymentMode === "SIMULATION". Field absen/tak dikenal → JANGAN tampil.
//  2. Order PAID (belum COMPLETED) tidak boleh lagi menampilkan tagihan — nomor VA + "Jumlah
//     yang harus dibayar" pada user yang sudah transfer = risiko bayar dua kali.

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ orderId: "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012" }),
  useRouter: () => ({ back: mockBack, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/auth/redirect", () => ({ returnToApp: () => mockReturnToApp() }));
const mockReturnToApp = vi.fn(() => true);

const mockUseCheckout = vi.fn();
vi.mock("@/hooks/useCheckout", () => ({ useCheckout: (id: string) => mockUseCheckout(id) }));

import { CheckoutContent } from "@/components/checkout/CheckoutContent";

function makeOrder(o: Partial<MintOrderDetail> = {}): MintOrderDetail {
  return {
    id: "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012",
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

const mockRetry = vi.fn();

function renderWith(order: MintOrderDetail | null, over: Record<string, unknown> = {}) {
  mockUseCheckout.mockReturnValue({
    order,
    isLoading: false,
    isError: false,
    errorKind: "unavailable",
    isUnauthorized: false,
    retry: mockRetry,
    isRetrying: false,
    pay: vi.fn(),
    isPaying: false,
    payError: null,
    secondsLeft: 900,
    isExpired: false,
    isTerminal: false,
    deadlineExtended: false,
    ...over,
  });
  return render(<CheckoutContent />);
}

const BANNER = /Mode simulasi: pembayaran tidak diproses ke bank sungguhan/;
// "Tagihan" = blok instruksi yang MENYURUH transfer nominal persis. Penandanya peringatan
// underpaid/overpaid di bawah nominalnya — bukan lagi label angkanya: sejak temuan D5 label itu
// diseragamkan jadi "Total bayar" dan dipakai bersama oleh ringkasan, rincian biaya, dan blok
// instruksi, jadi label bukan lagi pembeda antara "menagih" dan "melaporkan".
const TAGIHAN = /Kurang atau lebih akan ditandai/;
// Countdown kini bernama sesuai tenggat yang dihitungnya (temuan F2): batas memilih metode
// sebelum /pay, batas berlakunya VA/QRIS sesudahnya.
const COUNTDOWN = /Batas (bayar|memilih)/;

beforeEach(() => {
  mockUseCheckout.mockReset();
  mockBack.mockReset();
  mockRetry.mockReset();
  mockReturnToApp.mockReset();
  mockReturnToApp.mockReturnValue(true);
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
      expect(screen.getByText(COUNTDOWN)).toBeInTheDocument();
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
    test("TIDAK ada lagi tagihan maupun perintah transfer persis", () => {
      renderWith(SUDAH_BAYAR);
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
      expect(screen.queryByText(/Transfer nominal/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Cara pembayaran/)).not.toBeInTheDocument();
    });

    test("countdown tidak tampil setelah lunas", () => {
      renderWith(SUDAH_BAYAR);
      expect(screen.queryByText(COUNTDOWN)).not.toBeInTheDocument();
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
      expect(screen.getAllByText("Total bayar").length).toBeGreaterThan(0);
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
      expect(screen.queryByText("Total bayar")).not.toBeInTheDocument();
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
      expect(screen.queryByText(COUNTDOWN)).not.toBeInTheDocument();
    });
  });
});

// ── Temuan audit B4 · layar paling berbahaya ────────────────────────────────────────────────
// Sebelum perbaikan ini, PAID + FAILED memakai layar yang SAMA dengan pesanan sehat: blok hijau,
// judul "Pembayaran diterima", ikon centang — hanya satu kalimat kecil di bawahnya yang berbeda.
// Judul dan warna yang dibaca orang, bukan kalimat keempat. Ekspektasi tes lama ("tetap tampil
// 'Pembayaran diterima'") memang harus berubah: itulah bug-nya, bukan jaminannya.
describe("PAID + FAILED punya layarnya sendiri, bukan layar pesanan sehat (B4)", () => {
  const BAYAR_LALU_GAGAL = makeOrder({
    ...SUDAH_BAYAR,
    status: "FAILED",
    safeStatus: "REJECTED",
  });

  describe("positive", () => {
    test("judul menyebut yang gagal, dan uangnya tetap diakui diterima", () => {
      renderWith(BAYAR_LALU_GAGAL);
      expect(screen.getByText("Pengiriman USDX gagal")).toBeInTheDocument();
      expect(screen.getByText("Rp 166.500 sudah diterima")).toBeInTheDocument();
      expect(screen.getByText(/tercatat di pesanan ini/)).toBeInTheDocument();
    });

    test("melarang transfer ulang secara eksplisit", () => {
      renderWith(BAYAR_LALU_GAGAL);
      expect(screen.getByText("Jangan transfer lagi.")).toBeInTheDocument();
    });

    test("nomor pesanan tersedia sebagai rujukan yang bisa disalin", () => {
      renderWith(BAYAR_LALU_GAGAL);
      // Dua tempat: blok rujukan di layar, dan accordion "Detail pembayaran".
      expect(screen.getAllByText("Nomor pesanan").length).toBeGreaterThan(0);
      expect(screen.getByLabelText("Salin nomor pesanan")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Salin nomor pesanan"));
    });
  });

  describe("negative", () => {
    test("TIDAK memakai judul & nada pesanan sehat", () => {
      renderWith(BAYAR_LALU_GAGAL);
      expect(screen.queryByText("Pembayaran diterima")).not.toBeInTheDocument();
      expect(screen.queryByText(/sedang diproses/)).not.toBeInTheDocument();
    });

    // Keputusan sadar (lihat catatan di `@/lib/checkout/copy`): desain Figma `50` blok C
    // menggambar tombol "Hubungi dukungan", tapi salurannya belum ada di kode.
    test("TIDAK menjanjikan saluran dukungan yang belum ada", () => {
      renderWith(BAYAR_LALU_GAGAL);
      expect(screen.queryByText(/[Hh]ubungi dukungan/)).not.toBeInTheDocument();
    });

    test("tetap tanpa tagihan", () => {
      renderWith(BAYAR_LALU_GAGAL);
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
    });
  });

  // KOREKSI. Tes ini dulu berbunyi "HELD + FAILED tetap ke layar sedang ditinjau", dengan alasan
  // "nominalnya tidak pernah cocok". Alasan itu SALAH menurut SoT, dan tesnya mengunci bug:
  // `sot/conventions.md § Status Enums` ("Ops resolve HELD → reject (FAILED)") dan
  // `sot/bni-integration.md §6` menyatakan ops yang MENOLAK menulis `status=FAILED` sementara
  // `payment_status` TETAP `HELD` — reviewnya sudah SELESAI, hasilnya tolak, dan refund IDR-nya
  // manual. Layar "Tim kami sedang memeriksanya" untuk keadaan itu salah waktu dan salah nasib.
  describe("HELD + FAILED · ops menolak kredit, refund manual", () => {
    const DITOLAK_OPS = makeOrder({
      ...SUDAH_BAYAR,
      paymentStatus: "HELD",
      status: "FAILED",
      safeStatus: "NONE",
    });

    describe("positive", () => {
      test("layar gagal, dan pengembalian dana dikatakan apa adanya: manual, tidak instan", () => {
        renderWith(DITOLAK_OPS);
        expect(screen.getByText("Pesanan gagal, dana dikembalikan")).toBeInTheDocument();
        expect(screen.getByText(/diproses manual oleh tim kami, bukan otomatis/)).toBeInTheDocument();
        expect(screen.getByText("Jangan transfer lagi.")).toBeInTheDocument();
      });

      test("tracker menandai langkah PEMBAYARAN yang gagal — bukan langkah on-chain", () => {
        renderWith(DITOLAK_OPS);
        expect(screen.getByText("Pembayaran").className).toContain("text-destructive-text");
        expect(screen.getByText(/Pembayaran ditolak saat ditinjau/)).toBeInTheDocument();
      });

      test("nomor pesanan tersedia sebagai rujukan untuk menagih refund", () => {
        renderWith(DITOLAK_OPS);
        expect(screen.getByLabelText("Salin nomor pesanan")).toBeInTheDocument();
      });
    });

    describe("negative", () => {
      test("TIDAK lagi bilang sedang ditinjau — reviewnya sudah selesai dan hasilnya tolak", () => {
        renderWith(DITOLAK_OPS);
        expect(screen.queryByText("Pembayaran sedang ditinjau")).not.toBeInTheDocument();
        expect(screen.queryByText(/sedang memeriksanya/)).not.toBeInTheDocument();
      });

      test("TIDAK mengklaim nominal diterima — jumlah yang masuk memang tak dikirim ke FE", () => {
        renderWith(DITOLAK_OPS);
        expect(screen.queryByText(/sudah diterima/)).not.toBeInTheDocument();
      });
    });

    describe("edge cases", () => {
      test("HELD MURNI (belum diputus ops) tetap layar tinjau — dan berbeda dari yang ditolak", () => {
        renderWith(makeOrder({ ...SUDAH_BAYAR, paymentStatus: "HELD", status: "HELD" }));
        expect(screen.getByText("Pembayaran sedang ditinjau")).toBeInTheDocument();
        expect(screen.queryByText("Pesanan gagal, dana dikembalikan")).not.toBeInTheDocument();
      });

      test("PAID + FAILED tetap memakai kalimatnya sendiri, bukan kalimat refund", () => {
        renderWith(BAYAR_LALU_GAGAL);
        expect(screen.getByText("Pengiriman USDX gagal")).toBeInTheDocument();
        expect(screen.queryByText(/dikembalikan manual/)).not.toBeInTheDocument();
      });
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
      expect(screen.queryByText(COUNTDOWN)).not.toBeInTheDocument();
    });

    test("TIDAK mengaku 'Pembayaran diterima' — nominalnya justru belum cocok", () => {
      renderWith(DITAHAN);
      expect(screen.queryByText("Pembayaran diterima")).not.toBeInTheDocument();
    });
  });
});

// Mode demo dihapus total: dulu ia memaksa "Pembayaran diterima" 4 detik setelah user pilih bank,
// tanpa satu rupiah pun berpindah, dan nyala di dev & staging — persis tempat UAT DurianPay
// sandbox dijalankan. Sekarang PAID hanya datang dari backend.
describe("tidak ada lagi jalan memalsukan pembayaran", () => {
  describe("negative", () => {
    test("layar sudah-bayar tak pernah menampilkan penanda demo", () => {
      renderWith(SUDAH_BAYAR);
      // Sempit ke teks penandanya — `customerName` fixture kebetulan "Demo".
      expect(screen.queryByText(/PEMBAYARAN TIDAK NYATA/)).not.toBeInTheDocument();
      expect(screen.queryByText(/simulasi/i)).not.toBeInTheDocument();
    });

    test("order yang backend bilang BELUM dibayar tetap menampilkan tagihan, bukan konfirmasi", () => {
      renderWith(BELUM_BAYAR);
      expect(screen.getByText(TAGIHAN)).toBeInTheDocument();
      expect(screen.queryByText("Pembayaran diterima")).not.toBeInTheDocument();
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

// Setelah bayar, on-chain menunggu multisig dan bisa berjam-jam. Layarnya bilang "halaman ini
// boleh ditutup" — tanpa tombol pulang, user disuruh pergi tanpa diberi jalan.
describe("jalan pulang ke app setelah uang masuk", () => {
  describe("positive", () => {
    test("layar sudah-bayar punya tombol 'Kembali ke app' yang berfungsi", () => {
      renderWith(SUDAH_BAYAR);
      fireEvent.click(screen.getByRole("button", { name: "Kembali ke app" }));
      // Keluarnya lewat navigasi penuh, bukan router.back() — lihat blok "keluar dari checkout".
      expect(mockReturnToApp).toHaveBeenCalledTimes(1);
    });

    test("layar ditinjau (HELD) juga punya jalan pulang", () => {
      renderWith(makeOrder({ paymentStatus: "HELD", status: "HELD", paidAt: "2026-08-13T14:03:44Z" }));
      fireEvent.click(screen.getByRole("button", { name: "Kembali ke app" }));
      expect(mockReturnToApp).toHaveBeenCalledTimes(1);
    });

    test("layar sukses tetap punya tombolnya (tak ada yang hilang)", () => {
      renderWith(SELESAI);
      expect(screen.getByRole("button", { name: "Kembali ke app" })).toBeInTheDocument();
    });
  });
});

// Metode bayar HANYA dari backend — ia yang tahu adapter aktif menerima apa. Dulu ada fallback
// statis 9 bank + QRIS di checkout; di bawah DurianPay SNAP itu menawarkan 7 pilihan yang pasti
// ditolak /pay.
describe("metode bayar datang dari backend, bukan daftar tebakan", () => {
  const VA_3_BANK = [
    { channel: "VA" as const, pgFeeIdr: "4000.00", banks: ["BNI", "MANDIRI", "BRI"] as const },
  ];

  function belumPilihMetode(channels: unknown) {
    return makeOrder({
      paymentStatus: "REQUESTED",
      paymentChannel: null,
      paymentBank: null,
      virtualAccountNo: null,
      pgFeeIdr: null,
      totalFeeIdr: null,
      totalPayIdr: null,
      channels: channels as never,
    });
  }

  describe("positive", () => {
    test("backend kirim VA 3 bank → yang tampil persis itu, QRIS tidak ada", () => {
      renderWith(belumPilihMetode(VA_3_BANK));
      expect(screen.getByText("Virtual Account")).toBeInTheDocument();
      expect(screen.queryByText("QRIS")).not.toBeInTheDocument();
    });

    test("backend kirim VA + QRIS (mock) → dua-duanya tampil", () => {
      renderWith(
        belumPilihMetode([
          { channel: "VA", pgFeeIdr: "4000.00", banks: ["BCA", "BNI"] },
          { channel: "QRIS", pgFeeIdr: "11480.00", banks: null },
        ]),
      );
      expect(screen.getByText("Virtual Account")).toBeInTheDocument();
      expect(screen.getByText("QRIS")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("channels kosong → suruh muat ulang, JANGAN tawarkan daftar tebakan", () => {
      renderWith(belumPilihMetode([]));
      expect(screen.getByText(/Metode pembayaran belum tersedia/)).toBeInTheDocument();
      expect(screen.queryByText("QRIS")).not.toBeInTheDocument();
      expect(screen.queryByText("Virtual Account")).not.toBeInTheDocument();
    });

    test("channels absen sama sekali (backend lama) → sama, tanpa daftar tebakan", () => {
      renderWith(belumPilihMetode(undefined));
      expect(screen.getByText(/Metode pembayaran belum tersedia/)).toBeInTheDocument();
      expect(screen.queryByText("Virtual Account")).not.toBeInTheDocument();
    });
  });
});

// Rekaman uji 21 Agu: setelah "Kembali ke app", tab app dipulihkan APA ADANYA — modal "Ringkasan
// Transaksi" masih terbuka lengkap dengan tombol "Lanjut Pembayaran", untuk pesanan yang uangnya
// SUDAH masuk. Penyebabnya `router.back()` (mundur di riwayat browser). Keluar dari checkout harus
// navigasi PENUH supaya app dimuat ulang dan modal lamanya hilang.
describe("keluar dari checkout memuat app dari awal, bukan mundur di riwayat", () => {
  const keluarDari = (order: MintOrderDetail, over: Record<string, unknown> = {}) => {
    renderWith(order, over);
    fireEvent.click(screen.getByRole("button", { name: /Kembali/ }));
  };

  describe("positive", () => {
    test("sudah bayar → navigasi penuh ke app, TIDAK memakai router.back()", () => {
      keluarDari(SUDAH_BAYAR);
      expect(mockReturnToApp).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();
    });

    test("selesai → sama", () => {
      keluarDari(SELESAI);
      expect(mockReturnToApp).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();
    });

    test("ditahan (HELD) → sama", () => {
      keluarDari(makeOrder({ paymentStatus: "HELD", status: "HELD" }));
      expect(mockReturnToApp).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();
    });

    test("kedaluwarsa → sama (modal 'Lanjut Pembayaran' juga tak boleh hidup lagi di sini)", () => {
      keluarDari(makeOrder({ paymentStatus: "EXPIRED", status: "FAILED" }), { isExpired: false });
      expect(mockReturnToApp).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();
    });
  });

  describe("negative", () => {
    test("NEXT_PUBLIC_APP_URL kosong (localhost) → fallback router.back(), tombol tetap berfungsi", () => {
      mockReturnToApp.mockReturnValue(false);
      keluarDari(SUDAH_BAYAR);
      expect(mockReturnToApp).toHaveBeenCalledTimes(1);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });
});

// ── Temuan audit B5 & B14 · gagal memuat pesanan ────────────────────────────────────────────
// Dulu 404, 500, jaringan mati, dan URL salah ketik sama-sama berbunyi "Pesanan tidak ditemukan
// atau sesi tidak valid", tanpa satu tombol pun. Untuk 500 kalimat itu menyuruh user menyerah
// atas pesanan yang mungkin ada — dan uangnya mungkin sudah bergerak.
describe("gagal memuat: sebabnya menentukan apa yang boleh dikatakan (B5, B14)", () => {
  describe("positive", () => {
    test("gangguan server/jaringan → 'Gagal memuat pesanan' + tombol Coba lagi yang benar-benar memuat ulang", () => {
      renderWith(null, { isError: true, errorKind: "unavailable" });
      expect(screen.getByText("Gagal memuat pesanan")).toBeInTheDocument();
      expect(screen.getByText(/tidak terpengaruh/)).toBeInTheDocument();
      fireEvent.click(screen.getByText("Coba lagi"));
      expect(mockRetry).toHaveBeenCalledTimes(1);
    });

    test("404 → 'Pesanan tidak ditemukan' + jalan ke Riwayat, TANPA tombol coba lagi", () => {
      renderWith(null, { isError: true, errorKind: "not-found" });
      expect(screen.getByText("Pesanan tidak ditemukan")).toBeInTheDocument();
      expect(screen.getByText("Buka Riwayat di app")).toBeInTheDocument();
      expect(screen.queryByText("Coba lagi")).not.toBeInTheDocument();
    });

    test("orderId ngawur → 'Nomor pesanan tidak valid', bukan pesan 'tidak ditemukan'", () => {
      renderWith(null, { isError: true, errorKind: "malformed-id" });
      expect(screen.getByText("Nomor pesanan tidak valid")).toBeInTheDocument();
      expect(screen.queryByText("Pesanan tidak ditemukan")).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("gangguan sementara TIDAK boleh mengaku pesanannya tidak ada", () => {
      renderWith(null, { isError: true, errorKind: "unavailable" });
      expect(screen.queryByText(/tidak ditemukan/)).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("sedang memuat ulang → tombolnya terkunci supaya tidak ditekan berkali-kali", () => {
      renderWith(null, { isError: true, errorKind: "unavailable", isRetrying: true });
      expect(screen.getByText("Memuat…").closest("button")).toBeDisabled();
    });
  });
});

// ── Temuan audit F1 · layar VA punya jalan pulang ──────────────────────────────────────────
describe("layar instruksi bayar punya jalan pulang (F1)", () => {
  describe("positive", () => {
    test("tombol kembali ke app + jaminan bahwa VA tidak hangus karena halaman ditutup", () => {
      renderWith(BELUM_BAYAR);
      const back = screen.getByText("Kembali ke app");
      expect(back).toBeInTheDocument();
      expect(screen.getByText(/VA tetap berlaku sampai waktu habis/)).toBeInTheDocument();
      fireEvent.click(back);
      expect(mockReturnToApp).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    test("QRIS → kalimatnya menyebut QR, bukan VA", () => {
      renderWith(makeOrder({ paymentChannel: "QRIS", paymentBank: null, virtualAccountNo: null }));
      expect(screen.getByText(/QR ini tetap berlaku/)).toBeInTheDocument();
    });
  });
});

// ── Temuan audit F2 · dua tenggat, dua nama ─────────────────────────────────────────────────
// Akarnya bukan pembulatan: `expiresAt` berganti ARTI setelah /pay (batas order → batas VA), di
// slot tampilan yang sama dan dengan label yang sama.
describe("countdown menyebut tenggat yang benar-benar dihitungnya (F2)", () => {
  describe("positive", () => {
    test("sebelum metode dipilih → 'Batas memilih metode'", () => {
      renderWith(
        makeOrder({
          paymentStatus: "REQUESTED",
          totalPayIdr: null,
          pgFeeIdr: null,
          channels: [{ channel: "VA", pgFeeIdr: "4000", banks: ["BCA"] }],
        }),
      );
      expect(screen.getByText(/Batas memilih metode/)).toBeInTheDocument();
    });

    test("sesudah VA terbit → 'Batas bayar Virtual Account'", () => {
      renderWith(BELUM_BAYAR);
      expect(screen.getByText(/Batas bayar Virtual Account/)).toBeInTheDocument();
    });

    test("tenggat memanjang di tab ini → lompatannya diakui, bukan dibiarkan bikin panik", () => {
      renderWith(BELUM_BAYAR, { deadlineExtended: true });
      expect(screen.getByText("Waktu bayar diperpanjang untuk VA ini.")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("tanpa perpanjangan yang tersaksikan → catatannya tidak muncul", () => {
      renderWith(BELUM_BAYAR);
      expect(screen.queryByText(/diperpanjang/)).not.toBeInTheDocument();
    });
  });
});

// ── Temuan validator no. 4 · status tak dikenal tidak boleh menagih ─────────────────────────
// Cabang terakhir dulu adalah instruksi bayar, jadi enum baru dari backend (atau kombinasi yang
// kontradiktif) mendarat di layar yang menyodorkan nomor VA, "Total bayar", dan countdown.
describe("keadaan tak dikenal jatuh ke fallback yang aman, bukan ke tagihan", () => {
  const TAK_DIKENAL = makeOrder({
    // Nilai di luar enum yang dikenal FE — persis bentuk yang dihasilkan backend yang lebih baru.
    paymentStatus: "SETTLING" as unknown as MintOrderDetail["paymentStatus"],
    status: "SETTLING" as unknown as MintOrderDetail["status"],
  });

  describe("positive", () => {
    test("mengaku tidak tahu, dan menyuruh berhenti transfer", () => {
      renderWith(TAK_DIKENAL);
      expect(screen.getByText("Status pesanan belum bisa ditampilkan")).toBeInTheDocument();
      expect(screen.getByText(/Jangan transfer apa pun dulu/)).toBeInTheDocument();
    });

    test("tetap memberi nomor rujukan dan jalan keluar", () => {
      renderWith(TAK_DIKENAL);
      expect(screen.getByLabelText("Salin nomor pesanan")).toBeInTheDocument();
      expect(screen.getByText("Buka Riwayat di app")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("TIDAK ada nomor VA, tagihan, maupun countdown", () => {
      renderWith(TAK_DIKENAL);
      expect(screen.queryByText("8878 4716 9037 8849")).not.toBeInTheDocument();
      expect(screen.queryByText(TAGIHAN)).not.toBeInTheDocument();
      expect(screen.queryByText(COUNTDOWN)).not.toBeInTheDocument();
      expect(screen.queryByText("Cara pembayaran")).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("EXPIRED + COMPLETED bukan 'Pesanan kedaluwarsa' — pesanannya justru sudah selesai", () => {
      renderWith(makeOrder({ paymentStatus: "EXPIRED", status: "COMPLETED", onChainTxHash: null }));
      expect(screen.queryByText("Pesanan kedaluwarsa.")).not.toBeInTheDocument();
      expect(screen.getByText("Status pesanan belum bisa ditampilkan")).toBeInTheDocument();
    });

    test("EXPIRED + COMPLETED + tx terbukti → layar sukses, bukan fallback", () => {
      renderWith(makeOrder({ paymentStatus: "EXPIRED", status: "COMPLETED", onChainTxHash: "0xd" }));
      expect(screen.getByText("Mint Berhasil")).toBeInTheDocument();
    });
  });
});
