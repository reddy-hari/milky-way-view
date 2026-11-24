import { parseStarsParams } from "@/lib/api/params";
import { jsonError, jsonOk } from "@/lib/server/http";
import { getStars } from "@/lib/server/stars-service";

/**
 * GET /api/stars?minParallax=40&limit=3000
 * Bounded Gaia DR3 query around the Sun: parallax > minParallax mas
 * (i.e. distance < 1000/minParallax pc), parallax_over_error > 10, at most
 * `limit` rows. minParallax ∈ [20, 1000], limit ∈ [1, 5000].
 */
export async function GET(request: Request): Promise<Response> {
  const parsed = parseStarsParams(new URL(request.url).searchParams);
  if (!parsed.ok) return jsonError(400, "invalid_parameter", parsed.message);
  try {
    const data = await getStars(parsed.value);
    return jsonOk(data, data.source.origin === "live" ? 86400 : 60);
  } catch {
    return jsonError(500, "internal_error", "Could not load star catalogue data");
  }
}
