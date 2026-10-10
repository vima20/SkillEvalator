import type { ReactNode } from "react";
import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
});

export const metadata = {
  title: "SkillEvalator · Unikie",
  description: "Skills-based AI evaluator for Unikie engineering teams",
};

function BrandMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 1.5 16.5 15H1.5L9 1.5Z"
        fill="none"
        stroke="white"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 6.2 13.2 13.5H4.8L9 6.2Z" fill="white" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fi" className={`${manrope.variable} ${space.variable}`}>
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="brand-mark">
                <BrandMark />
              </span>
              <span className="brand-copy">
                <span className="brand-org">Unikie</span>
                <span className="brand-product">SkillEvalator</span>
              </span>
            </Link>
            <Nav />
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
