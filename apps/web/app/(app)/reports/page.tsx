"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

function localISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date {
  const [y, mo, d] = s.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

function formatRangeLabel(from: string, to: string) {
  try {
    const a = parseISODate(from);
    const b = parseISODate(to);
    const same = from === to;
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    if (same) return a.toLocaleDateString(undefined, opts);
    return `${a.toLocaleDateString(undefined, opts)} → ${b.toLocaleDateString(undefined, opts)}`;
  } catch {
    return `${from} → ${to}`;
  }
}

function statusLabel(key: string) {
  return key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const PAYMENT_TONE: Record<string, string> = {
  CASH: "border-emerald-500/40 bg-emerald-950/35 text-emerald-200",
  CARD: "border-sky-500/40 bg-sky-950/30 text-sky-200",
  UPI: "border-violet-500/40 bg-violet-950/35 text-violet-200",
};

function ReportStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div
      className={`rounded-2xl border-2 p-4 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg ${accent}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 shadow-lg ${className}`}
    >
      <div className="border-b border-[var(--border)] bg-[var(--bg)]/40 px-5 py-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-10 w-48 rounded-lg bg-[var(--surface)]" />
      <div className="h-14 rounded-xl bg-[var(--surface)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[var(--surface)]" />
        ))}
      </div>
      <div className="h-48 rounded-2xl bg-[var(--surface)]" />
    </div>
  );
}

