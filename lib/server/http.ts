import "server-only";
import type { ApiErrorBody } from "../types/astro";

/** Error raised by upstream adapters; message is safe to show to users. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** fetch() with a hard timeout. Throws UpstreamError on network errors, timeouts and non-2xx. */
export async function fetchWithTimeout(url: string | URL, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new UpstreamError(`Upstream responded with HTTP ${res.status}`, res.status);
    return res;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new UpstreamError(`Upstream timed out after ${timeoutMs} ms`);
    throw new UpstreamError("Upstream request failed");
  } finally {
    clearTimeout(timer);
  }
}

export function jsonError(status: number, code: string, message: string): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: unknown, maxAgeSeconds: number): Response {
  return Response.json(body, {
    headers: { "Cache-Control": `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds}` },
  });
}
