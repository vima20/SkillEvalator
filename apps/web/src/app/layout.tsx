import type { ReactNode } from "react";
import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";
import { AuthGate } from "@/components/AuthGate";
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
  title: "Unikie SkillEvalator",
  description: "Skills-based AI evaluator for Unikie engineering teams",
};

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d="M11 2.2 19.5 18.2H2.5L11 2.2Z"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M11 7.4 15.6 16.2H6.4L11 7.4Z" fill="white" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${space.variable}`}>
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/" aria-label="Unikie SkillEvalator home">
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
          <main className="main">
            <AuthGate>{children}</AuthGate>
          </main>
        </div>
      </body>
    </html>
  );
}
