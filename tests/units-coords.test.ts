import { describe, expect, it } from "vitest";
import {
  ICRS_TO_GALACTIC,
  R0_KPC,
  cartesianToSpherical,
  equatorialToGalactic,
  equatorialToGalacticCartesianPc,
  galacticPcToGalactocentricKpc,
  sceneToZUp,
  sphericalToCartesian,
  zUpToScene,
  type Vec3,
} from "@/lib/astro/coords";
import {
  AU_KM,
  PC_AU,
  auPerDayToKmPerS,
  formatDec,
  formatDistancePc,
  formatRa,
  parallaxMasToPc,
  pcToKpc,
  pcToLy,
  wrapDeg360,
} from "@/lib/astro/units";
import { JD_J2000, fromDateTimeLocalUtc, jdToMs, msToJd, toDateTimeLocalUtc, julianCenturiesSinceJ2000 } from "@/lib/astro/time";

describe("unit conversions", () => {
  it("parallax → distance", () => {
    expect(parallaxMasToPc(1000)).toBe(1);
    expect(parallaxMasToPc(768.0665)).toBeCloseTo(1.302, 3); // Proxima Centauri (Gaia DR3)
    expect(parallaxMasToPc(0)).toBeNull();
    expect(parallaxMasToPc(-1.2)).toBeNull();
    expect(parallaxMasToPc(null)).toBeNull();
    expect(parallaxMasToPc(Number.NaN)).toBeNull();
  });

  it("parsec, light-year, kpc and au constants", () => {
    expect(pcToLy(1)).toBeCloseTo(3.26156, 4);
    expect(pcToKpc(8200)).toBe(8.2);
    expect(PC_AU).toBeCloseTo(206264.806, 2);
  });

  it("au/day → km/s (Earth orbital speed ≈ 29.8 km/s)", () => {
    expect(auPerDayToKmPerS(0.0172)).toBeCloseTo(29.78, 1);
    expect(auPerDayToKmPerS(1)).toBeCloseTo(AU_KM / 86400, 6);
  });

  it("wraps and formats angles", () => {
    expect(wrapDeg360(-30)).toBe(330);
    expect(wrapDeg360(725)).toBe(5);
    expect(formatRa(0)).toBe("00h 00m 00.0s");
    expect(formatRa(15)).toBe("01h 00m 00.0s");
    expect(formatRa(359.99999)).toBe("00h 00m 00.0s");
    expect(formatDec(-28.936)).toBe("−28° 56′ 10″");
    expect(formatDec(45.5)).toBe("+45° 30′ 00″");
  });

  it("formats missing distances as missing", () => {
    expect(formatDistancePc(null)).toBe("Distance not available");
    expect(formatDistancePc(1.302)).toBe("1.30 pc (4.25 ly)");
  });
});

describe("time conversions", () => {
  it("Unix epoch ↔ Julian Date", () => {
    expect(msToJd(0)).toBe(2440587.5);
    expect(msToJd(Date.UTC(2000, 0, 1, 12))).toBe(JD_J2000);
    expect(jdToMs(JD_J2000)).toBe(Date.UTC(2000, 0, 1, 12));
    expect(julianCenturiesSinceJ2000(JD_J2000 + 36525)).toBe(1);
  });

  it("datetime-local values are interpreted as UTC", () => {
    const ms = Date.UTC(2026, 10, 24, 7, 30);
    expect(toDateTimeLocalUtc(ms)).toBe("2026-11-24T07:30");
    expect(fromDateTimeLocalUtc("2026-11-24T07:30")).toBe(ms);
    expect(fromDateTimeLocalUtc("not a date")).toBeNull();
  });
});

describe("coordinate transforms", () => {
  const close = (a: Vec3, b: Vec3, d = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d));

  it("spherical ↔ cartesian round trip", () => {
    const v = sphericalToCartesian(123.4, -56.7, 8.9);
    const s = cartesianToSpherical(v);
    expect(s.lonDeg).toBeCloseTo(123.4, 9);
    expect(s.latDeg).toBeCloseTo(-56.7, 9);
    expect(s.r).toBeCloseTo(8.9, 9);
  });

  it("ICRS→Galactic matrix is orthonormal (a pure rotation)", () => {
    const m = ICRS_TO_GALACTIC;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const dot = m[i][0] * m[j][0] + m[i][1] * m[j][1] + m[i][2] * m[j][2];
        expect(dot).toBeCloseTo(i === j ? 1 : 0, 9);
      }
    }
  });

  it("maps the Galactic Centre direction to l = 0, b = 0", () => {
    // Galactic centre (IAU 1958 definition) in ICRS: RA 266.40500°, Dec −28.93617°
    const g = equatorialToGalactic(266.405, -28.936175);
    expect(Math.min(g.lDeg, 360 - g.lDeg)).toBeLessThan(0.01);
    expect(g.bDeg).toBeCloseTo(0, 2);
  });

  it("maps the North Galactic Pole to b = +90°", () => {
    expect(equatorialToGalactic(192.85948, 27.12825).bDeg).toBeCloseTo(90, 4);
  });

  it("matches published Galactic coordinates for a known star (Sirius: l = 227.23°, b = −8.89°)", () => {
    const g = equatorialToGalactic(101.28715533, -16.71611586);
    expect(g.lDeg).toBeCloseTo(227.23, 1);
    expect(g.bDeg).toBeCloseTo(-8.89, 1);
  });

  it("refuses to place objects with missing values", () => {
    expect(equatorialToGalacticCartesianPc(10, 20, null)).toBeNull();
    expect(equatorialToGalacticCartesianPc(null, 20, 5)).toBeNull();
    expect(equatorialToGalacticCartesianPc(10, 20, -1)).toBeNull();
    const p = equatorialToGalacticCartesianPc(10, 20, 5)!;
    expect(Math.hypot(...p)).toBeCloseTo(5, 9);
  });

  it("puts the Sun at (−R₀, 0, 0) in the galactocentric frame", () => {
    expect(galacticPcToGalactocentricKpc([0, 0, 0])).toEqual([-R0_KPC, 0, 0]);
    close(galacticPcToGalactocentricKpc([8200, 0, 0]), [0, 0, 0]);
  });

  it("Z-up → scene Y-up is a proper rotation and invertible", () => {
    expect(zUpToScene([1, 2, 3])).toEqual([1, 3, -2]);
    expect(sceneToZUp(zUpToScene([1, 2, 3]))).toEqual([1, 2, 3]);
    // Right-handedness preserved: x × y = z maps to x' × y' = z'
    const x = zUpToScene([1, 0, 0]), y = zUpToScene([0, 1, 0]), z = zUpToScene([0, 0, 1]);
    const cross: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    close(cross, z);
  });
});
