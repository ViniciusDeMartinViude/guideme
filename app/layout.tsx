import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Holiday Planner Bot",
  description: "Telegram group holiday advisor — dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/">🌴 Holiday Planner Bot</a>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
