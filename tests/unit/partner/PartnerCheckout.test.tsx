import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MintOrderDetail } from "@/types";
import type { PartnerCheckoutSession } from "@/lib/partner/types";

// USDX-548 — pemeriksaan pada HALAMAN TER-RENDER, bukan pada sumbernya. Yang dibuktikan:
//   * model netral: nol logo / nama / tautan USDX, nol istilah internal
//   * `WAITING_FOR_APPROVAL` menampilkan JALAN KELUAR, bukan penantian tanpa akhir
//   * `return_url` di luar daftar terdaftar → tidak ada tombol (bukan redirect terbuka)
//   * QRIS tidak muncul sebagai pilihan
//   * model datang dari branding, BUKAN dari query string
//   * Light & Dark dua-duanya
//   * halaman tidak menjanjikan email/notifikasi dari kami

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
    orderNumber: "USDX-1",
    customerName: "Siti Rahmawati",
    type: "MINT",
    userAddress: "0xabc0000000000000000000000000000000000def",
    chain: "polygon",
    inputCurrency: "IDR",
    amount: "60.606060",
    baseRate: "16000",
    spreadBuyPct: "2.5",
    effectiveRate: "16400",
    subtotalIdr: "1000000",
    mintFeePct: "1",
    mintFeeIdr: "5000",
    totalBeforePgFeeIdr: "1005000",
    paymentChannel: "VA",
    pgFeeIdr: "4000",
    totalFeeIdr: "9000",
    totalPayIdr: "1009000",
    paymentBank: "BNI",
    paymentStatus: "WAITING_FOR_PAYMENT",
    safeStatus: "NONE",
    status: "WAITING_FOR_PAYMENT",
    paymentProvider: "DURIANPAY_SNAP",
    virtualAccountNo: "9881234567890",
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

