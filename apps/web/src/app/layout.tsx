import type { ReactNode } from "react";

export const metadata = {
  title: "SkillEvalator",
  description: "Skills-based AI Evaluator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fi">
      <body
        style={{
          margin: 0,
          fontFamily: "IBM Plex Sans, Segoe UI, sans-serif",
          background: "#f6f4ef",
          color: "#1a1a1a",
        }}
      >
        <header
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #d9d3c7",
            background: "#efece4",
          }}
        >
          <strong style={{ fontSize: 18 }}>SkillEvalator</strong>
          <nav style={{ display: "inline-flex", gap: 16, marginLeft: 24 }}>
            <a href="/">New run</a>
            <a href="/runs">Runs</a>
            <a href="/dashboard">Dashboard</a>
          </nav>
        </header>
        <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
