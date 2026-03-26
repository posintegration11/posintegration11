"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { POS_SHOW_ENTRY_NOTICE_KEY } from "@/components/AppEntryNotice";
import { LoadingButton } from "@/components/LoadingButton";
import { setSession } from "@/lib/auth";
import { prefetchAllShellRoutes, warmupTenantApis } from "@/lib/tenantWarmup";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{
        token: string;
        user: { id: string; name: string; email: string; role: string; restaurantId: string | null };
      }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setSession(res.token, res.user);
      if (res.user.role === "SUPER_ADMIN") {
        router.replace("/platform");
      } else {
        warmupTenantApis(res.user.role);
        prefetchAllShellRoutes(router);
        try {
          sessionStorage.setItem(POS_SHOW_ENTRY_NOTICE_KEY, "1");
        } catch {
          /* ignore */
        }
        router.replace("/dashboard?signedIn=1");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh min-h-screen items-center justify-center p-4 safe-pt pb-[max(1rem,env(safe-area-inset-bottom))]">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8"
      >
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-[var(--muted)]">
          Staff and restaurant admins sign in here. New restaurant?{" "}
          <Link href="/signup" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
            Create account
          </Link>
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Password</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <LoadingButton
          type="submit"
          loading={loading}
          className="w-full touch-manipulation rounded-xl bg-[var(--accent)] py-4 text-lg font-semibold text-white transition duration-75 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:hover:brightness-100 disabled:active:scale-100"
        >
          Sign in
        </LoadingButton>
        <p className="text-center text-sm text-[var(--muted)]">
          <Link href="/" className="underline-offset-2 hover:underline">
            ← Back to home
          </Link>
        </p>
      </form>
    </div>
  );
}
