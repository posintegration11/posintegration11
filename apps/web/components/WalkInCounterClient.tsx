"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { LoadingButton } from "@/components/LoadingButton";
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

/** If the table has an active order that recent-tickets missed, surface it as a row. */
function mergeActiveTicket(t: TableRow, rows: WalkInTicketRow[]): WalkInTicketRow[] {
  if (!t.activeOrderId || rows.some((r) => r.id === t.activeOrderId)) return rows;
  const status = t.status === "BILLING_PENDING" ? "READY_FOR_BILLING" : "RUNNING";
  const synthetic: WalkInTicketRow = {
    id: t.activeOrderId,
    orderNumber: `·${t.activeOrderId.slice(-6).toUpperCase()}`,
    status,
    openedAt: t.openedAt ?? new Date().toISOString(),
    closedAt: null,
    grandTotal: String(t.activeTotal ?? 0),
    lastInvoice: null,
  };
  return [synthetic, ...rows];
}

function isOpenTicket(r: WalkInTicketRow): boolean {
  if (r.status === "CANCELLED") return false;
  if (r.status === "CLOSED" && r.lastInvoice?.paymentStatus === "PAID") return false;
  return true;
}

function ticketPrimaryAction(
  t: TableRow,
  row: WalkInTicketRow,
  canBill: boolean,
): { href: string; label: string } | null {
  const st = ticketState(row);
  const isPaid = st.label === "Paid";
  const isClosed = row.status === "CLOSED";
  const orderHref = `/tables/${t.id}/order?orderId=${row.id}`;
  const billHref = `/billing/${row.id}`;

  if (isPaid) return canBill ? { href: billHref, label: "Receipt" } : null;
  if (row.status === "CANCELLED") return null;
  if (row.status === "READY_FOR_BILLING") {
    return canBill ? { href: billHref, label: "Continue billing" } : { href: orderHref, label: "Continue order" };
  }
  if (!isClosed) return { href: orderHref, label: "Continue order" };
  if (canBill) return { href: billHref, label: "View" };
  return null;
}

function ticketCardBorder(row: WalkInTicketRow): string {
  if (row.status === "CANCELLED") return "border-gray-600/40";
  if (row.status === "READY_FOR_BILLING") return "border-sky-500/35";
  if (row.status === "CLOSED" && row.lastInvoice?.paymentStatus === "PAID") {
    return "border-emerald-600/30";
  }
  return "border-amber-500/35";
}

