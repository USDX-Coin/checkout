import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MintOrderDetail } from "@/types";
import type { PartnerCheckoutSession } from "@/lib/partner/types";
import { PROCESSOR_DISCLOSURE } from "@/lib/partner/copy";

// USDX-548 — pemeriksaan pada HALAMAN TER-RENDER, bukan pada sumbernya, dibandingkan dengan
// Figma `TXzbmT9lo27cse6IwqSuEP` (baris REDESAIN / NEUTRAL; baris "SEKARANG" adalah clone lama
// dan bukan acuan).
//
// ── KOREKSI PENTING TERHADAP VERSI PERTAMA BERKAS INI ────────────────────────────────────────
// Versi pertama melarang kata "USDX" muncul sama sekali di presentasi netral. Setelah desainnya
// benar-benar dibaca, itu SALAH: frame N01/N04/N05 menampilkan ticker aset ("60,606060 USDX"),
// penyebut kurs ("/ USDX"), dan satu baris pemroses di kaki N01. Yang netral hilangkan adalah
// KOIN dan LOCKUP USDX serta warna merek — bukan nama asetnya.
//
// Jadi aturannya bukan "nol kata USDX", melainkan DAFTAR IZIN yang tertutup: setiap kemunculan
// "USDX" pada halaman netral wajib cocok dengan salah satu bentuk yang memang dirancang. Sebuah
// kemunculan baru yang tak terduga — misalnya wordmark "USDX" bocor ke top bar, atau judul tab
// bawaan layout — tetap MERAH. Itu yang membuat tes ini masih bisa gagal.

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUsePartnerCheckout = vi.fn();
vi.mock("@/hooks/usePartnerCheckout", () => ({
  usePartnerCheckout: (session: PartnerCheckoutSession | null) => mockUsePartnerCheckout(session),
}));

import { PartnerCheckout } from "@/components/checkout/partner/PartnerCheckout";

// ── Data ─────────────────────────────────────────────────────────────────────────────────────

function makeOrder(o: Partial<MintOrderDetail> = {}): MintOrderDetail {
  return {
    id: "ord_1",
    orderNumber: "ORD-2026-0012",
    customerName: "Siti Rahmawati",
    type: "MINT",
    userAddress: "0x1f2e0000000000000000000000000000000093a4",
    chain: "polygon",
    inputCurrency: "IDR",
    amount: "60.606060",
    baseRate: "16000",
    spreadBuyPct: "2.5",
    effectiveRate: "16582.50",
    subtotalIdr: "1000000",
    mintFeePct: "0.5",
    mintFeeIdr: "5000",
    totalBeforePgFeeIdr: "1005000",
    paymentChannel: "VA",
    pgFeeIdr: "4000",
    totalFeeIdr: "9000",
    totalPayIdr: "1009000",
    paymentBank: "MANDIRI",
    paymentStatus: "WAITING_FOR_PAYMENT",
    safeStatus: "NONE",
    status: "WAITING_FOR_PAYMENT",
    paymentProvider: "DURIANPAY_SNAP",
    virtualAccountNo: "8801771234569921",
    paymentUrl: null,
    paymentRef: "ref-1",
    paidAt: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    safeTxHash: null,
    onChainTxHash: null,
    createdAt: "2026-08-27T09:14:02Z",
    updatedAt: "2026-08-27T09:14:02Z",
    ...o,
  };
}

const REQUESTED = makeOrder({
  paymentStatus: "REQUESTED",
  paymentBank: null,
  virtualAccountNo: null,
  paymentChannel: null,
  pgFeeIdr: null,
  totalPayIdr: null,
  channels: [
    { channel: "VA", pgFeeIdr: "4000", banks: ["MANDIRI", "BNI", "BRI", "BCA"] },
    { channel: "QRIS", pgFeeIdr: "2000", banks: null },
  ],
});

// `WAITING_FOR_APPROVAL` — keadaan TERLAMA. Uang masuk, sisanya multisig.
const MENUNGGU_PERSETUJUAN = makeOrder({
  paymentStatus: "PAID",
  status: "WAITING_FOR_APPROVAL",
  safeStatus: "PENDING_APPROVAL",
  safeTxHash: "0xsafe",
  paidAt: "2026-08-27T02:28:11Z", // 09:28 WIB
});

