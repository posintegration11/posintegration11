"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import type { MenuItem, OrderDetail, OrderItem, TableSummary } from "@/lib/types";

type Category = { id: string; name: string };

function OrderPageSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-lg bg-[var(--surface)]" />
      <div className="h-10 max-w-md rounded-lg bg-[var(--surface)]" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 w-24 rounded-full bg-[var(--surface)]" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-[var(--surface)]/80" />
        ))}
      </div>
    </div>
  );
}

export function TableOrderClient({ tableId }: { tableId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderIdFromQuery = searchParams.get("orderId");

  const [categories, setCategories] = useState<Category[]>([]);
  const [catId, setCatId] = useState<string | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [walkInWithoutOrder, setWalkInWithoutOrder] = useState(false);
  const [startWalkInBusy, setStartWalkInBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const role = getUser()?.role ?? "";
  const orderIdRef = useRef<string | null>(null);
  const socketResyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** One round-trip: use after item changes instead of full refresh (avoids summary + active-order). */
  const syncOrderFromServer = useCallback(async (orderId: string) => {
    const o = await api<OrderDetail>(`/orders/${orderId}`);
    setOrder(o);
    setWalkInWithoutOrder(false);
  }, []);

  const refreshOrder = useCallback(async () => {
    if (orderIdFromQuery) {
      const o = await api<OrderDetail>(`/orders/${orderIdFromQuery}`);
      setOrder(o);
      setWalkInWithoutOrder(false);
      return;
    }
    const summary = await api<TableSummary>(`/tables/${tableId}/summary`);
    if (summary.isWalkIn) {
      setOrder(null);
      setWalkInWithoutOrder(true);
      return;
    }
    setWalkInWithoutOrder(false);
    let o = await api<OrderDetail | null>(`/tables/${tableId}/active-order`);
    if (!o) {
      await api(`/tables/${tableId}/orders`, { method: "POST" });
      o = await api<OrderDetail | null>(`/tables/${tableId}/active-order`);
    }
    setOrder(o);
  }, [tableId, orderIdFromQuery]);

  useEffect(() => {
    orderIdRef.current = order?.id ?? null;
  }, [order?.id]);

  useEffect(() => {
    void api<Category[]>("/menu/categories").then((c) => {
      setCategories(c);
      if (c[0]) setCatId(c[0].id);
    });
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (catId) q.set("categoryId", catId);
    const qText = search.trim();
    if (qText) q.set("q", qText);
    setMenuLoading(true);
    void api<MenuItem[]>(`/menu/items?${q.toString()}`)
      .then(setItems)
      .finally(() => setMenuLoading(false));
  }, [catId, search]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    refreshOrder()
      .catch(() => {
        if (alive) setMsg("Could not load order");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshOrder]);

  useEffect(() => {
    const s = getSocket();
    s.auth = { token: typeof window !== "undefined" ? localStorage.getItem("pos_token") : null };
    s.connect();
    const scheduleResync = () => {
      const id = orderIdRef.current;
      if (!id) return;
      if (socketResyncTimer.current) clearTimeout(socketResyncTimer.current);
      socketResyncTimer.current = setTimeout(() => {
        socketResyncTimer.current = null;
        void syncOrderFromServer(id).catch(() => {});
      }, 60);
    };
    s.on("order:updated", scheduleResync);
    return () => {
      s.off("order:updated", scheduleResync);
      if (socketResyncTimer.current) clearTimeout(socketResyncTimer.current);
    };
  }, [syncOrderFromServer]);

  async function startWalkInOrder() {
    setMsg(null);
    setStartWalkInBusy(true);
    try {
      const created = await api<OrderDetail>(`/tables/${tableId}/orders`, { method: "POST" });
      router.replace(`/tables/${tableId}/order?orderId=${created.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setStartWalkInBusy(false);
    }
  }

  const canBill = role === "ADMIN" || role === "CASHIER";

  const orderTotals = useMemo(() => {
    if (!order) return { sub: 0 };
    let sub = 0;
    for (const it of order.items) {
      if (it.status !== "CANCELLED") sub += Number(it.lineTotal);
    }
    return { sub };
  }, [order]);

  const isWalkInOrder = Boolean(order?.table?.isWalkIn || order?.table?.tableNumber === 0);

  async function addItem(menuItemId: string) {
    const oid = order?.id;
    if (!oid) return;
    const mi = items.find((m) => m.id === menuItemId);
    if (!mi) return;
    setMsg(null);

    setOrder((prev) => {
      if (!prev || prev.id !== oid) return prev;
      const nextStatus = prev.status === "OPEN" ? "RUNNING" : prev.status;
      const pendingOpt = prev.items.find(
        (i) => String(i.id).startsWith("opt-") && i.menuItemId === menuItemId && i.status === "ADDED",
      );
      if (pendingOpt) {
        const q = pendingOpt.quantity + 1;
        const lt = (Number(pendingOpt.itemPriceSnapshot) * q).toFixed(2);
        return {
          ...prev,
          status: nextStatus,
          items: prev.items.map((i) => (i.id === pendingOpt.id ? { ...i, quantity: q, lineTotal: lt } : i)),
        };
      }
      const sameAdded = prev.items.find(
        (i) =>
          i.menuItemId === menuItemId &&
          i.status === "ADDED" &&
          !(i.note ?? "") &&
          !String(i.id).startsWith("opt-"),
      );
      if (sameAdded) {
        const q = sameAdded.quantity + 1;
        const lt = (Number(sameAdded.itemPriceSnapshot) * q).toFixed(2);
        return {
          ...prev,
          status: nextStatus,
          items: prev.items.map((i) => (i.id === sameAdded.id ? { ...i, quantity: q, lineTotal: lt } : i)),
        };
      }
      const optimistic: OrderItem = {
        id: `opt-${menuItemId}-${Date.now()}`,
        menuItemId,
        itemNameSnapshot: mi.name,
        itemPriceSnapshot: mi.price,
        quantity: 1,
        note: null,
        status: "ADDED",
        lineTotal: Number(mi.price).toFixed(2),
        sentToKitchenAt: null,
      };
      return { ...prev, status: nextStatus, items: [...prev.items, optimistic] };
    });

    try {
      const row = await api<OrderItem>(`/orders/${oid}/items`, {
        method: "POST",
        body: JSON.stringify({ menuItemId, quantity: 1 }),
      });
      setOrder((prev) => {
        if (!prev || prev.id !== oid) return prev;
        const nextStatus = prev.status === "OPEN" ? "RUNNING" : prev.status;
        const stripped = prev.items.filter(
          (i) => !(String(i.id).startsWith("opt-") && i.menuItemId === row.menuItemId),
        );
        const idx = stripped.findIndex((i) => i.id === row.id);
        if (idx >= 0) {
          const nextItems = [...stripped];
          nextItems[idx] = row;
          return { ...prev, status: nextStatus, items: nextItems };
        }
        return { ...prev, status: nextStatus, items: [...stripped, row] };
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
      void syncOrderFromServer(oid).catch(() => {});
    }
  }

  async function sendKitchen() {
    if (!order) return;
    const oid = order.id;
    const snapshot = order;
    const nowIso = new Date().toISOString();
    setMsg(null);
    setOrder((prev) => {
      if (!prev || prev.id !== oid) return prev;
      return {
        ...prev,
        status: "KOT_SENT",
        items: prev.items.map((i) =>
          i.status === "ADDED" ? { ...i, status: "SENT_TO_KITCHEN", sentToKitchenAt: nowIso } : i,
        ),
      };
    });
    try {
      await api(`/orders/${oid}/send-to-kitchen`, { method: "POST" });
    } catch (e) {
      setOrder(snapshot);
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function readyBill() {
    if (!order) return;
    const oid = order.id;
    const snapshot = order;
    setMsg(null);
    setOrder((prev) => (prev && prev.id === oid ? { ...prev, status: "READY_FOR_BILLING" } : prev));
    try {
      await api(`/orders/${oid}/ready-for-billing`, { method: "POST" });
      router.push(`/billing/${oid}`);
    } catch (e) {
      setOrder(snapshot);
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function updateQty(itemId: string, quantity: number) {
    if (!order) return;
    if (quantity < 1) return;
    const oid = order.id;
    const line = order.items.find((i) => i.id === itemId);
    if (!line) return;
    const snapshot = order;
    const lineTotal = (Number(line.itemPriceSnapshot) * quantity).toFixed(2);
    setOrder((prev) => {
      if (!prev || prev.id !== oid) return prev;
      return {
        ...prev,
        items: prev.items.map((i) => (i.id === itemId ? { ...i, quantity, lineTotal } : i)),
      };
    });
    try {
      const updated = await api<OrderItem>(`/orders/${oid}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      });
      setOrder((prev) => {
        if (!prev || prev.id !== oid) return prev;
        return { ...prev, items: prev.items.map((i) => (i.id === itemId ? updated : i)) };
      });
    } catch (e) {
      setOrder(snapshot);
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function cancelLine(itemId: string) {
    if (!order) return;
    if (!confirm("Cancel this line?")) return;
    const oid = order.id;
    if (String(itemId).startsWith("opt-")) {
      setOrder((prev) => {
        if (!prev || prev.id !== oid) return prev;
        return { ...prev, items: prev.items.filter((i) => i.id !== itemId) };
      });
      return;
    }
    const snapshot = order;
    setOrder((prev) => {
      if (!prev || prev.id !== oid) return prev;
      return {
        ...prev,
        items: prev.items.map((i) =>
          i.id === itemId ? { ...i, status: "CANCELLED", lineTotal: "0" } : i,
        ),
      };
    });
    try {
      const updated = await api<OrderItem>(`/orders/${oid}/items/${itemId}`, { method: "DELETE" });
      setOrder((prev) => {
        if (!prev || prev.id !== oid) return prev;
        return { ...prev, items: prev.items.map((i) => (i.id === itemId ? updated : i)) };
      });
    } catch (e) {
      setOrder(snapshot);
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Link
          href="/tables"
          className="inline-flex text-sm text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          ← Tables
        </Link>
        <OrderPageSkeleton />
      </div>
    );
  }

  if (!order && walkInWithoutOrder) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Link
          href="/tables"
          className="inline-flex text-sm text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          ← Tables
        </Link>
        <div className="overflow-hidden rounded-2xl border border-violet-500/35 bg-gradient-to-br from-violet-950/40 to-[var(--surface)] p-8 shadow-xl shadow-violet-950/20">
          <div className="mb-2 inline-flex size-12 items-center justify-center rounded-xl bg-violet-500/25 text-violet-200">
            <svg className="size-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 11V7a4 4 0 00-8 0v4M8 11h8m-8 0v6a2 2 0 002 2h4a2 2 0 002-2v-6"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Walk-in counter</h1>
          <p className="mt-2 text-[var(--muted)]">
            Start a new ticket for takeaway or counter guests. Each order stays separate — use{" "}
            <strong className="text-[var(--text)]">New walk-in order</strong> on Tables for the fastest flow.
          </p>
          {msg && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">{msg}</p>}
          <button
            type="button"
            disabled={startWalkInBusy}
            onClick={() => void startWalkInOrder()}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {startWalkInBusy ? (
              <>
                <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating…
              </>
            ) : (
              "Start walk-in order"
            )}
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-3">
        <p className="text-[var(--muted)]">Could not load an order for this table.</p>
        <Link href="/tables" className="text-sm text-[var(--accent)] hover:underline">
          ← Back to tables
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8 lg:flex-row">
      <div className="flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/tables"
            className="text-sm text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            ← Tables
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isWalkInOrder ? "Walk-in" : `Table ${order.table?.tableNumber ?? "?"}`}
          </h1>
          {isWalkInOrder && (
            <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-medium text-violet-200">
              Counter
            </span>
          )}
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm capitalize text-[var(--muted)]">
            {order.status.replace(/_/g, " ")}
          </span>
        </div>
        {msg && <p className="rounded-lg border border-red-500/30 bg-red-950/35 px-3 py-2 text-sm text-red-300">{msg}</p>}
        <input
          placeholder="Search menu…"
          className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCatId(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition duration-75 active:scale-[0.97] ${
                catId === c.id
                  ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/20"
                  : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--border)]/40"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="relative min-h-[120px]">
          {menuLoading && items.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--surface)]/70" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => void addItem(it.id)}
                  className="min-h-[3.5rem] touch-manipulation rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition duration-75 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md active:scale-[0.98]"
                >
                  <div className="font-semibold">{it.name}</div>
                  <div className="mt-1 tabular-nums text-[var(--success)]">₹{Number(it.price).toFixed(2)}</div>
                </button>
              ))}
            </div>
          )}
          {menuLoading && items.length > 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-end pt-2 pr-2">
              <span className="size-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
            </div>
          )}
          {!menuLoading && items.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--muted)]">No items match your search.</p>
          )}
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-96">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg lg:sticky lg:top-4">
          <h2 className="text-lg font-semibold">Order {order.orderNumber}</h2>
          <p className="text-sm tabular-nums text-[var(--muted)]">Running total ₹{orderTotals.sub.toFixed(2)}</p>
          <ul className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto overscroll-contain">
            {order.items.map((it) => (
              <li key={it.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/40 p-3 text-sm">
                <div className="flex justify-between gap-2 font-medium">
                  <span>{it.itemNameSnapshot}</span>
                  <span className="tabular-nums">₹{Number(it.lineTotal).toFixed(2)}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">{it.status.replace(/_/g, " ")}</div>
                {it.note && <div className="text-xs italic">{it.note}</div>}
                {it.status === "ADDED" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {String(it.id).startsWith("opt-") ? (
                      <span className="text-xs font-medium text-[var(--muted)]">Saving line…</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--border)] px-2 py-1 text-xs transition duration-75 hover:brightness-125 active:scale-95"
                          onClick={() => void updateQty(it.id, it.quantity - 1)}
                        >
                          −
                        </button>
                        <span className="px-1">{it.quantity}</span>
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--border)] px-2 py-1 text-xs transition duration-75 hover:brightness-125 active:scale-95"
                          onClick={() => void updateQty(it.id, it.quantity + 1)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-red-900/40 px-2 py-1 text-xs text-red-300 transition duration-75 hover:bg-red-900/60 active:scale-95"
                          onClick={() => void cancelLine(it.id)}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void sendKitchen()}
              className="w-full rounded-xl bg-amber-600 py-3 text-lg font-semibold text-white shadow-md transition duration-75 hover:brightness-110 active:scale-[0.98]"
            >
              Send to kitchen
            </button>
            {canBill && (
              <button
                type="button"
                onClick={() => void readyBill()}
                className="w-full rounded-xl bg-[var(--accent)] py-3 text-lg font-semibold text-white shadow-md transition duration-75 hover:brightness-110 active:scale-[0.98]"
              >
                Ready for billing
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
