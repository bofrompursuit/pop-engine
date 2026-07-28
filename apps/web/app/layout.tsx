import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "PopEngine",
  description: "Synthetic-data demo, access-gated (AD-12).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* docs/DESIGN-SYSTEM.md's typography: Inter for headers/body, JetBrains Mono for
            metadata chips. Plain <link>s rather than next/font/google — this app stays plain
            CSS (the doc's own note), and next/font needs Next's build-time compiler, which the
            vitest suite that renders this layout does not have. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