const NEUTRAL_BRANDING = {
  displayName: "PT Mitra Sejahtera",
  logoUrl: null,
  faviconUrl: "https://cdn.partner.co.id/fav.png",
  primaryColor: "#2a3556",
  accentColor: "#2563eb",
  supportEmail: "cs@partner.co.id",
  footerText: "Dilayani PT Mitra Sejahtera",
  allowedReturnOrigins: ["https://partner.co.id"],
};

function makeSession(o: Partial<PartnerCheckoutSession> = {}): PartnerCheckoutSession {
  return {
    orderId: "ord_1",
    model: "NEUTRAL",
    status: "OPENED",
    sessionToken: "psess-abc",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    returnUrl: "https://partner.co.id/pesanan/selesai",
    cancelUrl: "https://partner.co.id/pesanan/dibatalkan",
    branding: NEUTRAL_BRANDING,
    ...o,
  };
}

function renderPartner(session: PartnerCheckoutSession, state: Record<string, unknown> = {}) {
  mockUsePartnerCheckout.mockReturnValue({
    order: makeOrder(),
    isLoading: false,
    isError: false,
    isSessionInvalid: false,
    isDoneWaiting: false,
    isPollBudgetSpent: false,
    secondsLeft: 1427,
    pay: vi.fn(),
    isPaying: false,
    payError: null,
    refresh: vi.fn(),
    ...state,
  });
  return render(<PartnerCheckout session={session} />);
}

// ── Pemindai halaman ter-render ───────────────────────────────────────────────────────────────

/**
 * Semua string yang benar-benar terbaca, PER ELEMEN DAUN (bukan satu gumpalan). Per-elemen
 * penting: ia memisahkan "60,606060 USDX" (ticker yang memang dirancang) dari "USDX" berdiri
 * sendiri (wordmark yang bocor), dan gumpalan tidak bisa membedakan keduanya.
 */
function leafStrings(container: HTMLElement): string[] {
  const out: string[] = [document.title];
  for (const el of container.querySelectorAll<HTMLElement>("*")) {
    if (el.querySelector("*") === null) {
      const text = el.textContent?.trim();
      if (text) out.push(text);
    }
    for (const attr of ["href", "src", "alt", "aria-label", "title"]) {
      const value = el.getAttribute(attr);
      if (value) out.push(value);
    }
  }
  return out;
}

