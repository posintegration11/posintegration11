"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { LoadingButton } from "@/components/LoadingButton";

export default function SignupPage() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState("");
  const [address, setAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api<{ ok: boolean }>("/auth/register-tenant", {
        method: "POST",
        body: JSON.stringify({
          restaurantName,
          address,
          adminName,
          email,
          password,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 space-y-4">
          <h1 className="text-xl font-semibold">Check your email</h1>
          <p className="text-sm text-[var(--muted)]">
            We sent a verification link to <span className="text-[var(--text)]">{email}</span>. Open it to activate your
            restaurant and then sign in.
          </p>
          <Link href="/login" className="inline-block font-medium text-[var(--accent)] underline-offset-2 hover:underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8"
      >
        <h1 className="text-2xl font-semibold">Create your restaurant</h1>
        <p className="text-sm text-[var(--muted)]">
          You’ll be the admin. After verifying your email you can invite staff.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Restaurant name</span>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Address (optional)</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Your name</span>
          <input
            required
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            required
            type="email"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Password (min 8 characters)</span>
          <input
            required
            type="password"
            minLength={8}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <LoadingButton
          type="submit"
          loading={loading}
          className="w-full rounded-xl bg-[var(--accent)] py-3.5 font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          Create account
        </LoadingButton>
        <p className="text-center text-sm text-[var(--muted)]">
          <button type="button" onClick={() => router.push("/login")} className="hover:underline">
            Already registered? Sign in
          </button>
        </p>
      </form>
    </div>
  );
}
