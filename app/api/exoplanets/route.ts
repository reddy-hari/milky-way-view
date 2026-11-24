import { getExoplanets } from "@/lib/server/exoplanets-service";
import { jsonError, jsonOk } from "@/lib/server/http";

/**
 * GET /api/exoplanets
 * Confirmed planets grouped into host systems (NASA Exoplanet Archive,
 * pscomppars). Falls back to a bundled real-data sample if the archive is
 * unavailable; `source.origin` tells the client which one it got.
 * Takes no parameters; unknown parameters are rejected to keep the cache key stable.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].length > 0) {
    return jsonError(400, "unexpected_parameter", "This endpoint takes no query parameters");
  }
  try {
    const data = await getExoplanets();
    return jsonOk(data, data.source.origin === "live" ? 3600 : 60);
  } catch {
    return jsonError(500, "internal_error", "Could not load exoplanet data");
  }
}