const NEUTRAL_BRANDING = {
  displayName: "Toko Partner",
  logoUrl: "https://cdn.partner.co.id/logo.svg",
  faviconUrl: "https://cdn.partner.co.id/fav.png",
  primaryColor: "#1d4ed8",
  accentColor: "#0ea5e9",
  supportEmail: "cs@partner.co.id",
  footerText: "Dilayani Toko Partner",
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

// `WAITING_FOR_APPROVAL` — keadaan TERLAMA. Uang sudah masuk, sisanya multisig.
const MENUNGGU_PERSETUJUAN = makeOrder({
  paymentStatus: "PAID",
  status: "WAITING_FOR_APPROVAL",
  safeStatus: "PENDING_APPROVAL",
  safeTxHash: "0xsafe",
  paidAt: "2026-08-27T09:28:11Z",
});

function renderPartner(
  session: PartnerCheckoutSession,
  state: Record<string, unknown> = {},
) {
  mockUsePartnerCheckout.mockReturnValue({
    order: makeOrder(),
    isLoading: false,
    isError: false,
    isSessionInvalid: false,
    isDoneWaiting: false,
    isPollBudgetSpent: false,
    secondsLeft: 900,
    pay: vi.fn(),
    isPaying: false,
    payError: null,
    refresh: vi.fn(),
    ...state,
  });
  return render(<PartnerCheckout session={session} />);
}

// ── Pemindai halaman ter-render ───────────────────────────────────────────────────────────────
// Mengumpulkan SELURUH yang bisa dibaca/dituju dari halaman yang sudah jadi: teks, judul tab,
// dan nilai atribut yang membawa identitas (href/src/alt/aria-label/title/placeholder/value).
// Memeriksa `container.textContent` saja akan melewatkan `<a href="https://usdx.co.id">` dan
// `<img alt="USDX">` — dua tempat paling mungkin merek bocor.
function renderedSurface(container: HTMLElement): string {
  const parts: string[] = [document.title, container.textContent ?? ""];
  const ATTRS = ["href", "src", "alt", "aria-label", "title", "placeholder", "value", "srcset"];
  for (const el of container.querySelectorAll("*")) {
    for (const attr of ATTRS) {
      const value = el.getAttribute(attr);
      if (value) parts.push(value);
    }
  }
  return parts.join("\n");
}

// Istilah yang HANYA hidup di dalam tim, plus merek kami. Pakai batas kata: "permintaan" memuat
// "mint" tanpa ada hubungannya, dan tes yang menandai itu akan dimatikan orang berikutnya.
const FORBIDDEN_IN_NEUTRAL: RegExp[] = [
  /usdx/i,
  /usdx\.co\.id/i,
  /\bmint(ing)?\b/i,
  /\bmultisig\b/i,
  /\bon-?chain\b/i,
  /\bsafe\b/i,
  /\bwallet\b/i,
  /\btoken\b/i,
  /\bblockchain\b/i,
  /\bpolygon\b/i,
  /\bpolygonscan\b/i,
  /\bcrypto\b/i,
  /\bkripto\b/i,
  /\bstablecoin\b/i,
  /\btx\b/i,
  /\bhash\b/i,
  /\bHELD\b/,
];

// Janji yang tidak boleh ada di halaman mana pun jalur ini: kami TIDAK menghubungi customer
// partner (keputusan Wisnu).
const FORBIDDEN_PROMISES: RegExp[] = [
  /kami akan (meng)?(kirim|hubungi|beri tahu)/i,
  /\bemail\b.*\bkami\b/i,
  /notifikasi dari kami/i,
  /cek email/i,
  /periksa email/i,
];

beforeEach(() => {
  mockUsePartnerCheckout.mockReset();
  document.title = "USDX Checkout"; // judul bawaan layout — harus DITIMPA presentasi netral
  document.documentElement.className = "";
  window.history.replaceState(null, "", "/pay/ord_1");
});

afterEach(() => {
  document.documentElement.className = "";
});

// ── Model netral: nol jejak USDX ──────────────────────────────────────────────────────────────

describe("model netral — nol logo/nama/tautan USDX di halaman ter-render", () => {
  const states: { label: string; state: Record<string, unknown> }[] = [
    { label: "belum bayar (instruksi VA)", state: { order: makeOrder() } },
    {
      label: "pilih bank",
      state: {
        order: makeOrder({
          paymentStatus: "REQUESTED",
          paymentBank: null,
          virtualAccountNo: null,
          channels: [
            { channel: "VA", pgFeeIdr: "4000", banks: ["BNI", "BRI", "MANDIRI"] },
            { channel: "QRIS", pgFeeIdr: "2000", banks: null },
          ],
        }),
      },
    },
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
          onChainTxHash: "0xdeadbeefcafe",
          paidAt: "2026-08-27T09:28:11Z",
        }),
        isDoneWaiting: true,
      },
    },
    { label: "gagal", state: { order: makeOrder({ status: "FAILED" }) } },
    { label: "kedaluwarsa", state: { order: makeOrder({ paymentStatus: "EXPIRED" }), secondsLeft: 0 } },
    { label: "tautan tidak berlaku", state: { isSessionInvalid: true } },
    { label: "memuat", state: { isLoading: true, order: null } },
    { label: "gagal memuat", state: { isError: true, order: null } },
    { label: "anggaran polling habis", state: { order: makeOrder(), isPollBudgetSpent: true } },
  ];

  describe("positive", () => {
    test.each(states)("$label → nol kemunculan istilah terlarang", ({ state }) => {
      const { container } = renderPartner(makeSession({ model: "NEUTRAL" }), state);
      const surface = renderedSurface(container);
      for (const pattern of FORBIDDEN_IN_NEUTRAL) {
        expect(surface, `${pattern} muncul di halaman netral`).not.toMatch(pattern);
      }
    });

    test("judul tab ikut netral — judul layout ('USDX Checkout') ditimpa", () => {
      renderPartner(makeSession({ model: "NEUTRAL" }));
      expect(document.title).toBe("Pembayaran — Toko Partner");
      expect(document.title).not.toMatch(/usdx/i);
    });

    test("identitas yang tampil adalah PARTNER: logo + nama + kaki halamannya", () => {
      renderPartner(makeSession({ model: "NEUTRAL" }));
      expect(screen.getByAltText("Toko Partner")).toHaveAttribute(
        "src",
        "https://cdn.partner.co.id/logo.svg",
      );
      expect(screen.getByText("Dilayani Toko Partner")).toBeInTheDocument();
      expect(screen.getByText("cs@partner.co.id")).toBeInTheDocument();
    });

    test("tidak ada satu pun tautan ke domain kami", () => {
      const { container } = renderPartner(makeSession({ model: "NEUTRAL" }));
      const hrefs = [...container.querySelectorAll("[href]")].map((a) => a.getAttribute("href"));
      expect(hrefs.some((h) => h?.includes("usdx"))).toBe(false);
    });

    test("tanpa branding pun tidak jatuh ke identitas kami — kepala & kaki dibiarkan kosong", () => {
      const { container } = renderPartner(makeSession({ model: "NEUTRAL", branding: null }));
      const surface = renderedSurface(container);
      expect(surface).not.toMatch(/usdx/i);
      expect(document.title).toBe("Pembayaran");
    });
  });

  describe("negative", () => {
    // Kalau tes netral di atas lolos untuk presentasi USDX juga, ia tidak membuktikan apa-apa.
    test("presentasi USDX MEMANG memuat nama + tautan kami (pembanding: tes netral bermakna)", () => {
      const { container } = renderPartner(makeSession({ model: "USDX" }));
      const surface = renderedSurface(container);
      expect(surface).toMatch(/usdx/i);
      expect(surface).toMatch(/usdx\.co\.id/i);
      expect(document.title).toBe("Pembayaran USDX");
    });

    test("model VA tidak merender halaman pembayaran sama sekali", () => {
      const { container } = renderPartner(makeSession({ model: "VA" }));
      expect(container.textContent).toContain("Tautan pembayaran ini tidak berlaku");
      expect(container.textContent).not.toContain("Nomor Virtual Account");
    });
  });

  describe("edge case", () => {
    test("nama partner yang MEMUAT 'USDX' tidak dipakai untuk mengakali tes — tetap ditolak", () => {
      // Kalau branding partner sendiri menyebut kami, itu keputusan partner. Yang diuji di sini:
      // sumber kebocoran bukan chrome kami. Tes ini mendokumentasikan batasnya secara jujur.
      const { container } = renderPartner(
        makeSession({
          model: "NEUTRAL",
          branding: { ...NEUTRAL_BRANDING, displayName: "Toko USDX Palsu" },
        }),
      );
      expect(renderedSurface(container)).toMatch(/usdx/i);
    });

    test("warna brand partner dipakai untuk tombol, bukan maroon kami", () => {
      renderPartner(makeSession({ model: "NEUTRAL" }), {
        order: MENUNGGU_PERSETUJUAN,
        isDoneWaiting: true,
      });
      const link = screen.getByTestId("partner-return-link");
      expect(link.getAttribute("style")).toContain("var(--partner-brand)");
    });
  });
});

