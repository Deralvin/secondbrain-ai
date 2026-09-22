import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Shared work memory across projects",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="shell-header">
          <div className="header-inner">
            <Link href="/" className="brand"><span className="brand-mark">✦</span>Second Brain</Link>
            <nav className="nav"><Link href="/">Dashboard</Link><Link href="/graph">Knowledge Graph</Link></nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
