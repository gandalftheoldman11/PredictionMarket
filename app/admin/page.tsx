import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageClient from "@/components/AdminPageClient";
import { adminAuthorization } from "@/lib/exchange/adminAuth";

export const metadata: Metadata = { title: "Resolution console — TRADEWAR" };

export default async function AdminPage() {
  const authorization = await adminAuthorization();
  if (authorization === "unauthenticated") redirect("/login?next=/admin");
  if (authorization === "forbidden") redirect("/");

  return <AdminPageClient />;
}
