// Metode bayar yang boleh muncul di halaman checkout partner (USDX-548).
//
// Bank VA saja, TIDAK ADA QRIS. Bukan pilihan desain: provider di
// balik jalur partner menerbitkan virtual account saja
// (`backend/.../durianpay-snap-payment.provider.ts:250`, dan kontraknya menyatakannya terang-
// terangan di `sot/api/partner-mint.yaml` → "QRIS is not available"). Menawarkan QRIS di sini
// berarti menawarkan tombol yang pasti gagal setelah customer memilihnya.
//
// Daftar ini adalah SARINGAN, bukan sumber kebenaran: yang berwenang tetap `channels[]` dari
// backend (ia yang tahu bank mana sedang dimatikan untuk perawatan). Saringan ini memastikan
// backend yang keliru mengirim QRIS — atau bank di luar tiga ini — tidak berubah jadi pilihan
// yang bisa diklik di halaman partner.

import type { MintChannelOption, VaBank } from "@/types";

/** Bank VA yang didukung jalur partner (`MintCreate.payment_bank`).
 *
 *  `satisfies readonly VaBank[]` bukan hiasan: sebelum USDX-622 daftar ini cuma `as const`, jadi
 *  saat NOBU masuk ke `VaBank` tak ada satu pun error compiler yang menunjukkan daftar ini
 *  tertinggal — dan jalur partner diam-diam kehilangan SATU-SATUNYA bank yang bisa dipakai.
 *  Dengan `satisfies`, kode bank yang salah ketik tetap tertangkap; yang tertinggal masih perlu
 *  mata manusia, tapi setidaknya daftar ini sekarang terikat ke tipe yang sama. */
export const PARTNER_VA_BANKS = [
  "MANDIRI",
  "BNI",
  "BRI",
  "NOBU",
] as const satisfies readonly VaBank[];

export type PartnerVaBank = (typeof PARTNER_VA_BANKS)[number];

export function isPartnerVaBank(bank: string | null | undefined): bank is PartnerVaBank {
  return !!bank && (PARTNER_VA_BANKS as readonly string[]).includes(bank);
}

/**
 * Channel dari backend → channel yang boleh ditampilkan di halaman partner.
 *
 * Membuang channel selain VA, membuang bank di luar daftar yang didukung, dan membuang VA yang
 * tak menyisakan satu bank pun yang BISA DIPILIH (kartu tanpa isi cuma bikin customer mengklik
 * jalan buntu).
 *
 * `disabledBanks` disaring lewat daftar yang sama — bank yang tidak boleh muncul sebagai pilihan
 * juga tidak boleh muncul sebagai janji "segera hadir" — tapi TIDAK ikut menentukan apakah
 * channelnya hidup: VA yang cuma berisi bank mati adalah jalan buntu yang sama, hanya lebih
 * sopan.
 */
export function partnerChannels(channels: MintChannelOption[] | null | undefined): MintChannelOption[] {
  if (!channels) return [];
  return channels
    .filter((c) => c.channel === "VA")
    .map((c) => {
      const banks = (c.banks ?? []).filter((b: VaBank) => isPartnerVaBank(b));
      const disabledBanks = (c.disabledBanks ?? []).filter((b: VaBank) => isPartnerVaBank(b));
      return {
        ...c,
        banks,
        ...(disabledBanks.length > 0 ? { disabledBanks } : {}),
      };
    })
    .filter((c) => (c.banks?.length ?? 0) > 0);
}
