"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HeaderProfile } from "@/components/HeaderProfile";
import { LoadingButton } from "@/components/LoadingButton";
import { api } from "@/lib/api";
import { clearSession, getUser, type AuthUser } from "@/lib/auth";
import { reconnectSocket } from "@/lib/socket";
import type { RestaurantSettings } from "@/lib/types";

type Overview = {
  salesToday: number;
  invoicesPaidToday: number;
  activeOrders: number;
  occupiedTables: number;
  recentInvoices: {
    id: string;
    invoiceNumber: string;
    grandTotal: string;
    paymentStatus: string;
    createdAt: string;
    /** When payment was recorded (for “today” = your local calendar day). */
    settledAt?: string;
    order: {
      id: string;
      table: { tableNumber: number; name?: string | null; isWalkIn?: boolean };
    };
  }[];
};

type TopItemRow = { name: string; qty: number; revenue: number };

function localCalendarDayQuery() {
  const n = new Date();
  const from = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
  const to = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
  return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: string;
  icon: ReactNode;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border-2 p-5 shadow-lg transition duration-75 hover:-translate-y-1 hover:shadow-xl active:scale-[0.99] ${accent}`}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 size-28 rounded-full bg-white/5 blur-2xl transition group-hover:bg-white/10" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</div>
          <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-[var(--text)]">{value}</div>
          {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
        </div>
        <div className="grid shrink-0 size-11 place-content-center rounded-xl bg-black/20 text-[var(--text)]">{icon}</div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-10 w-64 rounded-lg bg-[var(--surface)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[var(--surface)]" />
        ))}
      </div>
      <div className="h-48 rounded-2xl bg-[var(--surface)]" />
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [topItems, setTopItems] = useState<TopItemRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<AuthUser | null>(() => getUser());
  const [shopSettings, setShopSettings] = useState<RestaurantSettings | null>(null);

  const load = useCallback((opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    setError(null);
    if (silent) setRefreshing(true);
    else setLoading(true);
    const dayQ = localCalendarDayQuery();
    void Promise.all([
      api<Overview>(`/reports/overview?${dayQ}`),
      api<{ items: TopItemRow[] }>(`/reports/top-items?${dayQ}`).catch(() => ({
        items: [] as TopItemRow[],
      })),
    ])
      .then(([overview, top]) => {
        setData(overview);
        setTopItems(top.items.slice(0, 6));
      })
      .catch(() => {
        if (!silent) setData(null);
        if (!silent) setTopItems(null);
        setError("Could not load dashboard");
      })
      .finally(() => {
        if (silent) setRefreshing(false);
        else setLoading(false);
      });
  }, []);

  useEffect(() => {
    const u = getUser();
    if (u?.role === "KITCHEN") {
      router.replace("/kitchen");
      return;
    }
    if (u?.role === "WAITER") {
      router.replace("/tables");
      return;
    }
    load();
    void api<AuthUser>("/auth/me").then(setProfileUser);
    void api<RestaurantSettings>("/settings")
      .then(setShopSettings)
      .catch(() => setShopSettings(null));
  }, [router, load]);

  function logout() {
    clearSession();
    reconnectSocket();
    router.replace("/login");
  }

  useEffect(() => {
    const id = window.setInterval(() => load({ silent: true }), 120_000);
    return () => window.clearInterval(id);
  }, [load]);

  const user = getUser();
  const firstName = user?.name?.split(/\s+/)[0] ?? "there";
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="space-y-4 rounded-2xl border border-red-500/30 bg-red-950/25 p-8">
        <p className="text-red-300">{error}</p>
        <LoadingButton
          type="button"
          loading={loading}
          onClick={() => load({ silent: false })}
          className="rounded-xl bg-[var(--accent)] px-4 py-2 font-medium text-white"
        >
          Retry
        </LoadingButton>
      </div>
    );
  }

  if (!data) {
    return <p className="text-[var(--muted)]">Loading dashboard…</p>;
  }

  function tableLabel(inv: Overview["recentInvoices"][0]) {
    const t = inv.order.table;
    if (t.isWalkIn || t.tableNumber === 0) return t.name?.trim() || "Walk-in";
    return `Table ${t.tableNumber}`;
  }

  function statusClass(status: string) {
    if (status === "PAID") return "bg-emerald-500/20 text-emerald-300";
    if (status === "UNPAID") return "bg-amber-500/20 text-amber-200";
    return "bg-[var(--border)] text-[var(--muted)]";
  }

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">{todayLabel}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--text)]">
            Hello, {firstName}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Today uses your device&apos;s date. Sales and paid counts follow <strong className="text-[var(--text)]">payment</strong> time, not
            invoice draft time. Refreshes every 2 minutes.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LoadingButton
            type="button"
            onClick={() => load({ silent: true })}
            loading={refreshing}
            disabled={loading}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium transition hover:border-[var(--accent)] disabled:opacity-50"
          >
            Refresh
          </LoadingButton>
          <Link
            href="/tables"
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Tables
          </Link>
          <Link
            href="/reports"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--border)]/40"
          >
            Reports
          </Link>
          {profileUser ? (
            <HeaderProfile
              user={profileUser}
              settings={shopSettings}
              onSettingsChange={setShopSettings}
              onLogout={logout}
            />
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sales today (paid)"
          value={`₹${data.salesToday.toFixed(2)}`}
          hint="Sum of payments taken today"
          accent="border-emerald-500/40 bg-emerald-950/25 shadow-emerald-950/20"
          icon={
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2 0-4 1.2-4 3v1h8v-1c0-1.8-2-3-4-3zm-6 8h12M6 12H4a2 2 0 00-2 2v2h20v-2a2 2 0 00-2-2h-2" />
            </svg>
          }
        />
        <StatCard
          label="Paid invoices"
          value={String(data.invoicesPaidToday)}
          hint="Invoices settled today (by payment)"
          accent="border-sky-500/35 bg-sky-950/20 shadow-sky-950/15"
          icon={
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard
          label="Active orders"
          value={String(data.activeOrders)}
          hint="Open through billing"
          accent="border-amber-500/40 bg-amber-950/25 shadow-amber-950/15"
          icon={
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          }
        />
        <StatCard
          label="Busy tables"
          value={String(data.occupiedTables)}
          hint="Dine-in in use (walk-in counter excluded)"
          accent="border-violet-500/35 bg-violet-950/30 shadow-violet-950/20"
          icon={
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 17a1 1 0 011-1h14a1 1 0 011 1v2H4v-2z" />
            </svg>
          }
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Recent settled</h2>
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Paid today</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 shadow-lg">
            {data.recentInvoices.length === 0 ? (
              <p className="p-10 text-center text-sm text-[var(--muted)]">No payments recorded yet today.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--border)] bg-[var(--bg)]/50 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Where</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {data.recentInvoices.map((inv) => (
                      <tr key={inv.id} className="transition hover:bg-[var(--bg)]/30">
                        <td className="px-4 py-3">
                          <Link
                            href={`/billing/${inv.order.id}`}
                            className="font-mono font-medium text-[var(--accent)] hover:underline"
                          >
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[var(--text)]">
                          <span className="inline-flex items-center gap-1.5">
                            {tableLabel(inv)}
                            {(inv.order.table.isWalkIn || inv.order.table.tableNumber === 0) && (
                              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-200">
                                Counter
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--success)]">
                          ₹{Number(inv.grandTotal).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(inv.paymentStatus)}`}>
                            {inv.paymentStatus.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--muted)] hidden sm:table-cell">
                          {new Date(inv.settledAt ?? inv.createdAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Top items (paid today)</h2>
            <Link href="/reports" className="text-xs font-medium text-[var(--accent)] hover:underline">
              All reports
            </Link>
          </div>
          <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-4 shadow-lg">
            {!topItems || topItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">No items on bills paid today yet.</p>
            ) : (
              <ul className="space-y-3">
                {topItems.map((row, i) => (
                  <li
                    key={row.name + i}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)]/80 bg-[var(--bg)]/30 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/20 text-xs font-bold text-[var(--accent)]">
                        {i + 1}
                      </span>
                      <span className="truncate font-medium">{row.name}</span>
                    </div>
                    <div className="shrink-0 text-right text-xs text-[var(--muted)]">
                      <div className="font-semibold tabular-nums text-[var(--success)]">
                        ₹{row.revenue.toFixed(0)}
                      </div>
                      <div>{row.qty} sold</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