export default function ReportsPage() {
  const today = useMemo(() => localISODate(new Date()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [daily, setDaily] = useState<{ totalSales: number; invoiceCount: number } | null>(null);
  const [orders, setOrders] = useState<{ totalOrders: number; byStatus: Record<string, number> } | null>(
    null
  );
  const [payments, setPayments] = useState<{ byMode: Record<string, number>; paymentCount: number } | null>(
    null
  );
  const [top, setTop] = useState<{ items: { name: string; qty: number; revenue: number }[] } | null>(
    null
  );
  const [tables, setTables] = useState<{ byTable: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      setError(null);
      if (silent) setRefreshing(true);
      else setLoading(true);
      const q = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      try {
        const [d, o, p, t, tw] = await Promise.all([
          api<{ totalSales: number; invoiceCount: number }>(`/reports/daily-sales${q}`),
          api<{ totalOrders: number; byStatus: Record<string, number> }>(`/reports/orders-summary${q}`),
          api<{ byMode: Record<string, number>; paymentCount: number }>(`/reports/payment-summary${q}`),
          api<{ items: { name: string; qty: number; revenue: number }[] }>(`/reports/top-items${q}`),
          api<{ byTable: Record<string, number> }>(`/reports/table-stats${q}`),
        ]);
        setDaily(d);
        setOrders(o);
        setPayments(p);
        setTop(t);
        setTables(tw);
      } catch {
        if (!silent) {
          setDaily(null);
          setOrders(null);
          setPayments(null);
          setTop(null);
          setTables(null);
        }
        setError("Could not load reports. Check dates and try again.");
      } finally {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [from, to]
  );

  useEffect(() => {
    void load({ silent: false });
  }, [load]);

  const rangeLabel = useMemo(() => formatRangeLabel(from, to), [from, to]);

  function applyPreset(key: "today" | "yesterday" | "7d" | "month") {
    const n = new Date();
    const startOfMonth = new Date(n.getFullYear(), n.getMonth(), 1);
    switch (key) {
      case "today":
        setFrom(localISODate(n));
        setTo(localISODate(n));
        break;
      case "yesterday": {
        const y = new Date(n);
        y.setDate(y.getDate() - 1);
        const s = localISODate(y);
        setFrom(s);
        setTo(s);
        break;
      }
      case "7d": {
        const start = new Date(n);
        start.setDate(start.getDate() - 6);
        setFrom(localISODate(start));
        setTo(localISODate(n));
        break;
      }
      case "month":
        setFrom(localISODate(startOfMonth));
        setTo(localISODate(n));
        break;
      default:
        break;
    }
  }

  const paymentTotal = useMemo(() => {
    if (!payments?.byMode) return 0;
    return Object.values(payments.byMode).reduce((a, x) => a + x, 0);
  }, [payments]);

  const sortedTables = useMemo(() => {
    if (!tables?.byTable) return [];
    return Object.entries(tables.byTable).sort((a, b) => b[1] - a[1]);
  }, [tables]);

  if (loading && !daily) {
    return <ReportsSkeleton />;
  }

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">Analytics</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Reports</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Sales, orders, payments, and menu performance for the selected range.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-[var(--accent)] hover:underline lg:shrink-0"
        >
          ← Dashboard
        </Link>
      </header>

      <div className="no-print space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-5 shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Quick range
          </span>
          {(
            [
              ["today", "Today"],
              ["yesterday", "Yesterday"],
              ["7d", "Last 7 days"],
              ["month", "This month"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--muted)]">From</span>
            <input
              type="date"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--muted)]">To</span>
            <input
              type="date"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            disabled={refreshing || loading}
            className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {refreshing ? "Loading…" : "Refresh"}
          </button>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Showing: <span className="font-medium text-[var(--text)]">{rangeLabel}</span>
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/35 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
          <button
            type="button"
            onClick={() => void load({ silent: false })}
            className="ml-3 underline"
          >
            Retry
          </button>
        </div>
      )}

      {daily && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportStat
            label="Paid sales"
            value={`₹${daily.totalSales.toFixed(2)}`}
            sub="Settled invoices in range"
            accent="border-emerald-500/35 bg-emerald-950/25"
          />
          <ReportStat
            label="Paid invoices"
            value={String(daily.invoiceCount)}
            sub="Invoices settled in range"
            accent="border-sky-500/35 bg-sky-950/20"
          />
          <ReportStat
            label="Orders opened"
            value={String(orders?.totalOrders ?? "—")}
            sub="By opened date"
            accent="border-amber-500/35 bg-amber-950/25"
          />
          <ReportStat
            label="Payments total"
            value={`₹${paymentTotal.toFixed(2)}`}
            sub="Sum by mode"
            accent="border-violet-500/35 bg-violet-950/25"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {orders && (
          <SectionCard title="Orders by status" subtitle="Counts for orders opened in this range">
            {Object.keys(orders.byStatus).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No orders in this range.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {Object.entries(orders.byStatus).map(([k, v]) => (
                  <li
                    key={k}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg)]/50 px-3 py-1.5 text-sm"
                  >
                    <span className="font-medium text-[var(--text)]">{statusLabel(k)}</span>
                    <span className="ml-2 tabular-nums text-[var(--muted)]">{v}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}

        {payments && (
          <SectionCard title="Payments by mode" subtitle="Amount collected per mode">
            {Object.keys(payments.byMode).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No payments in this range.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(payments.byMode).map(([mode, amount]) => (
                  <li
                    key={mode}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                      PAYMENT_TONE[mode] ?? "border-[var(--border)] bg-[var(--bg)]/40"
                    }`}
                  >
                    <span className="text-sm font-semibold">{mode}</span>
                    <span className="tabular-nums font-bold text-[var(--text)]">
                      ₹{amount.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {top && (
          <SectionCard title="Top menu items" subtitle="By revenue (non-cancelled lines)">
            {top.items.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No item sales in this range.</p>
            ) : (
              <div className="max-h-[26rem] overflow-y-auto overscroll-contain pr-1">
                <ul className="space-y-2">
                  {top.items.map((r, i) => (
                    <li
                      key={r.name + i}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)]/80 bg-[var(--bg)]/30 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/20 text-xs font-bold text-[var(--accent)]">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium">{r.name}</span>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <div className="font-semibold tabular-nums text-[var(--success)]">
                          ₹{r.revenue.toFixed(2)}
                        </div>
                        <div className="text-[var(--muted)]">{r.qty} qty</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>
        )}

        {tables && (
          <SectionCard title="Orders per table" subtitle="Opened orders in range by table label">
            {sortedTables.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No table activity in this range.</p>
            ) : (
              <ul className="space-y-0"> 
                {sortedTables.map(([label, count]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between gap-3 border-b border-[var(--border)]/60 py-2.5 last:border-0"
                  >
                    <span className="font-medium text-[var(--text)]">{label}</span>
                    <span className="rounded-full bg-[var(--border)]/40 px-2.5 py-0.5 text-sm tabular-nums">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}