/** Bentuk kemunculan "USDX" yang MEMANG dirancang muncul di presentasi netral. */
const SANCTIONED_USDX_MENTIONS: RegExp[] = [
  /^[\d.,]+\s+USDX$/, // ticker aset di sebelah nominal — "60,606060 USDX"
  /^\/ USDX$/, // penyebut kurs — "Rp 16.582,50 / USDX"
  new RegExp(`^${PROCESSOR_DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), // baris pemroses
];

function unsanctionedUsdxMentions(container: HTMLElement): string[] {
  return leafStrings(container)
    .filter((s) => /usdx/i.test(s))
    .filter((s) => !SANCTIONED_USDX_MENTIONS.some((p) => p.test(s)));
}

/** Janji yang tidak boleh ada: kami TIDAK menghubungi customer partner (keputusan Wisnu). */
const FORBIDDEN_PROMISES: RegExp[] = [
  /kami akan (meng)?(kirim|hubungi|beri tahu)\s*(kamu|anda)?/i,
  /\bemail\b/i,
  /notifikasi dari kami/i,
  /cek email/i,
  /periksa email/i,
  /kami (akan )?(memberi tahu|beri tahu) kamu/i,
];

beforeEach(() => {
  mockUsePartnerCheckout.mockReset();
  document.title = "USDX Checkout"; // judul bawaan layout — harus ditimpa presentasi netral
  document.documentElement.className = "";
  window.history.replaceState(null, "", "/pay/ord_1");
});

afterEach(() => {
  document.documentElement.className = "";
});

// ── Model netral: tanpa koin & lockup USDX ────────────────────────────────────────────────────

describe("model netral — tanpa koin & lockup USDX, hanya penyebutan yang dirancang", () => {
  const states: { label: string; state: Record<string, unknown> }[] = [
    { label: "ringkasan pesanan", state: { order: REQUESTED } },
    { label: "instruksi VA", state: { order: makeOrder() } },
    { label: "menunggu persetujuan", state: { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true } },
    {
      label: "ditinjau (HELD)",
      state: { order: makeOrder({ paymentStatus: "HELD", status: "HELD" }), isDoneWaiting: true },
    },
    {
      label: "selesai",
      state: {
        order: makeOrder({
          paymentStatus: "PAID",
          status: "COMPLETED",
          onChainTxHash: "0x7c1e000000000000000000000000000000001a2b",
          paidAt: "2026-08-27T02:28:11Z",
        }),
        isDoneWaiting: true,
      },
    },
    { label: "gagal", state: { order: makeOrder({ status: "FAILED" }) } },
    {
      label: "kedaluwarsa",
      state: { order: makeOrder({ paymentStatus: "EXPIRED" }), secondsLeft: 0 },
    },
    { label: "tautan tidak berlaku", state: { isSessionInvalid: true } },
    { label: "memuat", state: { isLoading: true, order: null } },
    { label: "gagal muat", state: { isError: true, order: null } },
  ];

  describe("positive", () => {
    test.each(states)("$label → nol penyebutan USDX di luar daftar izin", ({ state }) => {
      const { container } = renderPartner(makeSession({ model: "NEUTRAL" }), state);
      expect(unsanctionedUsdxMentions(container)).toEqual([]);
    });

    test.each(states)("$label → nol tautan ke domain kami", ({ state }) => {
      const { container } = renderPartner(makeSession({ model: "NEUTRAL" }), state);
      const hrefs = [...container.querySelectorAll("[href]")].map((a) => a.getAttribute("href"));
      expect(hrefs.filter((h) => h?.includes("usdx"))).toEqual([]);
    });

    test("judul tab ikut netral — judul layout ('USDX Checkout') ditimpa", () => {
      renderPartner(makeSession({ model: "NEUTRAL" }));
      expect(document.title).toBe("Pembayaran — PT Mitra Sejahtera");
    });

    test("identitas di top bar adalah PARTNER: penanda inisial, bukan penanda kami", () => {
      renderPartner(makeSession({ model: "NEUTRAL" }), { order: REQUESTED });
      // "PT" adalah bentuk badan usaha, bukan nama → inisialnya "MS", persis seperti desain.
      expect(screen.getByText("MS")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pembayaran");
      expect(screen.getAllByText("PT Mitra Sejahtera").length).toBeGreaterThan(0);
    });

    test("logo partner dipakai kalau ada, menggantikan penanda inisial", () => {
      renderPartner(
        makeSession({
          model: "NEUTRAL",
          branding: { ...NEUTRAL_BRANDING, logoUrl: "https://cdn.partner.co.id/logo.svg" },
        }),
        { order: REQUESTED },
      );
      expect(screen.getByAltText("PT Mitra Sejahtera")).toHaveAttribute(
        "src",
        "https://cdn.partner.co.id/logo.svg",
      );
      expect(screen.queryByText("MS")).toBeNull();
    });
  });

  describe("negative", () => {
    // Kalau tes netral lolos untuk presentasi USDX juga, ia tidak membuktikan apa-apa.
    test("presentasi USDX MEMANG memasang wordmark + judul kami (pembanding)", () => {
      const { container } = renderPartner(makeSession({ model: "USDX" }), { order: REQUESTED });
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bayar dengan USDX");
      // Wordmark berdiri sendiri — persis bentuk yang TIDAK ada di daftar izin netral.
      expect(unsanctionedUsdxMentions(container)).toContain("USDX");
      expect(document.title).toBe("Pembayaran USDX");
    });

    test("presentasi USDX tidak memasang penanda inisial partner", () => {
      renderPartner(makeSession({ model: "USDX" }), { order: REQUESTED });
      expect(screen.queryByText("MS")).toBeNull();
    });

    test("model VA tidak merender halaman pembayaran sama sekali", () => {
      const { container } = renderPartner(makeSession({ model: "VA" }));
      expect(container.textContent).toContain("Tautan pembayaran ini tidak berlaku");
      expect(container.textContent).not.toContain("No. Virtual Account");
    });

    test("daftar izin memang tertutup — wordmark yang bocor akan tertangkap", () => {
      // Bukti bahwa pemindainya bekerja: string wordmark polos tidak cocok satu pun pola izin.
      expect(SANCTIONED_USDX_MENTIONS.some((p) => p.test("USDX"))).toBe(false);
      expect(SANCTIONED_USDX_MENTIONS.some((p) => p.test("USDX Checkout"))).toBe(false);
      expect(SANCTIONED_USDX_MENTIONS.some((p) => p.test("Bayar dengan USDX"))).toBe(false);
      // Dan bahwa bentuk yang dirancang memang lolos.
      expect(SANCTIONED_USDX_MENTIONS.some((p) => p.test("60,606060 USDX"))).toBe(true);
      expect(SANCTIONED_USDX_MENTIONS.some((p) => p.test("/ USDX"))).toBe(true);
      expect(SANCTIONED_USDX_MENTIONS.some((p) => p.test(PROCESSOR_DISCLOSURE))).toBe(true);
    });
  });

  describe("edge case", () => {
    test("tanpa branding, top bar tidak jatuh ke identitas kami", () => {
      const { container } = renderPartner(makeSession({ model: "NEUTRAL", branding: null }), {
        order: REQUESTED,
      });
      expect(unsanctionedUsdxMentions(container)).toEqual([]);
      expect(document.title).toBe("Pembayaran");
    });

    test("nama partner yang MEMUAT 'USDX' tetap tertangkap — batasnya jujur", () => {
      const { container } = renderPartner(
        makeSession({
          model: "NEUTRAL",
          branding: { ...NEUTRAL_BRANDING, displayName: "Toko USDX Palsu" },
        }),
        { order: REQUESTED },
      );
      // Kalau branding partner sendiri menyebut kami, itu keputusan partner — tapi tes tidak
      // berpura-pura tidak melihatnya.
      expect(unsanctionedUsdxMentions(container).length).toBeGreaterThan(0);
    });
  });
});

// ── P01/N01 · Ringkasan pesanan ──────────────────────────────────────────────────────────────

describe("ringkasan pesanan (P01/N01)", () => {
  describe("positive", () => {
    test("kurs terkunci, rincian biaya, dan total tampil seperti desain", () => {
      renderPartner(makeSession(), { order: REQUESTED });

      expect(screen.getByText("Kurs terkunci")).toBeInTheDocument();
      expect(screen.getByText("Rp 16.582,50")).toBeInTheDocument();
      expect(screen.getByText("/ USDX")).toBeInTheDocument();

      expect(screen.getByText("ORD-2026-0012")).toBeInTheDocument();
      expect(screen.getByText("60,606060 USDX")).toBeInTheDocument();
      expect(screen.getByText("Rp 1.000.000")).toBeInTheDocument(); // Subtotal
      expect(screen.getByText("Rp 5.000")).toBeInTheDocument(); // Biaya mint
      expect(screen.getByText("Rp 4.000")).toBeInTheDocument(); // Biaya virtual account
      expect(screen.getByText("Rp 1.009.000")).toBeInTheDocument(); // Total bayar
    });

    test("wallet tujuan + peringatan tak-bisa-dibatalkan tampil", () => {
      renderPartner(makeSession(), { order: REQUESTED });
      expect(screen.getByText("Wallet customer")).toBeInTheDocument();
      expect(screen.getByText("0x1f2e…93a4 · Polygon")).toBeInTheDocument();
      expect(
        screen.getByText("Transaksi on-chain tidak bisa dibatalkan. Pastikan alamat tujuan benar."),
      ).toBeInTheDocument();
    });

    test("baris pemroses tampil di kaki ringkasan", () => {
      renderPartner(makeSession(), { order: REQUESTED });
      expect(screen.getByText(PROCESSOR_DISCLOSURE)).toBeInTheDocument();
    });

    test("'Lanjut ke pembayaran' membawa ke pemilihan bank", () => {
      renderPartner(makeSession(), { order: REQUESTED });
      fireEvent.click(screen.getByRole("button", { name: "Lanjut ke pembayaran" }));
      expect(screen.getByText("Pilih bank untuk virtual account")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("total TIDAK ditampilkan kalau biaya VA belum diketahui — jangan karang angka", () => {
      renderPartner(makeSession(), {
        order: makeOrder({
          paymentStatus: "REQUESTED",
          totalPayIdr: null,
          pgFeeIdr: null,
          channels: [{ channel: "VA", pgFeeIdr: "", banks: ["BNI"] }],
        }),
      });
      expect(screen.queryByText("Total bayar")).toBeNull();
      expect(screen.queryByText("Biaya virtual account")).toBeNull();
    });

    test("baris pemroses TIDAK ikut ke layar instruksi bayar", () => {
      renderPartner(makeSession(), { order: makeOrder() });
      expect(screen.queryByText(PROCESSOR_DISCLOSURE)).toBeNull();
    });
  });

  describe("edge case", () => {
    test("kurs tak terbaca → kartu kurs disembunyikan, sisanya tetap tampil", () => {
      renderPartner(makeSession(), {
        order: makeOrder({ paymentStatus: "REQUESTED", effectiveRate: "bukan-angka" }),
      });
      expect(screen.queryByText("Kurs terkunci")).toBeNull();
      expect(screen.getByText("ORD-2026-0012")).toBeInTheDocument();
    });

    test("panah kembali di layar bank mengembalikan ke ringkasan", () => {
      renderPartner(makeSession(), { order: REQUESTED });
      fireEvent.click(screen.getByRole("button", { name: "Lanjut ke pembayaran" }));
      fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
      expect(screen.getByText("Kurs terkunci")).toBeInTheDocument();
    });
  });
});

// ── P04/N04 · WAITING_FOR_APPROVAL ────────────────────────────────────────────────────────────

describe("status WAITING_FOR_APPROVAL — jalan keluar ke aplikasi partner", () => {
  function renderApproval(session = makeSession()) {
    return renderPartner(session, { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true });
  }

  describe("positive", () => {
    test("konfirmasi pembayaran diterima + TOMBOL kembali ke return_url", () => {
      renderApproval();
      expect(screen.getByText("Pembayaran diterima. Transaksimu aman.")).toBeInTheDocument();
      const link = screen.getByTestId("partner-return-link");
      expect(link).toHaveAttribute("href", "https://partner.co.id/pesanan/selesai");
      expect(link).toHaveTextContent("Kembali ke PT Mitra Sejahtera");
    });

    test("stepper 3 langkah: pembayaran selesai, on-chain berjalan, selesai belum", () => {
      renderApproval();
      expect(screen.getByText("Langkah 2 dari 3 · menunggu persetujuan")).toBeInTheDocument();
      expect(screen.getByText("Proses on-chain")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Menunggu persetujuan internal sebelum token dikirim. Bisa memakan waktu beberapa jam.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Selesai")).toBeInTheDocument();
    });

    test("persentase kemajuan cocok dengan langkahnya (2 dari 3 = 67%)", () => {
      renderApproval();
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "67");
      expect(screen.getByText("67%")).toBeInTheDocument();
    });

    test("nominal & waktu bayar tampil sebagai bukti", () => {
      renderApproval();
      expect(screen.getByText("Rp 1.009.000 diterima 09:28")).toBeInTheDocument();
      expect(screen.getAllByText("60,606060 USDX").length).toBeGreaterThan(0);
    });

    test("catatan bawah: menunggu tak perlu, dan yang kami beri tahu adalah PARTNER", () => {
      renderApproval();
      expect(
        screen.getByText(
          "Kamu tidak perlu menunggu di halaman ini. Kami beri tahu partner-mu begitu token terkirim.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("TAGIHAN HILANG — tak ada nomor VA aktif / perintah transfer (cegah bayar dua kali)", () => {
      const { container } = renderApproval();
      expect(container.textContent).not.toContain("8801 7712 3456 9921");
      expect(container.textContent).not.toMatch(/Cara bayar/);
      expect(container.textContent).not.toMatch(/Selesaikan pembayaran dalam/);
      expect(screen.queryByText("Salin")).toBeNull();
    });

    test("tidak ada spinner yang menyuruh menunggu", () => {
      const { container } = renderApproval();
      expect(container.querySelector(".animate-spin")).toBeNull();
    });

    test("tidak menjanjikan email/notifikasi kepada CUSTOMER", () => {
      const { container } = renderApproval();
      const surface = leafStrings(container).join("\n");
      for (const pattern of FORBIDDEN_PROMISES) {
        expect(surface, `${pattern} tidak boleh dijanjikan`).not.toMatch(pattern);
      }
    });
  });

  describe("edge case", () => {
    test("PAID + FAILED → uangnya tetap diakui, tapi judulnya jujur soal kegagalan", () => {
      renderPartner(makeSession(), {
        order: makeOrder({
          paymentStatus: "PAID",
          status: "FAILED",
          paidAt: "2026-08-27T02:28:11Z",
        }),
      });
      expect(screen.getByText("Pesanan gagal")).toBeInTheDocument();
      expect(
        screen.getByText("Pembayaran sudah kami terima, tapi pengiriman token gagal."),
      ).toBeInTheDocument();
      expect(screen.getByTestId("partner-return-link")).toBeInTheDocument();
    });

    test("FAILED TANPA uang masuk tidak berkata pembayaran sudah diterima", () => {
      renderPartner(makeSession(), { order: makeOrder({ status: "FAILED" }) });
      expect(screen.getByText("Pesanan ini tidak bisa dilanjutkan.")).toBeInTheDocument();
      expect(screen.queryByText(/Pembayaran sudah kami terima/)).toBeNull();
    });

    test("HELD → 'sedang ditinjau' + larangan transfer ulang + jalan keluar", () => {
      renderPartner(makeSession(), {
        order: makeOrder({ paymentStatus: "HELD", status: "HELD" }),
        isDoneWaiting: true,
      });
      expect(screen.getByText("Pembayaran sedang ditinjau")).toBeInTheDocument();
      expect(screen.getByText(/Jangan transfer lagi/)).toBeInTheDocument();
      expect(screen.getByTestId("partner-return-link")).toBeInTheDocument();
    });
  });
});

// ── return_url: allowlist, bukan open redirect ────────────────────────────────────────────────

describe("validasi return_url pada halaman ter-render", () => {
  describe("positive", () => {
    test("return_url pada origin terdaftar → tombol dengan href itu", () => {
      renderPartner(makeSession(), { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true });
      expect(screen.getByTestId("partner-return-link")).toHaveAttribute(
        "href",
        "https://partner.co.id/pesanan/selesai",
      );
    });

    test("return_url tak lolos tapi cancel_url lolos → pakai cancel_url", () => {
      renderPartner(
        makeSession({
          returnUrl: "https://evil.com/x",
          cancelUrl: "https://partner.co.id/pesanan/dibatalkan",
        }),
        { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true },
      );
      expect(screen.getByTestId("partner-return-link")).toHaveAttribute(
        "href",
        "https://partner.co.id/pesanan/dibatalkan",
      );
    });
  });

  describe("negative", () => {
    const rejected = [
      { label: "origin lain", url: "https://evil.com/steal" },
      { label: "sufiks mirip", url: "https://evil-partner.co.id/x" },
      { label: "prefiks mirip", url: "https://partner.co.id.evil.com/x" },
      { label: "kredensial menyamarkan host", url: "https://partner.co.id@evil.com/x" },
      { label: "javascript:", url: "javascript:alert(1)" },
      { label: "relatif-protokol", url: "//evil.com" },
      { label: "http", url: "http://partner.co.id/x" },
    ];

    test.each(rejected)("$label → TIDAK ada tombol, URL itu tak muncul", ({ url }) => {
      const { container } = renderPartner(makeSession({ returnUrl: url, cancelUrl: null }), {
        order: MENUNGGU_PERSETUJUAN,
        isDoneWaiting: true,
      });
      expect(screen.queryByTestId("partner-return-link")).toBeNull();
      const hrefs = [...container.querySelectorAll("[href]")].map((a) => a.getAttribute("href"));
      expect(hrefs).not.toContain(url);
      expect(
        screen.getByText(/Tutup halaman ini dan kembali ke PT Mitra Sejahtera/),
      ).toBeInTheDocument();
    });
  });

  describe("edge case", () => {
    test("daftar terdaftar KOSONG → tak ada tombol walau URL terlihat wajar", () => {
      renderPartner(
        makeSession({ branding: { ...NEUTRAL_BRANDING, allowedReturnOrigins: [] } }),
        { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true },
      );
      expect(screen.queryByTestId("partner-return-link")).toBeNull();
    });

    test("branding null → tak ada tombol (tak ada daftar = tak ada tujuan)", () => {
      renderPartner(makeSession({ branding: null }), {
        order: MENUNGGU_PERSETUJUAN,
        isDoneWaiting: true,
      });
      expect(screen.queryByTestId("partner-return-link")).toBeNull();
    });
  });
});

// ── QRIS ──────────────────────────────────────────────────────────────────────────────────────

describe("QRIS tidak muncul sebagai pilihan di UI partner", () => {
  function renderBankStep() {
    const result = renderPartner(makeSession(), { order: REQUESTED });
    fireEvent.click(screen.getByRole("button", { name: "Lanjut ke pembayaran" }));
    return result;
  }

  describe("positive", () => {
    test("tiga bank yang didukung muncul sebagai tombol", () => {
      renderBankStep();
      for (const bank of ["MANDIRI", "BNI", "BRI"]) {
        expect(screen.getByRole("button", { name: bank })).toBeInTheDocument();
      }
    });
  });

  describe("negative", () => {
    test("QRIS TIDAK dirender walau backend menawarkannya", () => {
      const { container } = renderBankStep();
      expect(container.textContent).not.toMatch(/qris/i);
      expect(container.querySelector("canvas")).toBeNull();
    });

    test("bank di luar tiga yang didukung (BCA) tidak dirender", () => {
      renderBankStep();
      expect(screen.queryByRole("button", { name: "BCA" })).toBeNull();
    });

    test("backend hanya menawarkan QRIS → tak ada pilihan, bukan tombol yang pasti gagal", () => {
      const { container } = renderPartner(makeSession(), {
        order: makeOrder({
          paymentStatus: "REQUESTED",
          channels: [{ channel: "QRIS", pgFeeIdr: "2000", banks: null }],
        }),
      });
      fireEvent.click(screen.getByRole("button", { name: "Lanjut ke pembayaran" }));
      expect(screen.getByText(/Metode pembayaran belum tersedia/)).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/qris/i);
    });
  });

  describe("edge case", () => {
    test("layar instruksi bayar tidak menyebut QRIS", () => {
      const { container } = renderPartner(makeSession(), { order: makeOrder() });
      expect(container.textContent).not.toMatch(/qris/i);
    });
  });
});

// ── Model dari branding, bukan query string ───────────────────────────────────────────────────

describe("model checkout datang dari partner_branding, bukan dari query string", () => {
  describe("positive", () => {
    test("sesi NEUTRAL tetap netral walau URL berkata ?theme=USDX", () => {
      window.history.replaceState(null, "", "/pay/ord_1?theme=USDX");
      const { container } = renderPartner(makeSession({ model: "NEUTRAL" }), { order: REQUESTED });
      expect(unsanctionedUsdxMentions(container)).toEqual([]);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pembayaran");
    });

    test("sesi USDX tetap ber-brand walau URL berkata ?theme=NEUTRAL", () => {
      window.history.replaceState(null, "", "/pay/ord_1?theme=NEUTRAL");
      renderPartner(makeSession({ model: "USDX" }), { order: REQUESTED });
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bayar dengan USDX");
    });
  });

  describe("negative", () => {
    test("query string tidak bisa memaksa halaman jadi ada untuk model VA", () => {
      window.history.replaceState(null, "", "/pay/ord_1?theme=NEUTRAL");
      const { container } = renderPartner(makeSession({ model: "VA" }));
      expect(container.textContent).toContain("Tautan pembayaran ini tidak berlaku");
    });
  });

  describe("edge case", () => {
    test("warna pun tidak diambil dari URL", () => {
      window.history.replaceState(null, "", "/pay/ord_1?primaryColor=%23800000");
      const { container } = renderPartner(makeSession({ model: "NEUTRAL" }), { order: REQUESTED });
      expect(container.innerHTML).not.toContain("#800000");
    });
  });
});

// ── Light + Dark ──────────────────────────────────────────────────────────────────────────────

describe("Light + Dark dua-duanya benar", () => {
  const themes = ["light", "dark"] as const;

  describe("positive", () => {
    test.each(themes)("%s → permukaan & teks memakai token tema", (theme) => {
      document.documentElement.className = theme === "dark" ? "dark" : "";
      const { container } = renderPartner(makeSession(), { order: makeOrder() });
      expect(container.querySelector(".bg-background")).not.toBeNull();
      expect(container.querySelector(".text-foreground")).not.toBeNull();
    });

    test.each(themes)("%s → tombol brand punya tepi dari token tema", (theme) => {
      document.documentElement.className = theme === "dark" ? "dark" : "";
      renderPartner(makeSession(), { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true });
      expect(screen.getByTestId("partner-return-link").className).toContain(
        "border-foreground/15",
      );
    });

    test("aksen teks dipasang sebagai SEPASANG nilai per tema, bukan satu warna", () => {
      const { container } = renderPartner(makeSession(), { order: makeOrder() });
      const scope = container.querySelector<HTMLElement>(".partner-scope")!;
      const style = scope.getAttribute("style") ?? "";
      expect(style).toContain("--partner-accent-on-light");
      expect(style).toContain("--partner-accent-on-dark");
      // Dua tema, dua nilai — kalau sama, salah satunya pasti gagal kontras.
      const onLight = /--partner-accent-on-light:\s*([^;]+)/.exec(style)?.[1]?.trim();
      const onDark = /--partner-accent-on-dark:\s*([^;]+)/.exec(style)?.[1]?.trim();
      expect(onLight).toBeTruthy();
      expect(onDark).toBeTruthy();
      expect(onLight).not.toBe(onDark);
    });
  });

  describe("negative", () => {
    test("tidak ada teks yang dipatok putih/hitam di luar permukaan brand & tile bank", () => {
      const { container } = renderPartner(makeSession(), { order: makeOrder() });
      expect(container.querySelector(".text-white")).toBeNull();
      expect(container.querySelector(".text-black")).toBeNull();
    });

    test("warna teks tombol brand DIHITUNG, bukan dipatok putih", () => {
      renderPartner(
        // Kuning terang: teks putih di atasnya gagal AA.
        makeSession({ branding: { ...NEUTRAL_BRANDING, primaryColor: "#f7e600" } }),
        { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true },
      );
      expect(screen.getByTestId("partner-return-link").getAttribute("style")).toContain(
        "var(--partner-brand-text)",
      );
    });
  });

  describe("edge case", () => {
    test.each(themes)("%s → tanpa branding halaman tetap terbaca (fallback netral)", (theme) => {
      document.documentElement.className = theme === "dark" ? "dark" : "";
      const { container } = renderPartner(makeSession({ branding: null }), { order: makeOrder() });
      expect(container.querySelector(".bg-background")).not.toBeNull();
      expect(screen.getByText("No. Virtual Account")).toBeInTheDocument();
    });
  });
});

// ── Batas polling ─────────────────────────────────────────────────────────────────────────────

describe("halaman tidak menahan customer dengan polling tanpa batas", () => {
  describe("positive", () => {
    test("anggaran polling habis → tombol Perbarui status muncul", () => {
      renderPartner(makeSession(), { order: makeOrder(), isPollBudgetSpent: true });
      expect(screen.getByRole("button", { name: "Perbarui status" })).toBeInTheDocument();
      expect(screen.getByText(/Halaman berhenti memeriksa otomatis/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("selama masih dalam anggaran, tombol itu TIDAK ada dan janji self-update tetap benar", () => {
      renderPartner(makeSession(), { order: makeOrder(), isPollBudgetSpent: false });
      expect(screen.queryByRole("button", { name: "Perbarui status" })).toBeNull();
      expect(screen.getByText(/Halaman ini memperbarui sendiri/)).toBeInTheDocument();
    });

    test("anggaran habis → janji 'memperbarui sendiri' DICABUT, bukan dibiarkan berbohong", () => {
      renderPartner(makeSession(), { order: makeOrder(), isPollBudgetSpent: true });
      expect(screen.queryByText(/Halaman ini memperbarui sendiri/)).toBeNull();
    });
  });

  describe("edge case", () => {
    test("setelah uang masuk, tak ada tombol perbarui — tak ada lagi yang ditunggu", () => {
      renderPartner(makeSession(), {
        order: MENUNGGU_PERSETUJUAN,
        isDoneWaiting: true,
        isPollBudgetSpent: true,
      });
      expect(screen.queryByRole("button", { name: "Perbarui status" })).toBeNull();
    });
  });
});

// ── Instruksi bayar (P03/N03) ─────────────────────────────────────────────────────────────────

describe("instruksi bayar VA (P03/N03)", () => {
  describe("positive", () => {
    test("nomor VA & total punya tombol Salin berlabel teks", () => {
      renderPartner(makeSession(), { order: makeOrder() });
      expect(screen.getByText("8801 7712 3456 9921")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /Salin/ })).toHaveLength(2);
    });

    test("cara bayar menyebut bank yang benar-benar dipilih", () => {
      renderPartner(makeSession(), { order: makeOrder({ paymentBank: "BNI" }) });
      expect(screen.getByText("1. Buka aplikasi BNI atau internet banking")).toBeInTheDocument();
    });

    test("hitungan mundur bergaya desain (mm : ss)", () => {
      renderPartner(makeSession(), { order: makeOrder(), secondsLeft: 1427 });
      expect(screen.getByText("23 : 47")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("tanpa bank diketahui, langkah 1 tidak menyebut bank yang salah", () => {
      renderPartner(makeSession(), { order: makeOrder({ paymentBank: null }) });
      expect(
        screen.getByText("1. Buka aplikasi bank kamu atau internet banking"),
      ).toBeInTheDocument();
    });

    test("tidak ada tombol utama di layar ini (yang harus dilakukan ada di aplikasi bank)", () => {
      renderPartner(makeSession(), { order: makeOrder() });
      expect(screen.queryByRole("button", { name: "Bayar sekarang" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Lanjut ke pembayaran" })).toBeNull();
    });
  });

  describe("edge case", () => {
    test("nomor VA kosong → em dash, tombol salin mati", () => {
      renderPartner(makeSession(), { order: makeOrder({ virtualAccountNo: null }) });
      expect(screen.getByText("—")).toBeInTheDocument();
      const [salin] = screen.getAllByRole("button", { name: /Salin/ });
      expect(salin).toBeDisabled();
    });
  });
});
