// Pembungkus fetch tipis untuk backend USDX (USDX-224, port dari app USDX-150).
// Beda dengan repo `app`: auth via **cross-subdomain cookie** (`.usdx.co.id`, USDX-222),
// jadi pakai `credentials: "include"` — BUKAN Authorization: Bearer. Checkout tidak
// punya UI login; sesi datang dari cookie yang di-set saat login consumer di `app`.
// Kalau cookie tak ada (mis. localhost / sesi habis) → 401, dan halaman menampilkan
// state "tidak ditemukan".
//
// - Prepend `env.apiBaseUrl` agar request kena backend, bukan origin FE.
// - Unwrap envelope SoT `{ status, metadata, data }` → kembalikan `data`.
// - Throw `ApiError` (bentuk SoT `ErrorResponse`) untuk non-2xx.

import { env } from "@/lib/env";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
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

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
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
    );
  }

  // Toleransi handler yang belum migrasi ke envelope SoT.
  if (payload && typeof payload === "object" && "status" in (payload as object)) {
    return (payload as SoTSuccessEnvelope<T>).data;
  }
  return payload as T;
}
