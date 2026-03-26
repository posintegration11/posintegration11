"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("err");
      setMessage("Missing verification token.");
      return;
    }
    void api("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        setStatus("ok");
        setMessage("Your email is verified. Redirecting to sign in…");
        window.setTimeout(() => router.replace("/login"), 2000);
      })
      .catch((e) => {
        setStatus("err");
        setMessage(e instanceof Error ? e.message : "Verification failed");
      });
  }, [token, router]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 space-y-4 text-center">
        {status === "loading" && <p className="text-[var(--muted)]">Verifying…</p>}
        {status !== "loading" && (
          <>
            <p className={status === "ok" ? "text-emerald-400" : "text-red-400"}>{message}</p>
            {status === "err" && (
              <Link href="/login" className="inline-block font-medium text-[var(--accent)] hover:underline">
                Go to sign in
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-16 text-center text-[var(--muted)]">Loading…</div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
