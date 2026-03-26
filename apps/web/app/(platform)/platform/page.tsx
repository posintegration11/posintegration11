"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { clearSession, getToken, getUser, setSession, type AuthUser } from "@/lib/auth";

type Row = {
  id: string;
  name: string;
  address: string;
  status: string;
  createdAt: string;
  displayName: string;
  userCount: number;
};

export default function PlatformAdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    void api<{ restaurants: Row[] }>("/platform/restaurants")
      .then((r) => {
        setRows(r.restaurants);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setRows([]);
      });
  }, []);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    void api<{
      id: string;
      name: string;
      email: string;
      role: string;
      restaurantId: string | null;
    }>("/auth/me")
      .then((me) => {
        if (me.role !== "SUPER_ADMIN") {
          router.replace("/dashboard");
          return;
        }
        const u: AuthUser = {
          id: me.id,
          name: me.name,
          email: me.email,
          role: me.role,
          restaurantId: me.restaurantId,
        };
        setSession(t, u);
        setUser(u);
        load();
      })
      .catch(() => {
        clearSession();
        router.replace("/login");
      });
  }, [router, load]);

  async function setStatus(id: string, status: "ACTIVE" | "SUSPENDED") {
    setBusyId(id);
    setError(null);
    try {
      await api(`/platform/restaurants/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Platform admin</h1>
          <p className="text-sm text-[var(--muted)]">Restaurants on this deployment ({rows?.length ?? "…"})</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => load()}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-[var(--accent)]"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              clearSession();
              router.replace("/login");
            }}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}

      {rows === null ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[var(--muted)]">No restaurants yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Restaurant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)]/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.displayName}</div>
                    <div className="text-xs text-[var(--muted)]">{r.address || "—"}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.status}</td>
                  <td className="px-4 py-3 tabular-nums">{r.userCount}</td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "SUSPENDED" ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void setStatus(r.id, "ACTIVE")}
                        className="text-xs font-semibold text-emerald-400 hover:underline disabled:opacity-50"
                      >
                        Activate
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void setStatus(r.id, "SUSPENDED")}
                        className="text-xs font-semibold text-amber-300 hover:underline disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        <Link href="/" className="hover:underline">
          Marketing home
        </Link>
      </p>
    </div>
  );
}
