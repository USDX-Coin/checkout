import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../../helpers/test-utils";
import { PARTNER_SESSION_REJECTED_MESSAGE } from "@/lib/api/partner";
import { PARTNER_ENTRY_STRIPPED_PATH } from "@/lib/partner/entry";
import { PARTNER_SESSION_KEY, readPartnerSession } from "@/lib/partner/session-store";
import { CHECKOUT_TOKEN_KEY } from "@/lib/auth/token";
import type { PartnerCheckoutSession } from "@/lib/partner/types";

// USDX-548: pintu masuk `/s/{token}`.
//   * token HILANG dari URL/riwayat sebelum request apa pun
//   * token tidak pernah ditulis ke storage, tidak pernah ke log, tidak pernah ke URL request
//   * sukses → sesi tersimpan + pindah ke `/pay/{orderId}` (BUKAN rute aplikasi)
//   * gagal → satu pesan generik

const TOKEN = "9f2a1b3c4d5e6f70819a";

const mockReplace = vi.fn();
let mockParams: Record<string, string | undefined> = { token: TOKEN };
vi.mock("next/navigation", () => ({
  useParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), back: vi.fn() }),
}));

const mockResolve = vi.fn();
vi.mock("@/lib/api/partner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/partner")>();
  return { ...actual, resolvePartnerSession: (token: string) => mockResolve(token) };
});

import { PartnerSessionEntry } from "@/components/checkout/partner/PartnerSessionEntry";

const SESSION: PartnerCheckoutSession = {
  orderId: "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012",
  model: "NEUTRAL",
  status: "OPENED",
  sessionToken: "psess-abc",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  returnUrl: "https://partner.co.id/pesanan/selesai",
  cancelUrl: null,
  branding: null,
};

function renderEntry() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <PartnerSessionEntry />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  mockResolve.mockReset();
  mockParams = { token: TOKEN };
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", `/s/${TOKEN}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PartnerSessionEntry", () => {
  describe("positive", () => {
    test("token dibuang dari URL SEBELUM resolve selesai", async () => {
      // Resolve dibiarkan menggantung: URL harus SUDAH bersih walau jaringan belum menjawab.
      mockResolve.mockReturnValue(new Promise(() => {}));
      renderEntry();

      expect(window.location.pathname).toBe(PARTNER_ENTRY_STRIPPED_PATH);
      expect(window.location.href).not.toContain(TOKEN);
    });

    test("sukses → sesi tersimpan + pindah ke /pay/{orderId}", async () => {
      mockResolve.mockResolvedValue(SESSION);
      renderEntry();

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/pay/${SESSION.orderId}`));
      expect(readPartnerSession()).toEqual(SESSION);
    });

    test("resolve dipanggil dengan token mentah tepat SEKALI", async () => {
      mockResolve.mockResolvedValue(SESSION);
      renderEntry();

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      expect(mockResolve).toHaveBeenCalledTimes(1);
      expect(mockResolve).toHaveBeenCalledWith(TOKEN);
    });

    test("tidak pernah mengarahkan ke rute aplikasi /checkout/... ", async () => {
      mockResolve.mockResolvedValue(SESSION);
      renderEntry();

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      for (const [target] of mockReplace.mock.calls) {
        expect(String(target)).not.toContain("/checkout/");
      }
    });
  });

  describe("negative", () => {
    test("resolve gagal → pesan generik, tidak pindah halaman", async () => {
      mockResolve.mockRejectedValue(new Error("apa pun"));
      renderEntry();

      await waitFor(() =>
        expect(screen.getByText(PARTNER_SESSION_REJECTED_MESSAGE)).toBeInTheDocument(),
      );
      expect(mockReplace).not.toHaveBeenCalled();
      expect(readPartnerSession()).toBeNull();
    });

    test("token bentuknya tak sah → tidak ada request sama sekali", async () => {
      mockParams = { token: "pendek" };
      window.history.replaceState(null, "", "/s/pendek");
      renderEntry();

      expect(screen.getByText(PARTNER_SESSION_REJECTED_MESSAGE)).toBeInTheDocument();
      expect(mockResolve).not.toHaveBeenCalled();
    });

    test("token TIDAK ditulis ke storage mana pun (yang disimpan hanya hasil resolve)", async () => {
      mockResolve.mockResolvedValue(SESSION);
      renderEntry();

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      const dump = JSON.stringify({
        session: sessionStorage.getItem(PARTNER_SESSION_KEY),
        app: sessionStorage.getItem(CHECKOUT_TOKEN_KEY),
        local: { ...localStorage },
      });
      expect(dump).not.toContain(TOKEN);
    });

    test("token tidak masuk console", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
      );
      mockResolve.mockResolvedValue(SESSION);
      renderEntry();
      await waitFor(() => expect(mockReplace).toHaveBeenCalled());

      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(TOKEN);
        }
      }
    });

    test("slot sesi APLIKASI tidak disentuh", async () => {
      mockResolve.mockResolvedValue(SESSION);
      renderEntry();
      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBeNull();
    });
  });

  describe("edge case", () => {
    test("token absen di path → pesan generik, tanpa request", () => {
      mockParams = {};
      window.history.replaceState(null, "", "/s");
      renderEntry();

      expect(screen.getByText(PARTNER_SESSION_REJECTED_MESSAGE)).toBeInTheDocument();
      expect(mockResolve).not.toHaveBeenCalled();
    });

    test("query string di tautan masuk ikut dibuang (tak boleh menyetir tampilan)", () => {
      window.history.replaceState(null, "", `/s/${TOKEN}?theme=USDX`);
      mockResolve.mockReturnValue(new Promise(() => {}));
      renderEntry();

      expect(window.location.search).toBe("");
      expect(window.location.pathname).toBe(PARTNER_ENTRY_STRIPPED_PATH);
    });

    test("selama menunggu, halaman menampilkan pemuatan — bukan pesan penolakan", () => {
      mockResolve.mockReturnValue(new Promise(() => {}));
      renderEntry();

      expect(screen.getByText(/Membuka pembayaran/)).toBeInTheDocument();
      expect(screen.queryByText(PARTNER_SESSION_REJECTED_MESSAGE)).toBeNull();
    });
  });
});
