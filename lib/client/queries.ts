"use client";

/**
 * TanStack Query hooks for the app's own Route Handlers. The browser never
 * calls external archives directly.
 */
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ApiErrorBody, EphemerisResponse, ExoplanetsResponse, StarsResponse } from "../types/astro";
import { chunkIndexFor, ephemerisUrl } from "../scene/solar";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch {
    throw new ApiError("Network error — could not reach the server", 0);
  }
  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* keep generic message */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export const queryKeys = {
  exoplanets: ["exoplanets"] as const,
  stars: (minParallax: number) => ["stars", minParallax] as const,
  ephemeris: (chunk: number) => ["ephemeris", chunk] as const,
};

/** Default Gaia query: parallax > 40 mas (≤ 25 pc). */
export const DEFAULT_MIN_PARALLAX_MAS = 40;

export function useExoplanets() {
  return useQuery({
    queryKey: queryKeys.exoplanets,
    queryFn: ({ signal }) => fetchJson<ExoplanetsResponse>("/api/exoplanets", signal),
    staleTime: 60 * 60 * 1000,
    gcTime: Infinity,
  });
}

export function useStars(minParallaxMas = DEFAULT_MIN_PARALLAX_MAS) {
  return useQuery({
    queryKey: queryKeys.stars(minParallaxMas),
    queryFn: ({ signal }) => fetchJson<StarsResponse>(`/api/stars?minParallax=${minParallaxMas}`, signal),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: Infinity,
  });
}

export const ephemerisQuery = (chunk: number) => ({
  queryKey: queryKeys.ephemeris(chunk),
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<EphemerisResponse>(ephemerisUrl(chunk), signal),
  staleTime: Infinity,
  gcTime: 30 * 60 * 1000,
  retry: 1,
});

/**
 * Ephemeris for the chunk containing `timeMs`, plus a prefetch of the
 * neighbouring chunk in the direction of playback.
 */
export function useEphemerisChunks(timeMs: number, enabled: boolean, direction: 1 | -1 = 1) {
  const current = chunkIndexFor(timeMs);
  const results = useQueries({
    queries: [
      { ...ephemerisQuery(current), enabled },
      { ...ephemerisQuery(current + direction), enabled },
    ],
  });
  return { chunk: current, current: results[0], next: results[1] };
}
