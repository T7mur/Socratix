import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Socratix · Catalogue",
  description: "Source-grounded curriculum review for Socratix.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark">S</span>Socratix
          </Link>
          <span className="topbar-note">CURRICULUM WORKSPACE</span>
        </header>
        {children}
        <footer>Human judgement. Traceable learning.</footer>
      </body>
    </html>
  );
}
