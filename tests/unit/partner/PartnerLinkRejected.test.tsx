import { describe, test, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PartnerLinkRejected } from "@/components/checkout/partner/PartnerLinkRejected";
import { PARTNER_SESSION_REJECTED_MESSAGE } from "@/lib/api/partner";
import { PARTNER_SESSION_KEY } from "@/lib/partner/session-store";
import type { PartnerCheckoutSession } from "@/lib/partner/types";

// Temuan audit B13: `/s` tanpa token, `/s/{token}` yang ditolak, dan `/pay/{orderId}` tanpa sesi
// sama-sama merender satu paragraf abu-abu TANPA satu pun tombol. Customer partner yang mendarat
// di sini berhenti total — di halaman milik pihak yang bahkan tidak dia kenal.
//
// Pesannya sendiri sengaja tetap satu untuk semua sebab (lihat `PARTNER_SESSION_REJECTED_MESSAGE`):
// membedakan "tak dikenal" dari "kedaluwarsa" memberi tahu pemegang tautan acak apakah suatu
// pesanan ada. Yang ditambahkan tiket ini cuma jalan keluarnya.

function withSession(over: Partial<PartnerCheckoutSession> = {}) {
  const session: PartnerCheckoutSession = {
    orderId: "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012",
    model: "NEUTRAL",
    status: "EXPIRED",
    sessionToken: "psess-abc",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    returnUrl: "https://partner.co.id/pesanan/selesai",
    cancelUrl: null,
    branding: {
      displayName: "Tokoku",
      logoUrl: null,
      faviconUrl: null,
      primaryColor: null,
      accentColor: null,
      supportEmail: null,
      footerText: null,
      allowedReturnOrigins: ["https://partner.co.id"],
    },
    ...over,
  };
  sessionStorage.setItem(PARTNER_SESSION_KEY, JSON.stringify(session));
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("PartnerLinkRejected", () => {
  describe("positive", () => {
    test("pesan penolakan tetap satu, apa pun sebabnya", () => {
      render(<PartnerLinkRejected />);
      expect(screen.getByText(PARTNER_SESSION_REJECTED_MESSAGE)).toBeInTheDocument();
      expect(screen.getByText("Tautan pembayaran tidak berlaku")).toBeInTheDocument();
    });

    test("partner dikenal + return_url terdaftar → tombol pulang ke partner", () => {
      withSession();
      render(<PartnerLinkRejected />);
      const link = screen.getByTestId("partner-return-link");
      expect(link).toHaveAttribute("href", "https://partner.co.id/pesanan/selesai");
      expect(link).toHaveTextContent("Kembali ke Tokoku");
    });

    test("layarnya tidak pernah buntu: selalu ada tombol ATAU arahan", () => {
      render(<PartnerLinkRejected />);
      const adaTombol =
        screen.queryByRole("button") !== null || screen.queryByRole("link") !== null;
      const adaArahan = screen.queryByText(/Tutup halaman ini/) !== null;
      expect(adaTombol || adaArahan).toBe(true);
    });
  });

  describe("negative", () => {
    test("return_url di origin yang TIDAK terdaftar → tak ada tombol pulang (bukan open redirect)", () => {
      withSession({ returnUrl: "https://evil.co.id/ambil" });
      render(<PartnerLinkRejected />);
      expect(screen.queryByTestId("partner-return-link")).toBeNull();
    });

    test("return_url http (bukan https) → ditolak juga", () => {
      withSession({ returnUrl: "http://partner.co.id/pesanan" });
      render(<PartnerLinkRejected />);
      expect(screen.queryByTestId("partner-return-link")).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("tanpa sesi & tanpa riwayat tab → arahan tekstual, bukan tombol yang tak melakukan apa-apa", () => {
      render(<PartnerLinkRejected />);
      // jsdom memulai tab dengan satu entri riwayat.
      expect(window.history.length).toBe(1);
      expect(screen.getByText(/Tutup halaman ini/)).toBeInTheDocument();
    });

    test("partner tanpa nama → sebutan generik, bukan nama kami", () => {
      withSession({
        branding: {
          displayName: "",
          logoUrl: null,
          faviconUrl: null,
          primaryColor: null,
          accentColor: null,
          supportEmail: null,
          footerText: null,
          allowedReturnOrigins: ["https://partner.co.id"],
        },
      });
      render(<PartnerLinkRejected />);
      const link = screen.getByTestId("partner-return-link");
      expect(link).toHaveTextContent("Kembali ke penyedia layanan kamu");
      expect(link).not.toHaveTextContent("USDX");
    });
  });
});
