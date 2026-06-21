import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contour | Local Background Removal & Image Vectorization",
  description:
    "100% local, 100% private, open-source background removal and image vectorization. Runs entirely in your browser via WebAssembly — no uploads, no servers.",
  // The favicon is set at runtime based on the theme (see app/page.tsx):
  // light → black icon, dark → white icon.
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, height: "100%", overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
