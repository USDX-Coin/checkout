import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MintStatusTracker } from "@/components/checkout/MintStatusTracker";
import type { MintOrderDetail } from "@/types";

// USDX-293: langkah "Proses on-chain"/"Selesai" hanya boleh "berhasil" (done, tanpa spinner)
// saat status=COMPLETED DAN onChainTxHash terisi. State PAID/WAITING_FOR_APPROVAL (Safe masih
// PENDING_APPROVAL, txHash kosong) = "sedang diproses" (spinner), BUKAN berhasil.

function makeOrder(o: Partial<MintOrderDetail> = {}): MintOrderDetail {
  return {
    id: "ord_1",
    orderNumber: "USDX-1",
    customerName: "Demo",
    type: "MINT",
    userAddress: "0xabc",
    chain: "polygon",
    inputCurrency: "USD",
    amount: "54",
    baseRate: "16000",
    spreadBuyPct: "2.5",
    effectiveRate: "16400",
    subtotalIdr: "1640000",
    mintFeePct: "1",
    mintFeeIdr: "16400",
    totalBeforePgFeeIdr: "1656400",
    paymentChannel: "VA",
    pgFeeIdr: null,
    totalFeeIdr: null,
    totalPayIdr: null,
    paymentBank: "BCA",
    paymentStatus: "PAID",
    safeStatus: "PENDING_APPROVAL",
    status: "WAITING_FOR_APPROVAL",
    paymentProvider: "MOCK",
    virtualAccountNo: "8808123456",
    paymentUrl: null,
    paymentRef: null,
    paidAt: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    safeTxHash: "0xsafe",
    onChainTxHash: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...o,
  };
}

// Label "done"/"active" → font-medium text-foreground; "pending" → text-muted-foreground.
const isPending = (label: string) => screen.getByText(label).className.includes("text-muted-foreground");

describe("MintStatusTracker", () => {
  describe("positive", () => {
    test("COMPLETED + onChainTxHash → semua langkah selesai, tanpa spinner", () => {
      const { container } = render(
        <MintStatusTracker
          order={makeOrder({ status: "COMPLETED", safeStatus: "EXECUTED", onChainTxHash: "0xdeadbeef" })}
        />,
      );
      expect(isPending("Proses on-chain")).toBe(false);
      expect(isPending("Selesai")).toBe(false);
      expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
    });
  });

  describe("negative", () => {
    test("PAID + WAITING_FOR_APPROVAL (txHash kosong) → on-chain masih diproses, Selesai pending", () => {
      const { container } = render(<MintStatusTracker order={makeOrder()} />);
      // Pembayaran sudah beres, on-chain masih berjalan (spinner), Selesai belum.
      expect(isPending("Pembayaran")).toBe(false);
      expect(isPending("Selesai")).toBe(true);
      expect(container.querySelectorAll(".animate-spin")).toHaveLength(1);
    });

    test("FAILED → tampil pesan gagal, bukan langkah sukses", () => {
      render(<MintStatusTracker order={makeOrder({ status: "FAILED", safeStatus: "REJECTED" })} />);
      expect(screen.getByText(/Transaksi gagal/)).toBeInTheDocument();
      expect(screen.queryByText("Selesai")).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    test("status COMPLETED tapi onChainTxHash MASIH kosong → JANGAN tampilkan berhasil (guard USDX-293)", () => {
      const { container } = render(
        <MintStatusTracker order={makeOrder({ status: "COMPLETED", safeStatus: "EXECUTED", onChainTxHash: null })} />,
      );
      // Belum ada bukti tx on-chain → on-chain tetap diproses, Selesai pending.
      expect(isPending("Selesai")).toBe(true);
      expect(container.querySelectorAll(".animate-spin")).toHaveLength(1);
    });
  });
});
