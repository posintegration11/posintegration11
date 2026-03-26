"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import type { TableRow } from "@/lib/types";

function statusStyle(status: string) {
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
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  const floorTables = useMemo(() => tables.filter((t) => !t.isWalkIn), [tables]);
  const hasWalkIn = useMemo(() => tables.some((t) => t.isWalkIn), [tables]);

  return (
    <div className="space-y-8 pb-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tables</h1>
          <p className="text-sm text-[var(--muted)]">
            Dine-in floor only.{" "}
            {hasWalkIn ? (
              <>
                Counter / walk-in:{" "}
                <Link href="/walk-in" className="text-[var(--accent)] underline-offset-2 hover:underline">
                  Walk-in
                </Link>
                .
              </>
            ) : null}
          </p>
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

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Dine-in</h2>
        {!loading && floorTables.length === 0 && hasWalkIn && (
          <p className="text-sm text-[var(--muted)]">
            No dine-in tables in this layout. Use{" "}
            <Link href="/walk-in" className="text-[var(--accent)] underline-offset-2 hover:underline">
              Walk-in
            </Link>{" "}
            for counter orders.
          </p>
        )}
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
              const orderQs = t.activeOrderId ? `?orderId=${t.activeOrderId}` : "";
              const href = billFirst
                ? `/billing/${t.activeOrderId}`
                : `/tables/${t.id}/order${orderQs}`;
              return (
                <Link
                  key={t.id}
                  href={href}
                  prefetch
                  className={`group block rounded-2xl border-2 p-5 shadow-md transition duration-75 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] ${statusStyle(t.status)}`}
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
      </section>

      {!loading && floorTables.length === 0 && !hasWalkIn && (
        <p className="rounded-xl border border-dashed border-[var(--border)] py-12 text-center text-[var(--muted)]">
          No tables configured. Run the database seed.
        </p>
      )}
    </div>
  );
}
