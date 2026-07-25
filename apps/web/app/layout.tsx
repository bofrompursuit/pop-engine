import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "PopEngine",
  description: "Synthetic-data demo, access-gated (AD-12).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