export function WalkInCounterClient() {
  const router = useRouter();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openBusyId, setOpenBusyId] = useState<string | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [ticketsByTable, setTicketsByTable] = useState<Record<string, WalkInTicketRow[]>>({});
  const [, setNowTick] = useState(0);

  const fetchTables = useCallback(() => {
    return api<TableRow[]>("/tables")
      .then((r) => {
        setTables(r);
        setError(null);
      })
      .catch(() => setError("Could not load counter"));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    void fetchTables().finally(() => setLoading(false));
  }, [fetchTables]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const s = getSocket();
    s.auth = { token: typeof window !== "undefined" ? localStorage.getItem("pos_token") : null };
    s.connect();
    const onUpd = () => void fetchTables();
    s.on("table:updated", onUpd);
    return () => {
      s.off("table:updated", onUpd);
    };
  }, [fetchTables]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const walkInTables = useMemo(() => tables.filter((x) => x.isWalkIn), [tables]);

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
            Open tickets appear below with actions. Start a new order only after the current one is billed or closed.
          </p>
        </div>
        <LoadingButton
          type="button"
          loading={refreshBusy}
          onClick={() => {
            setRefreshBusy(true);
            void fetchTables().finally(() => setRefreshBusy(false));
          }}
          className="self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] active:scale-[0.98]"
        >
          Refresh
        </LoadingButton>
      </header>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        {walkInTables.map((t) => {
          const busy = openBusyId === t.id;
          const hasActive = Boolean(t.activeOrderId);

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
                  <LoadingButton
                    type="button"
                    loading={busy}
                    disabled={loading || hasActive}
                    title={
                      hasActive ? "Bill or close the current ticket first (see cards below)" : "Start a new walk-in order"
                    }
                    onClick={() => void openCounter(t)}
                    className="inline-flex touch-manipulation items-center justify-center rounded-xl bg-violet-500 px-6 py-3.5 text-center text-sm font-semibold text-white shadow-md shadow-violet-900/40 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
                  >
                    Start walk-in order
                  </LoadingButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {walkInTables.map((t) => {
        const rawRows = ticketsByTable[t.id];
        const role = getUser()?.role;
        const canBill = role === "ADMIN" || role === "CASHIER";

        if (rawRows === undefined) {
          return (
            <section key={`tickets-${t.id}`} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Tickets · {t.name ?? "Walk-in"}
              </h2>
              <p className="text-xs text-[var(--muted)]">Loading…</p>
            </section>
          );
        }

        const rows = mergeActiveTicket(t, rawRows);
        const sorted = [...rows].sort(
          (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
        );
        const openRows = sorted.filter(isOpenTicket);
        const doneRows = sorted.filter((r) => !isOpenTicket(r));

        return (
          <section key={`tickets-${t.id}`} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Tickets · {t.name ?? "Walk-in"}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              <span className="text-amber-200/90">In progress</span> /{" "}
              <span className="text-sky-300/90">Awaiting payment</span> — use the buttons on each card. Completed sales
              are listed below.
            </p>

            {openRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/30 px-4 py-6 text-center text-sm text-[var(--muted)]">
                No open tickets on this counter. Tap <span className="text-[var(--text)]">Start walk-in order</span>{" "}
                above when you are ready.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {openRows.map((row) => {
                  const st = ticketState(row);
                  const action = ticketPrimaryAction(t, row, canBill);
                  const dur = formatDuration(row.openedAt);
                  return (
                    <div
                      key={row.id}
                      className={`relative overflow-hidden rounded-2xl border-2 bg-gradient-to-br from-[var(--surface)] to-[var(--bg)] p-4 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg ${ticketCardBorder(row)}`}
                    >
                      <div className="flex flex-col gap-3 sm:min-h-[140px] sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-mono text-sm font-semibold text-[var(--text)]">{row.orderNumber}</span>
                            <span className={`text-xs font-medium ${st.className}`}>{st.label}</span>
                          </div>
                          <p className="text-lg font-semibold tabular-nums text-[var(--text)]">
                            ₹{Number(row.grandTotal).toFixed(2)}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            Opened {formatOpened(row.openedAt)}
                            {dur ? ` · ${dur} ago` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                          {action ? (
                            <Link
                              href={action.href}
                              prefetch
                              className="inline-flex touch-manipulation items-center justify-center rounded-xl bg-violet-500 px-5 py-3 text-center text-sm font-semibold text-white shadow-md shadow-violet-900/40 transition hover:brightness-110 active:scale-[0.98]"
                            >
                              {action.label}
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">No action</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {doneRows.length > 0 ? (
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Completed · last {doneRows.length} on this counter
                </h3>
                <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="border-b border-[var(--border)] bg-[var(--bg)]/50 text-xs uppercase tracking-wide text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Order</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 text-right font-semibold">Total</th>
                        <th className="px-3 py-2 font-semibold">Opened</th>
                        <th className="px-3 py-2 font-semibold">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doneRows.map((row) => {
                        const st = ticketState(row);
                        const billHref = `/billing/${row.id}`;
                        return (
                          <tr key={row.id} className="border-b border-[var(--border)]/60 last:border-0">
                            <td className="px-3 py-2 font-mono text-xs">{row.orderNumber}</td>
                            <td className={`px-3 py-2 text-xs font-medium ${st.className}`}>{st.label}</td>
                            <td className="px-3 py-2 text-right tabular-nums">₹{Number(row.grandTotal).toFixed(2)}</td>
                            <td className="px-3 py-2 text-xs text-[var(--muted)]">{formatOpened(row.openedAt)}</td>
                            <td className="px-3 py-2">
                              {canBill && st.label === "Paid" ? (
                                <Link
                                  href={billHref}
                                  prefetch
                                  className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                                >
                                  Open
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
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
