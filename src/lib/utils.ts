import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Tampilkan IDR sebagai rupiah bulat (tanpa ,00 di belakang) biar bersih dibaca —
// nominal otoritatif tetap dari backend (string desimal); ini display-only.
export function formatIDR(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `Rp ${new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Waktu pembayaran diterima, dikunci ke WIB — user bisa membukanya dari zona waktu mana pun,
// tapi yang jadi rujukan saat cek mutasi/ops selalu jam Indonesia. Timestamp tak valid → null
// supaya pemanggil bisa menyembunyikan barisnya, bukan menampilkan "Invalid Date".
export function formatWibDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const text = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
  return `${text} WIB`;
}

// Countdown helper (mm:ss) untuk timer pembayaran di checkout.
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
