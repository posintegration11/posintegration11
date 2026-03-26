"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { LoadingButton } from "@/components/LoadingButton";

export default function DemoPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/demo-requests", {
        method: "POST",
        body: JSON.stringify({
          email,
          name: name || undefined,
          restaurantName: restaurantName || undefined,
          message: message || undefined,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 space-y-2">
          <h1 className="text-xl font-semibold">Thanks</h1>
          <p className="text-sm text-[var(--muted)]">We received your request and will reach out shortly.</p>
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
        <h1 className="text-2xl font-semibold">Request a demo</h1>
        <p className="text-sm text-[var(--muted)]">Tell us how to reach you. Prefer to try on your own? Use Get started.</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Work email</span>
          <input
            required
            type="email"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Your name</span>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Restaurant name</span>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Message (optional)</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <LoadingButton
          type="submit"
          loading={loading}
          className="w-full rounded-xl bg-[var(--accent)] py-3.5 font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          Submit
        </LoadingButton>
      </form>
    </div>
  );
}
