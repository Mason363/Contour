import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://contour.masn.studio";
const TITLE = "Contour — Free Background Remover & Image Vectorizer";
const DESCRIPTION =
  "Remove image backgrounds and convert images to clean SVG vectors, free. High-quality cut-outs, magic erase & restore brushes, background blur and shadow effects, batch processing, and export to PNG, WebP, SVG, PDF and more — all processed privately in your browser, with no upload required.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — Contour",
  },
  description: DESCRIPTION,
  applicationName: "Contour",
  authors: [{ name: "Mason Chen", url: "https://github.com/Mason363" }],
  creator: "Mason Chen",
  category: "Photo & Image Tools",
  keywords: [
    "background remover",
    "remove background",
    "remove background from image",
    "free background remover",
    "online background remover",
    "transparent PNG maker",
    "photo cutout",
    "image to SVG",
    "vectorize image",
    "image tracing",
    "SVG converter",
    "magic brush background eraser",
    "private background removal",
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Contour",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/favicon.png", width: 512, height: 512, alt: "Contour" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/favicon.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Contour",
  url: SITE_URL,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any (web browser)",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Remove image backgrounds in the browser",
    "Magic erase and restore brushes",
    "Background blur and drop shadow effects",
    "Convert images to SVG vectors",
    "Batch processing and multi-format export",
  ],
  author: { "@type": "Person", name: "Mason Chen", url: "https://github.com/Mason363" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, height: "100%", overflow: "hidden" }}>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </body>
    </html>
  );
}
