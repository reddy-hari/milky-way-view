import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Milky Way View — galaxy, nearby stars & Solar System explorer",
  description:
    "Interactive 3D explorer for the Milky Way (illustrative model), catalogued nearby stars and exoplanet hosts, and the Solar System from JPL Horizons ephemerides.",
};

export const viewport: Viewport = {
  themeColor: "#03050c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
