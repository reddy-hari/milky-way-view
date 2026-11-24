// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import exoFixture from "@/lib/data/fixtures/exoplanets.sample.json";
import gaiaFixture from "@/lib/data/fixtures/gaia.sample.json";
import { Providers } from "@/app/providers";
import { Explorer } from "@/components/Explorer";
import { searchItems, type SearchItem } from "@/components/ui/SearchBox";
import { normalizeExoplanetRows } from "@/lib/data/exoplanets";
import { normalizeGaiaTap } from "@/lib/data/gaia";
import type { ExoplanetsResponse, StarsResponse } from "@/lib/types/astro";

// The WebGL scene cannot run in jsdom; the UI around it is what we test here.
vi.mock("@/components/scene/LazySceneCanvas", () => ({ default: () => <div data-testid="scene" /> }));

const { systems, planetCount } = normalizeExoplanetRows(exoFixture.rows);
const exoResponse: ExoplanetsResponse = {
  systems,
  planetCount,
  source: { name: "NASA Exoplanet Archive (pscomppars)", url: "https://exoplanetarchive.ipac.caltech.edu/", origin: "sample", fetchedAt: exoFixture.fetchedAt },
  warnings: [],
};
const starsResponse: StarsResponse = {
  stars: normalizeGaiaTap(gaiaFixture),
  query: { minParallaxMas: 80, limit: 1000 },
  source: { name: "ESA Gaia DR3 (gaiadr3.gaia_source)", url: "https://www.cosmos.esa.int/web/gaia/dr3", origin: "live", fetchedAt: "2026-11-24T08:00:00.000Z" },
  warnings: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/exoplanets")) return Response.json(exoResponse);
      if (url.startsWith("/api/stars")) return Response.json(starsResponse);
      return Response.json({ error: { code: "not_found", message: "not mocked" } }, { status: 404 });
    }),
  );
  // jsdom has no WebGL: report "supported" so the (mocked) scene path renders.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({})) as unknown as HTMLCanvasElement["getContext"]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderApp() {
  return render(
    <Providers>
      <Explorer />
    </Providers>,
  );
}

describe("Explorer", () => {
  it("searches for a system, selects it and shows its catalogue details with source", async () => {
    const user = userEvent.setup();
    renderApp();

    // Data sources load and are labelled.
    expect(await screen.findByText(/systems, \d+ planets/)).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toBeInTheDocument();

    const search = screen.getByRole("combobox", { name: /^Search/ });
    await user.type(search, "trappist");
    const option = await screen.findByRole("option", { name: /TRAPPIST-1/ });
    await user.click(option);

    const panel = await screen.findByRole("complementary", { name: "TRAPPIST-1" });
    expect(within(panel).getByRole("heading", { level: 2, name: "TRAPPIST-1" })).toBeInTheDocument();
    expect(within(panel).getByText("Known exoplanet host system")).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: /Confirmed planets \(7/ })).toBeInTheDocument();
    for (const l of ["b", "c", "d", "e", "f", "g", "h"]) {
      expect(within(panel).getByRole("rowheader", { name: `TRAPPIST-1 ${l}` })).toBeInTheDocument();
    }
    expect(within(panel).getByRole("link", { name: "NASA Exoplanet Archive (pscomppars)" })).toBeInTheDocument();
    expect(within(panel).getByText("Sample data")).toBeInTheDocument();
    expect(within(panel).getByText(/Snapshot taken:/)).toBeInTheDocument();

    // Escape closes the panel.
    await user.click(document.body);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "TRAPPIST-1" })).not.toBeInTheDocument();
  });

  it("shows 'no confirmed planets in this dataset' for a Gaia star", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/systems, \d+ planets/);
    const star = starsResponse.stars.find((s) => !systems.some((h) => h.gaiaDr3Id === s.id))!;
    await user.type(screen.getByRole("combobox", { name: /^Search/ }), star.id.slice(-10));
    await user.click(await screen.findByRole("option", { name: new RegExp(star.id) }));
    const panel = await screen.findByRole("complementary", { name: star.id });
    expect(within(panel).getByText("No confirmed planets in this dataset.")).toBeInTheDocument();
    expect(within(panel).getByText(/J2016\.0/)).toBeInTheDocument();
  });

  it("falls back to a usable list when WebGL is unavailable", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByRole("heading", { name: "3D view unavailable" })).toBeInTheDocument();
    const nearest = await screen.findByRole("button", { name: systems[0].name });
    await user.click(nearest);
    expect(await screen.findByRole("complementary", { name: systems[0].name })).toBeInTheDocument();
  });
});

describe("searchItems", () => {
  const items: SearchItem[] = [
    { key: "a", label: "TRAPPIST-1", sublabel: "", terms: ["trappist-1", "2mass j23062928-0502285"], rank: 107 },
    { key: "b", label: "Proxima Cen", sublabel: "", terms: ["proxima cen"], rank: 102 },
    { key: "c", label: "Earth", sublabel: "", terms: ["earth"], rank: 10000 },
  ];
  it("matches ignoring case, spaces and hyphens", () => {
    expect(searchItems(items, "trappist1").map((i) => i.key)).toEqual(["a"]);
    expect(searchItems(items, "PROXIMA").map((i) => i.key)).toEqual(["b"]);
    expect(searchItems(items, "")).toEqual([]);
    expect(searchItems(items, "zzz")).toEqual([]);
  });
});
