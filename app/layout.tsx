import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import LoginModal from "@/components/LoginModal";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import Ticker from "@/components/Ticker";
import styles from "./layout.module.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-ui",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const themeBootstrap = `
  (function () {
    var stored = null;
    try {
      stored = window.localStorage.getItem("tradewar-color-theme");
    } catch (_) {}
    var theme = stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  })();
`;

export const metadata: Metadata = {
  title: "TRADEWAR — prediction markets for real-world events",
  description:
    "Trade event outcomes on a live order book and follow market-implied probabilities in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${archivo.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className={styles.shell}>
        <Script
          id="tradewar-color-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
        />
        <SiteHeader />
        <Ticker />
        <LoginModal />
        <main className={styles.main}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
