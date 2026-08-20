import type { Metadata } from "next";
import PortfolioPageClient from "@/components/PortfolioPageClient";

export const metadata: Metadata = { title: "Portfolio — TRADEWAR" };

export default function PortfolioPage() {
  return <PortfolioPageClient />;
}
