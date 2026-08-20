import type { Metadata } from "next";
import LoginPageClient from "@/components/LoginPageClient";

export const metadata: Metadata = { title: "Sign in — TRADEWAR" };

export default function LoginPage() {
  return <LoginPageClient />;
}
