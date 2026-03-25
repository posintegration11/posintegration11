"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import type { TableRow } from "@/lib/types";

function statusStyle(status: string, highlight = false) {
  if (highlight) {
    return "border-violet-400/50 bg-gradient-to-br from-violet-950/50 to-[var(--surface)] shadow-violet-900/25";
  }
  return (
    {
      FREE: "border-emerald-500/45 bg-emerald-950/35 shadow-emerald-900/20",
      OCCUPIED: "border-amber-500/45 bg-amber-950/35 shadow-amber-900/20",
      BILLING_PENDING: "border-sky-500/45 bg-sky-950/35 shadow-sky-900/15",
    }[status] ?? "border-[var(--border)] bg-[var(--surface)] shadow-black/20"
  );
}

function formatDuration(openedAt: string | null) {
  if (!openedAt) return null;
  const ms = Date.now() - new Date(openedAt).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function TableCardSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60"
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </>
  );
}

export default function TablesPage() {
  const router = useRouter();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [walkInBusyId, setWalkInBusyId] = useState<string | null>(null);
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const [, setNowTick] = useState(0);

  const load = useCallback(() => {
    void api<TableRow[]>("/tables")
      .then((rows) => {
        setTables(rows);
        setLoadError(null);
      })
      .catch(() => setLoadError("Could not refresh tables"))
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

  const { walkInTables, floorTables } = useMemo(() => {
    const walkIn: TableRow[] = [];
    const fl: TableRow[] = [];
    for (const t of tables) {
      if (t.isWalkIn) walkIn.push(t);
      else fl.push(t);
    }
    return { walkInTables: walkIn, floorTables: fl };
  }, [tables]);

  async function startWalkIn(t: TableRow) {
    setWalkInError(null);
    setWalkInBusyId(t.id);
    try {
      const created = await api<{ id: string }>(`/tables/${t.id}/orders`, { method: "POST" });
      router.push(`/tables/${t.id}/order?orderId=${created.id}`);
    } catch (e) {
      setWalkInError(e instanceof Error ? e.message : "Could not start order");
    } finally {
      setWalkInBusyId(null);
    }
  }

  return (
    <div className="space-y-8 pb-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tables</h1>
          <p className="text-sm text-[var(--muted)]">Dine-in floor and counter — tap a table to open or continue an order.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-[var(--surface)]/80 active:scale-[0.98]"
        >
          Refresh
        </button>
      </header>

      {loadError && (
        <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">{loadError}</p>
      )}
      {walkInError && (
        <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">{walkInError}</p>
      )}

      {walkInTables.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Counter & walk-in</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            {walkInTables.map((t) => {
              const busy = walkInBusyId === t.id;
              return (
                <div
                  key={t.id}
                  className={`relative overflow-hidden rounded-2xl border-2 p-6 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl sm:min-w-[min(100%,320px)] sm:flex-1 ${statusStyle(t.status, true)}`}
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
                            Quick counter · new order every tap
                            {t.activeTotal > 0 && (
                              <span className="text-[var(--success)]"> · ₹{t.activeTotal.toFixed(2)} recent</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {t.openedAt && (
                        <p className="text-xs text-[var(--muted)]">{formatDuration(t.openedAt)} since last activity</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={busy || loading}
                      onClick={() => void startWalkIn(t)}
                      className="relative shrink-0 rounded-xl bg-violet-500 px-6 py-3.5 text-center text-sm font-semibold text-white shadow-md shadow-violet-900/40 transition enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Opening…
                        </span>
                      ) : (
                        "New walk-in order"
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(floorTables.length > 0 || loading || walkInTables.length === 0) && (
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Dine-in</h2>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {loading && tables.length === 0 ? (
            <TableCardSkeleton count={10} />
          ) : (
            floorTables.map((t) => {
              const role = getUser()?.role;
              const billFirst =
                (role === "CASHIER" || role === "ADMIN") &&
                t.status === "BILLING_PENDING" &&
                t.activeOrderId;
              const href = billFirst ? `/billing/${t.activeOrderId}` : `/tables/${t.id}/order`;
              return (
                <Link
                  key={t.id}
                  href={href}
                  prefetch
                  className={`group block rounded-2xl border-2 p-5 shadow-md transition duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-[0.99] ${statusStyle(t.status)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xl font-bold tracking-tight">Table {t.tableNumber}</div>
                    <span className="rounded-md bg-black/20 px-2 py-0.5 text-[10px] font-medium uppercase text-[var(--muted)] opacity-0 transition group-hover:opacity-100">
                      Open
                    </span>
                  </div>
                  <div className="mt-1 text-sm capitalize text-[var(--muted)]">{t.status.replace(/_/g, " ")}</div>
                  {t.activeTotal > 0 && (
                    <div className="mt-4 text-lg font-semibold tabular-nums text-[var(--success)]">
                      ₹{t.activeTotal.toFixed(2)}
                    </div>
                  )}
                  {t.openedAt && (
                    <div className="mt-1 text-xs text-[var(--muted)]">{formatDuration(t.openedAt)} seated</div>
                  )}
                </Link>
              );
            })
          )}
        </div>
        {!loading && floorTables.length === 0 && walkInTables.length > 0 && (
          <p className="text-sm text-[var(--muted)]">No dine-in tables — counter only.</p>
        )}
      </section>
      )}

      {!loading && floorTables.length === 0 && walkInTables.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--border)] py-12 text-center text-[var(--muted)]">
          No tables configured. Run the database seed.
        </p>
      )}
    </div>
  );
}
