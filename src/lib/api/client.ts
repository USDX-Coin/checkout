// Pembungkus fetch tipis untuk backend USDX (USDX-224, port dari app USDX-150).
// Beda dengan repo `app`: auth via **cross-subdomain cookie** (`.usdx.co.id`, USDX-222),
// jadi pakai `credentials: "include"` — BUKAN Authorization: Bearer. Checkout tidak
// punya UI login; sesi datang dari cookie yang di-set saat login consumer di `app`.
// Kalau cookie tak ada (mis. localhost / sesi habis) → 401, dan halaman menampilkan
// state "tidak ditemukan".
//
// - Prepend `env.apiBaseUrl` agar request kena backend, bukan origin FE.
// - Unwrap envelope SoT `{ status, metadata, data }` → kembalikan `data`.
// - Throw `ApiError` (bentuk SoT `ErrorResponse`) untuk non-2xx, parse `Retry-After`
//   (429 RATE_LIMITED throttle mint, conventions.md § Rate Limiting — USDX-252).

import { env } from "@/lib/env";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  // Detik dari header `Retry-After` saat 429 (throttle 5 req/detik). null kalau tak ada.
  retryAfterSeconds: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown = undefined,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface SoTSuccessEnvelope<T> {
  status: "success";
  metadata?: unknown;
  data: T;
}

interface SoTErrorEnvelope {
  status?: "error";
  error?: { code?: string; message?: string; details?: unknown };
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

function parseRetryAfter(header: string | null, details: unknown): number | null {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds;
  }
  if (details && typeof details === "object" && "retryAfterSeconds" in details) {
    const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (typeof value === "number") return value;
  }
  return null;
}

// Seam dev-only (USDX-252): paksa 429 RATE_LIMITED supaya toast throttle + backoff
// polling bisa di-eyeball di dev tanpa backend ter-throttle (throttle real 5 req/detik,
// USDX-250, belum live). Arm via localStorage "usdx-checkout-sim-ratelimit" = detik
// Retry-After. TIDAK PERNAH aktif di production (NODE_ENV guard).
function simulatedRateLimit(): ApiError | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("usdx-checkout-sim-ratelimit");
  if (raw === null) return null;
  const seconds = Number(raw);
  return new ApiError(
    429,
    "RATE_LIMITED",
    "Terlalu banyak request, coba lagi sebentar",
    undefined,
    Number.isFinite(seconds) && seconds > 0 ? seconds : 1,
  );
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const sim = simulatedRateLimit();
  if (sim) throw sim;

  const { body, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...rest,
    headers: finalHeaders,
    // Bawa cookie sesi `.usdx.co.id` ke backend lintas-subdomain (USDX-222).
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = (payload ?? {}) as SoTErrorEnvelope;
    throw new ApiError(
      response.status,
      err.error?.code ?? "UNKNOWN",
      err.error?.message ?? response.statusText ?? "Request failed",
      err.error?.details,
      parseRetryAfter(response.headers.get("Retry-After"), err.error?.details),
    );
  }

  // Toleransi handler yang belum migrasi ke envelope SoT.
  if (payload && typeof payload === "object" && "status" in (payload as object)) {
    return (payload as SoTSuccessEnvelope<T>).data;
  }
  return payload as T;
}
