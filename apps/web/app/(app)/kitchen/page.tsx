"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { KotRow } from "@/lib/types";

const BOARD_STATUSES = ["PENDING", "PREPARING", "READY"] as const;

const COLUMN_META: Record<(typeof BOARD_STATUSES)[number], { title: string; subtitle: string; accent: string }> = {
  PENDING: {
    title: "New",
    subtitle: "Queue",
    accent: "border-amber-500/50 bg-amber-950/30 shadow-amber-900/15",
  },
  PREPARING: {
    title: "Cooking",
    subtitle: "In progress",
    accent: "border-orange-500/45 bg-orange-950/25 shadow-orange-900/10",
  },
  READY: {
    title: "Ready",
    subtitle: "Serve / pickup",
    accent: "border-emerald-500/45 bg-emerald-950/30 shadow-emerald-900/15",
  },
};

function formatKotAge(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function tableLabel(k: KotRow) {
  const t = k.table;
  if (t.isWalkIn || t.tableNumber === 0) return t.name?.trim() || "Walk-in";
  return `Table ${t.tableNumber}`;
}

function ColumnSkeleton() {
  return (
    <div className="flex min-h-[280px] animate-pulse flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/50 p-4">
      <div className="h-12 rounded-xl bg-[var(--border)]/40" />
      <div className="h-32 rounded-xl bg-[var(--border)]/30" />
      <div className="h-32 rounded-xl bg-[var(--border)]/30" />
    </div>
  );
}

export default function KitchenPage() {
  const [kots, setKots] = useState<KotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [busyKot, setBusyKot] = useState<string | null>(null);
  const [, setAgeTick] = useState(0);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    return api<KotRow[]>("/kot")
      .then((rows) => {
        setKots(rows);
        setError(null);
      })
      .catch(() => setError("Could not load kitchen tickets"))
      .finally(() => setLoading(false));
  }, []);

  const scheduleLoad = useCallback(() => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => {
      loadTimer.current = null;
      load();
    }, 45);
  }, [load]);

  useEffect(() => {
    setLoading(true);
    load();
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
    };
  }, [load]);

  useEffect(() => {
    const s = getSocket();
    s.auth = { token: typeof window !== "undefined" ? localStorage.getItem("pos_token") : null };
    s.connect();
    const onK = () => scheduleLoad();
    s.on("kot:updated", onK);
    return () => {
      s.off("kot:updated", onK);
    };
  }, [scheduleLoad]);

  useEffect(() => {
    const id = window.setInterval(() => setAgeTick((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  async function setLine(itemId: string, status: string) {
    setError(null);
    const snapshot = kots;
    setKots((prev) =>
      prev.map((k) => ({
        ...k,
        items: k.items.map((li) => (li.id === itemId ? { ...li, status } : li)),
      })),
    );
    setBusyLine(itemId);
    try {
      await api(`/kot/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      void load();
    } catch {
      setError("Could not update line — try again");
      setKots(snapshot);
    } finally {
      setBusyLine(null);
    }
  }

  async function setKot(kotId: string, status: string) {
    setError(null);
    const snapshot = kots;
    if (status === "COMPLETED") {
      setKots((prev) => prev.filter((k) => k.id !== kotId));
    } else {
      setKots((prev) => prev.map((k) => (k.id === kotId ? { ...k, status } : k)));
    }
    setBusyKot(kotId);
    try {
      await api(`/kot/${kotId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      void load();
    } catch {
      setError("Could not update ticket — try again");
      setKots(snapshot);
    } finally {
      setBusyKot(null);
    }
  }

  const grouped = useMemo(() => {
    return BOARD_STATUSES.map((st) => ({
      status: st,
      meta: COLUMN_META[st],
      rows: kots
        .filter((k) => k.status === st)
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }));
  }, [kots]);

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kitchen</h1>
          <p className="text-sm text-[var(--muted)]">Live KOT board — updates automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium transition duration-75 hover:border-[var(--accent)] active:scale-[0.98]"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/35 bg-red-950/35 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {loading && kots.length === 0
          ? BOARD_STATUSES.map((st) => <ColumnSkeleton key={st} />)
          : grouped.map((col) => (
              <section
                key={col.status}
                className={`flex flex-col rounded-2xl border-2 p-4 shadow-lg ${col.meta.accent}`}
              >
                <div className="mb-4 flex items-start justify-between gap-2 border-b border-[var(--border)]/60 pb-3">
                  <div>
                    <h2 className="text-lg font-bold leading-tight text-[var(--text)]">{col.meta.title}</h2>
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{col.meta.subtitle}</p>
                  </div>
                  <span className="grid h-10 min-w-10 place-content-center rounded-xl bg-black/25 px-2 text-lg font-bold tabular-nums text-[var(--text)]">
                    {col.rows.length}
                  </span>
                </div>
                <div className="flex max-h-[calc(100vh-12rem)] flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
                  {col.rows.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--border)]/80 py-10 text-center text-sm text-[var(--muted)]">
                      Nothing here
                    </p>
                  ) : (
                    col.rows.map((k) => {
                      const kotBusy = busyKot === k.id;
                      return (
                        <article
                          key={k.id}
                          className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/80 p-4 shadow-md transition duration-75 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-lg font-bold leading-tight">{tableLabel(k)}</span>
                                {k.table.isWalkIn || k.table.tableNumber === 0 ? (
                                  <span className="rounded-md bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-200">
                                    Counter
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 font-mono text-sm text-[var(--success)]">{k.order.orderNumber}</div>
                            </div>
                            <time
                              className="shrink-0 text-xs tabular-nums text-[var(--muted)]"
                              dateTime={k.createdAt}
                              title={new Date(k.createdAt).toLocaleString()}
                            >
                              {formatKotAge(k.createdAt)}
                            </time>
                          </div>
                          <ul className="mt-3 space-y-2">
                            {k.items.map((li) => {
                              const lineBusy = busyLine === li.id;
                              const disabledLine = lineBusy || busyKot !== null;
                              return (
                                <li
                                  key={li.id}
                                  className="flex flex-col gap-2 rounded-lg border border-[var(--border)]/80 bg-[var(--surface)]/60 p-3"
                                >
                                  <div className="flex justify-between gap-2 text-sm font-medium leading-snug">
                                    <span className="min-w-0">
                                      {li.orderItem.itemNameSnapshot}{" "}
                                      <span className="whitespace-nowrap text-[var(--muted)]">×{li.quantity}</span>
                                    </span>
                                  </div>
                                  {li.note ? (
                                    <span className="text-xs italic text-[var(--muted)]">{li.note}</span>
                                  ) : null}
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                                    {li.status.replace(/_/g, " ")}
                                  </span>
                                  <div className="flex flex-wrap gap-2">
                                    {li.status === "PENDING" && (
                                      <button
                                        type="button"
                                        disabled={disabledLine}
                                        onClick={() => void setLine(li.id, "PREPARING")}
                                        className="min-h-10 flex-1 touch-manipulation rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white shadow transition duration-75 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {lineBusy ? "…" : "Preparing"}
                                      </button>
                                    )}
                                    {li.status === "PREPARING" && (
                                      <button
                                        type="button"
                                        disabled={disabledLine}
                                        onClick={() => void setLine(li.id, "READY")}
                                        className="min-h-10 flex-1 touch-manipulation rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow transition duration-75 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {lineBusy ? "…" : "Ready"}
                                      </button>
                                    )}
                                    {li.status === "READY" && (
                                      <button
                                        type="button"
                                        disabled={disabledLine}
                                        onClick={() => void setLine(li.id, "SERVED")}
                                        className="min-h-10 flex-1 touch-manipulation rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white shadow transition duration-75 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {lineBusy ? "…" : "Served"}
                                      </button>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                          <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
                            {k.status === "PENDING" && (
                              <button
                                type="button"
                                disabled={kotBusy || busyLine !== null}
                                onClick={() => void setKot(k.id, "PREPARING")}
                                className="w-full touch-manipulation rounded-lg border border-amber-500/40 bg-amber-900/30 py-2.5 text-sm font-semibold text-amber-100 transition duration-75 hover:bg-amber-900/45 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {kotBusy ? "Updating…" : "Start ticket (preparing)"}
                              </button>
                            )}
                            {k.status === "PREPARING" && (
                              <button
                                type="button"
                                disabled={kotBusy || busyLine !== null}
                                onClick={() => void setKot(k.id, "READY")}
                                className="w-full touch-manipulation rounded-lg border border-emerald-500/40 bg-emerald-900/25 py-2.5 text-sm font-semibold text-emerald-100 transition duration-75 hover:bg-emerald-900/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {kotBusy ? "Updating…" : "All ready (ticket)"}
                              </button>
                            )}
                            {k.status === "READY" && (
                              <button
                                type="button"
                                disabled={kotBusy || busyLine !== null}
                                onClick={() => void setKot(k.id, "COMPLETED")}
                                className="w-full touch-manipulation rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 text-sm font-semibold transition duration-75 hover:bg-[var(--border)]/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {kotBusy ? "Updating…" : "Complete ticket"}
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            ))}
      </div>
    </div>
  );
}