// ── WAITING_FOR_APPROVAL: jalan keluar, bukan penantian ───────────────────────────────────────

describe("status WAITING_FOR_APPROVAL — jalan keluar ke aplikasi partner", () => {
  describe("positive", () => {
    test("konfirmasi pembayaran diterima + TOMBOL kembali ke return_url", () => {
      renderPartner(makeSession(), { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true });

      expect(screen.getByText("Pembayaran diterima")).toBeInTheDocument();
      const link = screen.getByTestId("partner-return-link");
      expect(link).toHaveAttribute("href", "https://partner.co.id/pesanan/selesai");
      expect(link).toHaveTextContent("Kembali ke Toko Partner");
    });

    test("kelanjutan dikabarkan oleh PARTNER — bukan oleh kami", () => {
      renderPartner(makeSession(), { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true });
      expect(
        screen.getByText(/Kelanjutan pesanan kamu diberitahukan oleh Toko Partner/),
      ).toBeInTheDocument();
    });

    test("nominal & waktu bayar tetap ditampilkan sebagai bukti", () => {
      renderPartner(makeSession(), { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true });
      expect(screen.getByText("Rp 1.009.000")).toBeInTheDocument();
      expect(screen.getByText(/WIB/)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("TAGIHAN HILANG — tak ada nomor VA aktif / perintah transfer (cegah bayar dua kali)", () => {
      const { container } = renderPartner(makeSession(), {
        order: MENUNGGU_PERSETUJUAN,
        isDoneWaiting: true,
      });
      expect(container.textContent).not.toContain("9881 2345 67890");
      expect(container.textContent).not.toMatch(/Transfer nominal/);
      expect(container.textContent).not.toMatch(/Cara pembayaran/);
      expect(container.textContent).not.toMatch(/Selesaikan pembayaran dalam/);
    });

    test("tidak ada spinner / hitungan mundur yang menyuruh menunggu", () => {
      const { container } = renderPartner(makeSession(), {
        order: MENUNGGU_PERSETUJUAN,
        isDoneWaiting: true,
      });
      expect(container.querySelector(".animate-spin")).toBeNull();
    });

    test("tidak menjanjikan email/notifikasi dari kami", () => {
      const { container } = renderPartner(makeSession(), {
        order: MENUNGGU_PERSETUJUAN,
        isDoneWaiting: true,
      });
      const surface = renderedSurface(container);
      for (const pattern of FORBIDDEN_PROMISES) {
        expect(surface, `${pattern} tidak boleh dijanjikan`).not.toMatch(pattern);
      }
    });
  });

  describe("edge case", () => {
    test("PAID + status FAILED → uangnya tetap dinyatakan diterima lebih dulu", () => {
      renderPartner(makeSession(), {
        order: makeOrder({ paymentStatus: "PAID", status: "FAILED", paidAt: "2026-08-27T09:28:11Z" }),
        isDoneWaiting: true,
      });
      expect(screen.getByText("Pembayaran diterima")).toBeInTheDocument();
      expect(screen.getByText(/tidak bisa dilanjutkan/)).toBeInTheDocument();
      expect(screen.getByTestId("partner-return-link")).toBeInTheDocument();
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
    test("return_url pada origin terdaftar → tombol dirender dengan href itu", () => {
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

    test.each(rejected)("$label → TIDAK ada tombol, dan URL itu tak muncul di halaman", ({ url }) => {
      const { container } = renderPartner(makeSession({ returnUrl: url, cancelUrl: null }), {
        order: MENUNGGU_PERSETUJUAN,
        isDoneWaiting: true,
      });
      expect(screen.queryByTestId("partner-return-link")).toBeNull();
      // URL yang ditolak tidak boleh nyangkut di atribut mana pun.
      const hrefs = [...container.querySelectorAll("[href]")].map((a) => a.getAttribute("href"));
      expect(hrefs).not.toContain(url);
      // Dan customer tetap diberi arahan, bukan dibiarkan tanpa apa-apa.
      expect(screen.getByText(/Tutup halaman ini dan kembali ke Toko Partner/)).toBeInTheDocument();
    });
  });

  describe("edge case", () => {
    test("daftar terdaftar KOSONG → tak ada tombol walau URL-nya terlihat wajar", () => {
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
  const withQris = makeOrder({
    paymentStatus: "REQUESTED",
    paymentBank: null,
    virtualAccountNo: null,
    channels: [
      { channel: "QRIS", pgFeeIdr: "2000", banks: null },
      { channel: "VA", pgFeeIdr: "4000", banks: ["BNI", "BRI", "MANDIRI", "BCA"] },
    ],
  });

  describe("positive", () => {
    test("tiga bank yang didukung muncul sebagai tombol", () => {
      renderPartner(makeSession(), { order: withQris });
      for (const bank of ["MANDIRI", "BNI", "BRI"]) {
        expect(screen.getByRole("button", { name: bank })).toBeInTheDocument();
      }
    });
  });

  describe("negative", () => {
    test("QRIS TIDAK dirender walau backend menawarkannya", () => {
      const { container } = renderPartner(makeSession(), { order: withQris });
      expect(renderedSurface(container)).not.toMatch(/qris/i);
      expect(container.querySelector("canvas")).toBeNull();
    });

    test("bank di luar tiga yang didukung (BCA) tidak dirender", () => {
      renderPartner(makeSession(), { order: withQris });
      expect(screen.queryByRole("button", { name: "BCA" })).toBeNull();
    });

    test("backend hanya menawarkan QRIS → tak ada pilihan, bukan tombol yang pasti gagal", () => {
      const { container } = renderPartner(makeSession(), {
        order: makeOrder({
          paymentStatus: "REQUESTED",
          channels: [{ channel: "QRIS", pgFeeIdr: "2000", banks: null }],
        }),
      });
      expect(screen.getByText(/Metode pembayaran belum tersedia/)).toBeInTheDocument();
      expect(renderedSurface(container)).not.toMatch(/qris/i);
    });
  });

  describe("edge case", () => {
    test("instruksi cara bayar tidak menyebut QRIS di keadaan menunggu transfer", () => {
      const { container } = renderPartner(makeSession(), { order: makeOrder() });
      expect(renderedSurface(container)).not.toMatch(/qris/i);
    });
  });
});

// ── Model dari branding, bukan query string ───────────────────────────────────────────────────

describe("model checkout datang dari partner_branding, bukan dari query string", () => {
  describe("positive", () => {
    test("sesi NEUTRAL tetap netral walau URL berkata ?theme=USDX", () => {
      window.history.replaceState(null, "", "/pay/ord_1?theme=USDX");
      const { container } = renderPartner(makeSession({ model: "NEUTRAL" }));
      expect(renderedSurface(container)).not.toMatch(/usdx/i);
    });

    test("sesi USDX tetap ber-brand walau URL berkata ?theme=NEUTRAL", () => {
      window.history.replaceState(null, "", "/pay/ord_1?theme=NEUTRAL");
      const { container } = renderPartner(makeSession({ model: "USDX" }));
      expect(renderedSurface(container)).toMatch(/usdx/i);
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
    test("beberapa parameter sekaligus tetap tidak berpengaruh", () => {
      window.history.replaceState(
        null,
        "",
        "/pay/ord_1?theme=USDX&brand=usdx&primaryColor=%23800000",
      );
      const { container } = renderPartner(makeSession({ model: "NEUTRAL" }));
      const surface = renderedSurface(container);
      expect(surface).not.toMatch(/usdx/i);
      // Warna pun tidak diambil dari URL.
      expect(surface).not.toContain("#800000");
    });
  });
});

// ── Light + Dark ──────────────────────────────────────────────────────────────────────────────

describe("Light + Dark dua-duanya benar", () => {
  // Semua permukaan & teks memakai token yang berbalik di `.dark` (`globals.css`). Yang diuji:
  // tak ada warna literal yang dipatok di markup, dan tombol brand punya tepi dari token tema.
  const themes = ["light", "dark"] as const;

  describe("positive", () => {
    test.each(themes)("%s → seluruh keadaan tetap render dengan token tema", (theme) => {
      document.documentElement.className = theme === "dark" ? "dark" : "";
      const { container } = renderPartner(makeSession(), { order: makeOrder() });
      // Latar & teks datang dari token, bukan dari hex yang dipatok.
      expect(container.querySelector(".bg-background")).not.toBeNull();
      expect(container.querySelector(".text-foreground")).not.toBeNull();
    });

    test.each(themes)("%s → tombol brand punya tepi dari token tema (bukan dari warna partner)", (theme) => {
      document.documentElement.className = theme === "dark" ? "dark" : "";
      renderPartner(makeSession(), { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true });
      const link = screen.getByTestId("partner-return-link");
      // `border-foreground/15` ikut berbalik bersama tema, jadi brand putih maupun hitam tetap
      // punya batas yang terlihat.
      expect(link.className).toContain("border-foreground/15");
    });
  });

  describe("negative", () => {
    test("tidak ada teks yang dipatok putih/hitam di luar permukaan brand", () => {
      const { container } = renderPartner(makeSession(), { order: makeOrder() });
      // `text-white`/`text-black` tanpa varian dark = kandidat tak terbaca di salah satu tema.
      expect(container.querySelector(".text-white")).toBeNull();
      expect(container.querySelector(".text-black")).toBeNull();
    });

    test("warna teks tombol brand DIHITUNG, bukan dipatok putih", () => {
      renderPartner(
        // Kuning terang: teks putih di atasnya akan gagal AA.
        makeSession({ branding: { ...NEUTRAL_BRANDING, primaryColor: "#f7e600" } }),
        { order: MENUNGGU_PERSETUJUAN, isDoneWaiting: true },
      );
      const link = screen.getByTestId("partner-return-link");
      expect(link.getAttribute("style")).toContain("var(--partner-brand-text)");
    });
  });

  describe("edge case", () => {
    test.each(themes)("%s → tanpa branding, halaman tetap terbaca (fallback netral)", (theme) => {
      document.documentElement.className = theme === "dark" ? "dark" : "";
      const { container } = renderPartner(makeSession({ branding: null }), {
        order: makeOrder(),
      });
      expect(container.querySelector(".bg-background")).not.toBeNull();
      expect(container.textContent).toContain("Nomor Virtual Account");
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
    test("selama masih dalam anggaran, tombol itu TIDAK ditampilkan", () => {
      renderPartner(makeSession(), { order: makeOrder(), isPollBudgetSpent: false });
      expect(screen.queryByRole("button", { name: "Perbarui status" })).toBeNull();
    });
  });

  describe("edge case", () => {
    test("setelah uang masuk, tak ada tombol perbarui — tak ada lagi yang ditunggu di sini", () => {
      renderPartner(makeSession(), {
        order: MENUNGGU_PERSETUJUAN,
        isDoneWaiting: true,
        isPollBudgetSpent: true,
      });
      expect(screen.queryByRole("button", { name: "Perbarui status" })).toBeNull();
    });
  });
});
