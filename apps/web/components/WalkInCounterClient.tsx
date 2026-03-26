"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import type { OrderDetail, TableRow, WalkInTicketRow } from "@/lib/types";

function formatDuration(openedAt: string | null) {
  if (!openedAt) return null;
  const ms = Date.now() - new Date(openedAt).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatOpened(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function ticketState(row: WalkInTicketRow): { label: string; className: string } {
  if (row.status === "CANCELLED") {
    return { label: "Cancelled", className: "text-gray-500" };
  }
  if (row.status === "CLOSED" && row.lastInvoice?.paymentStatus === "PAID") {
    return { label: "Paid", className: "text-emerald-400" };
  }
  if (row.status === "READY_FOR_BILLING") {
    return { label: "Awaiting payment", className: "text-sky-300" };
  }
  return { label: "In progress", className: "text-amber-200" };
}

export function WalkInCounterClient() {
  const router = useRouter();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openBusyId, setOpenBusyId] = useState<string | null>(null);
  const [ticketsByTable, setTicketsByTable] = useState<Record<string, WalkInTicketRow[]>>({});
  const [, setNowTick] = useState(0);

  const load = useCallback(() => {
    void api<TableRow[]>("/tables")
      .then((rows) => {
        setTables(rows);
        setError(null);
      })
      .catch(() => setError("Could not load counter"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const s = getSocket();
    s.auth = { token: typeof window !== "undefined" ? localStorage.getItem("pos_token") : null };
    s.connect();
    const onUpd = () => load();
    s.on("table:updated", onUpd);
    return () => {
      s.off("table:updated", onUpd);
    };
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const walkInTables = useMemo(() => tables.filter((t) => t.isWalkIn), [tables]);

  useEffect(() => {
    if (walkInTables.length === 0) {
      setTicketsByTable({});
      return;
    }
    let alive = true;
    void Promise.all(
      walkInTables.map((t) =>
        api<WalkInTicketRow[]>(`/tables/${t.id}/recent-tickets`)
          .then((rows) => ({ id: t.id, rows }))
          .catch(() => ({ id: t.id, rows: [] as WalkInTicketRow[] })),
      ),
    ).then((pairs) => {
      if (!alive) return;
      const next: Record<string, WalkInTicketRow[]> = {};
      for (const { id, rows } of pairs) next[id] = rows;
      setTicketsByTable(next);
    });
    return () => {
      alive = false;
    };
  }, [walkInTables]);

  async function openCounter(t: TableRow) {
    setError(null);
    setOpenBusyId(t.id);
    try {
      const order = await api<OrderDetail>(`/tables/${t.id}/orders`, { method: "POST", body: "{}" });
      router.push(`/tables/${t.id}/order?orderId=${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open counter");
    } finally {
      setOpenBusyId(null);
    }
  }

  function continueHref(t: TableRow): string | null {
    if (!t.activeOrderId) return null;
    const role = getUser()?.role;
    const billFirst =
      (role === "CASHIER" || role === "ADMIN") && t.status === "BILLING_PENDING" && t.activeOrderId;
    if (billFirst) return `/billing/${t.activeOrderId}`;
    return `/tables/${t.id}/order?orderId=${t.activeOrderId}`;
  }

  if (loading && tables.length === 0) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  if (walkInTables.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] py-12 text-center text-sm text-[var(--muted)]">
        No walk-in counter configured. Add a walk-in table in your seed / database.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Walk-in</h1>
          <p className="text-sm text-[var(--muted)]">
            Continue the open ticket (totals stay with the order). Start a new one only after billing or closing the
            current order.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] active:scale-[0.98]"
        >
          Refresh
        </button>
      </header>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        {walkInTables.map((t) => {
          const role = getUser()?.role;
          const busy = openBusyId === t.id;
          const href = continueHref(t);
          const hasActive = Boolean(t.activeOrderId && href);
          const continueBilling =
            t.status === "BILLING_PENDING" && (role === "CASHIER" || role === "ADMIN");

          return (
            <div
              key={t.id}
              className="relative overflow-hidden rounded-2xl border-2 border-violet-400/50 bg-gradient-to-br from-violet-950/50 to-[var(--surface)] p-6 shadow-lg shadow-violet-900/25 transition hover:-translate-y-0.5 hover:shadow-xl sm:min-w-[min(100%,360px)] sm:flex-1"
            >
              <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-violet-500/10 blur-2xl" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 11V7a4 4 0 00-8 0v4M8 11h8m-8 0v6a2 2 0 002 2h4a2 2 0 002-2v-6"
                        />
                      </svg>
                    </span>
                    <div>
                      <div className="text-lg font-bold text-[var(--text)]">{t.name ?? "Walk-in"}</div>
                      <div className="text-sm text-[var(--muted)]">
                        Counter ·{" "}
                        {hasActive ? (
                          <>
                            <span className="text-[var(--text)]">Open ticket</span>
                            {t.activeTotal > 0 && (
                              <span className="text-[var(--success)]"> · ₹{t.activeTotal.toFixed(2)}</span>
                            )}
                          </>
                        ) : (
                          "No open order — start when ready"
                        )}
                      </div>
                    </div>
                  </div>
                  {t.openedAt && (
                    <p className="text-xs text-[var(--muted)]">{formatDuration(t.openedAt)} since last activity</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  {hasActive && href ? (
                    <Link
                      href={href}
                      prefetch
                      className="inline-flex touch-manipulation items-center justify-center rounded-xl bg-violet-500 px-6 py-3.5 text-center text-sm font-semibold text-white shadow-md shadow-violet-900/40 transition hover:brightness-110 active:scale-[0.98]"
                    >
                      {continueBilling ? "Continue billing" : "Continue order"}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || loading || hasActive}
                    title={
                      hasActive
                        ? "Bill or close the current ticket first"
                        : "Start a new walk-in order"
                    }
                    onClick={() => void openCounter(t)}
                    className="inline-flex touch-manipulation items-center justify-center rounded-xl border border-violet-500/50 bg-violet-950/30 px-6 py-3 text-center text-sm font-semibold text-violet-100 transition hover:bg-violet-950/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Opening…
                      </span>
                    ) : (
                      "Start walk-in order"
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {walkInTables.map((t) => {
        const rows = ticketsByTable[t.id];
        const role = getUser()?.role;
        const canBill = role === "ADMIN" || role === "CASHIER";

        if (rows === undefined) {
          return (
            <section key={`tickets-${t.id}`} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Recent tickets · {t.name ?? "Walk-in"}
              </h2>
              <p className="text-xs text-[var(--muted)]">Loading ticket history…</p>
            </section>
          );
        }

        if (rows.length === 0) {
          return (
            <section key={`tickets-${t.id}`} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Recent tickets · {t.name ?? "Walk-in"}
              </h2>
              <p className="text-xs text-[var(--muted)]">No tickets on this counter yet.</p>
            </section>
          );
        }

        return (
          <section key={`tickets-${t.id}`} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Recent tickets · {t.name ?? "Walk-in"}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              <span className="text-amber-200/90">In progress / awaiting payment</span> vs{" "}
              <span className="text-emerald-400/90">Paid</span> (last 40 on this counter).
            </p>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--bg)]/50 text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Order</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                    <th className="px-3 py-2 font-semibold">Opened</th>
                    <th className="px-3 py-2 font-semibold">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const st = ticketState(row);
                    const isPaid = st.label === "Paid";
                    const isClosed = row.status === "CLOSED";
                    const orderHref = `/tables/${t.id}/order?orderId=${row.id}`;
                    const billHref = `/billing/${row.id}`;

                    let action: { href: string; label: string } | null = null;
                    if (isPaid || row.status === "CANCELLED") {
                      if (canBill && isPaid) action = { href: billHref, label: "Receipt" };
                    } else if (row.status === "READY_FOR_BILLING") {
                      action = canBill
                        ? { href: billHref, label: "Bill" }
                        : { href: orderHref, label: "Order" };
                    } else if (!isClosed) {
                      action = { href: orderHref, label: "Order" };
                    } else if (canBill) {
                      action = { href: billHref, label: "View" };
                    }

                    return (
                      <tr key={row.id} className="border-b border-[var(--border)]/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{row.orderNumber}</td>
                        <td className={`px-3 py-2 text-xs font-medium ${st.className}`}>{st.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">₹{Number(row.grandTotal).toFixed(2)}</td>
                        <td className="px-3 py-2 text-xs text-[var(--muted)]">{formatOpened(row.openedAt)}</td>
                        <td className="px-3 py-2">
                          {action ? (
                            <Link
                              href={action.href}
                              prefetch
                              className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                            >
                              {action.label}
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
