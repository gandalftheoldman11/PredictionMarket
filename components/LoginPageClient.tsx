"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import styles from "./LoginPageClient.module.css";

function safeNextPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  const base = new URL("https://redline.invalid/");
  const target = new URL(value, base);
  return target.origin === base.origin
    ? `${target.pathname}${target.search}${target.hash}`
    : "/";
}

/** Deep-link fallback — in-app sign-in happens in the modal. */
function LoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));

  return (
    <section className={styles.panel}>
      <LoginForm
        onSuccess={() => {
          router.push(next);
          router.refresh();
        }}
      />
    </section>
  );
}

export default function LoginPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={(
        <section className={styles.panel} aria-label="Loading sign-in" aria-busy="true">
          <div className={styles.formSkeleton} aria-hidden="true"><span /><span /><span /></div>
        </section>
      )}>
        <LoginPageInner />
      </Suspense>
    </div>
  );
}
