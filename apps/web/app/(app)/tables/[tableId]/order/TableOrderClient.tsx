"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { LoadingButton } from "@/components/LoadingButton";
import { Spinner } from "@/components/Spinner";
import { getUser } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import type { MenuItem, MenuItemDiet, OrderDetail, OrderItem, TableSummary } from "@/lib/types";

type DietFilter = "ALL" | MenuItemDiet;

/** Matches handwritten seed: `Item (Half)`, `Item (Full)`, pizza `(Regular)` etc. */
const PORTION_SUFFIX =
  /\s*\(\s*(Half|Full|Regular|Medium|Large|[HF])\s*\)\s*$/i;

function stripPortionSuffix(name: string): string {
  return name.replace(PORTION_SUFFIX, "").trim();
}

function portionBaseKey(it: MenuItem): string {
  return `${it.categoryId}::${stripPortionSuffix(it.name).toLowerCase()}`;
}

function portionSortKey(name: string): number {
  const m = name.match(/\(\s*((?:Half|Full|Regular|Medium|Large)|[HF])\s*\)\s*$/i);
  if (!m) return 100;
  const t = m[1].toLowerCase();
  const rank: Record<string, number> = {
    h: 0,
    half: 0,
    f: 1,
    full: 1,
    regular: 2,
    medium: 3,
    large: 4,
  };
  return rank[t] ?? 50;
}

function portionChoiceLabel(name: string): string {
  const m = name.match(/\(\s*((?:Half|Full|Regular|Medium|Large)|[HF])\s*\)\s*$/i);
  if (!m) return name;
  const t = m[1].toUpperCase();
  if (t === "H") return "Half";
  if (t === "F") return "Full";
  return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
}

function sortPortionVariants(arr: MenuItem[]): MenuItem[] {
  return arr.slice().sort(
    (a, b) => portionSortKey(a.name) - portionSortKey(b.name) || a.name.localeCompare(b.name),
  );
}

function formatVariantPriceLine(variants: MenuItem[]): string {
  const prices = variants.map((v) => Number(v.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `₹${min.toFixed(2)}`;
  return `₹${min.toFixed(2)} – ₹${max.toFixed(2)}`;
}

/** Readable kitchen / line lifecycle — values come from the API, not UI defaults. */
function orderChipStatusLabel(status: string): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "RUNNING":
      return "In progress";
    case "KOT_SENT":
      return "With kitchen";
    case "READY_FOR_BILLING":
      return "Ready for billing";
    case "PAID":
      return "Paid";
    case "CLOSED":
      return "Closed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status.replace(/_/g, " ");
  }
}

function orderLineStatusLabel(status: string): string {
  switch (status) {
    case "ADDED":
      return "Not sent to kitchen yet";
    case "SENT_TO_KITCHEN":
      return "With kitchen";
    case "PREPARING":
      return "Being prepared";
    case "READY":
      return "Ready · kitchen marked done";
    case "SERVED":
      return "Served";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status.replace(/_/g, " ");
  }
}

/** FSSAI-style veg mark; triangle for non-veg; leaf for vegan. */
function OrderDietBadge({ diet }: { diet?: MenuItemDiet }) {
  const d = diet ?? "VEG";
  const title = d === "NON_VEG" ? "Non-vegetarian" : d === "VEGAN" ? "Vegan" : "Vegetarian";
  const boxCls =
    d === "VEGAN"
      ? "border-emerald-500/45 bg-emerald-950/40 text-emerald-400"
      : d === "NON_VEG"
        ? "border-red-500/45 bg-red-950/35 text-red-400"
        : "border-green-500/45 bg-green-950/30 text-green-400";

  return (
    <span
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded-sm border ${boxCls}`}
      title={title}
      role="img"
      aria-label={title}
    >
      {d === "VEG" ? (
        <svg className="size-3" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="1.5" y="1.5" width="13" height="13" rx="1.25" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="8" cy="8" r="3.75" fill="currentColor" />
        </svg>
      ) : d === "NON_VEG" ? (
        <svg className="size-3" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 2.25L14.25 13.5H1.75L8 2.25z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg className="size-[0.7rem]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.5 4.5c-6 1-9.5 7.5-10.5 14 0 0 7-2.5 10.2-9.5.6-1.3.8-2.8.3-4.5z" />
          <path d="M20 3s-1 4-5.5 5.5c.5-3 2.5-5.2 5.5-5.5z" opacity="0.65" />
        </svg>
      )}
    </span>
  );
}

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
  /** Immediate input; server query is debounced so typing stays responsive. */
  const [menuSearchInput, setMenuSearchInput] = useState("");
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [walkInWithoutOrder, setWalkInWithoutOrder] = useState(false);
  const [startWalkInBusy, setStartWalkInBusy] = useState(false);
  const [kitchenBusy, setKitchenBusy] = useState(false);
  const [billBusy, setBillBusy] = useState(false);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [lineMutatingId, setLineMutatingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tableSummary, setTableSummary] = useState<TableSummary | null>(null);
  const [dietFilter, setDietFilter] = useState<DietFilter>("ALL");
  const [portionPicker, setPortionPicker] = useState<{ baseName: string; variants: MenuItem[] } | null>(
    null,
  );

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
    void api<TableSummary>(`/tables/${tableId}/summary`)
      .then(setTableSummary)
      .catch(() => setTableSummary(null));
  }, [tableId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setMenuSearchQuery(menuSearchInput.trim());
    }, 280);
    return () => window.clearTimeout(t);
  }, [menuSearchInput]);

  useEffect(() => {
    const q = new URLSearchParams();
    /** With an active search, load matches from the whole menu (not only the selected category pill). */
    if (!menuSearchQuery && catId) q.set("categoryId", catId);
    if (menuSearchQuery) q.set("q", menuSearchQuery);
    if (dietFilter !== "ALL") q.set("diet", dietFilter);
    setMenuLoading(true);
    void api<MenuItem[]>(`/menu/items?${q.toString()}`)
      .then(setItems)
      .finally(() => setMenuLoading(false));
  }, [catId, menuSearchQuery, dietFilter]);

  /** One grid row per dish: Half/Full (or R/M/L) merged; singletons unchanged. */
  const mergedMenuGroups = useMemo(() => {
    const byKey = new Map<string, MenuItem[]>();
    for (const it of items) {
      const k = portionBaseKey(it);
      const arr = byKey.get(k) ?? [];
      arr.push(it);
      byKey.set(k, arr);
    }
    const groups: MenuItem[][] = [];
    for (const arr of byKey.values()) {
      groups.push(arr.length > 1 ? sortPortionVariants(arr) : arr);
    }
    groups.sort((a, b) => {
      const an = stripPortionSuffix(a[0].name).toLowerCase();
      const bn = stripPortionSuffix(b[0].name).toLowerCase();
      return an.localeCompare(bn) || a[0].name.localeCompare(b[0].name);
    });
    return groups;
  }, [items]);

  useEffect(() => {
    if (!portionPicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPortionPicker(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [portionPicker]);

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
    for (const it of order.items ?? []) {
      if (it.status !== "CANCELLED") sub += Number(it.lineTotal);
    }
    return { sub };
  }, [order]);

  /** Cart UI: hide cancelled / cleaned-up lines so the panel can look empty when there are no active lines. */
  const cartLineItems = useMemo(
    () => (order?.items ?? []).filter((it) => it.status !== "CANCELLED"),
    [order?.items],
  );

  const isWalkInOrder = Boolean(order?.table?.isWalkIn || order?.table?.tableNumber === 0);

  const hubHref = isWalkInOrder || tableSummary?.isWalkIn || tableSummary?.tableNumber === 0 ? "/walk-in" : "/tables";
  const hubLabel = hubHref === "/walk-in" ? "← Walk-in" : "← Tables";

  function openPortionOrAdd(variants: MenuItem[]) {
    if (variants.length > 1) {
      setPortionPicker({ baseName: stripPortionSuffix(variants[0].name), variants });
      return;
    }
    void addItem(variants[0].id);
  }

  async function addItem(menuItemId: string) {
    const oid = order?.id;
    if (!oid) return;
    const mi = items.find((m) => m.id === menuItemId);
    if (!mi) return;
    setMsg(null);
    setAddingItemId(menuItemId);

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
    } finally {
      setAddingItemId(null);
    }
  }

  async function sendKitchen() {
    if (!order) return;
    const oid = order.id;
    const snapshot = order;
    const nowIso = new Date().toISOString();
    setMsg(null);
    setKitchenBusy(true);
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
    } finally {
      setKitchenBusy(false);
    }
  }

  async function readyBill() {
    if (!order) return;
    const oid = order.id;
    const snapshot = order;
    setMsg(null);
    setBillBusy(true);
    setOrder((prev) => (prev && prev.id === oid ? { ...prev, status: "READY_FOR_BILLING" } : prev));
    try {
      await api(`/orders/${oid}/ready-for-billing`, { method: "POST" });
      router.push(`/billing/${oid}`);
    } catch (e) {
      setOrder(snapshot);
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBillBusy(false);
    }
  }

  async function updateQty(itemId: string, quantity: number) {
    if (!order) return;
    if (quantity < 1) return;
    const oid = order.id;
    const line = order.items.find((i) => i.id === itemId);
    if (!line) return;
    const snapshot = order;
    setLineMutatingId(itemId);
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
    } finally {
      setLineMutatingId(null);
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
    setLineMutatingId(itemId);
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
    } finally {
      setLineMutatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Link
          href={hubHref}
          className="inline-flex text-sm text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          {hubLabel}
        </Link>
        <OrderPageSkeleton />
      </div>
    );
  }

  if (!order && walkInWithoutOrder) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
          <Link href="/walk-in" className="transition hover:text-[var(--text)]">
            ← Walk-in
          </Link>
          <Link href="/tables" className="transition hover:text-[var(--text)]">
            Tables
          </Link>
        </div>
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
            Open a ticket from the{" "}
            <Link href="/walk-in" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Walk-in
            </Link>{" "}
            page to continue the ₹ total you see there, or start the first order for this counter below.
          </p>
          {msg && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">{msg}</p>}
          <LoadingButton
            type="button"
            loading={startWalkInBusy}
            onClick={() => void startWalkInOrder()}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Start walk-in order
          </LoadingButton>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-3">
        <p className="text-[var(--muted)]">Could not load an order for this table.</p>
        <Link href={hubHref} className="text-sm text-[var(--accent)] hover:underline">
          {hubHref === "/walk-in" ? "← Back to Walk-in" : "← Back to tables"}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col-reverse gap-6 pb-6 lg:flex-row lg:items-start lg:gap-6 lg:pb-8">
      {portionPicker ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="presentation"
          onClick={() => setPortionPicker(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="portion-picker-title"
            className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="portion-picker-title" className="text-lg font-semibold leading-snug">
              {portionPicker.baseName}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Choose portion / size</p>
            <div className="mt-4 flex flex-col gap-2">
              {portionPicker.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={addingItemId !== null}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-left text-sm font-medium transition hover:border-[var(--accent)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    setPortionPicker(null);
                    void addItem(v.id);
                  }}
                >
                  <span className="min-w-0">{portionChoiceLabel(v.name)}</span>
                  <span className="shrink-0 tabular-nums text-[var(--success)]">₹{Number(v.price).toFixed(2)}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--border)]/30"
              onClick={() => setPortionPicker(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <div className="shrink-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={hubHref}
              className="text-sm text-[var(--muted)] transition hover:text-[var(--text)]"
            >
              {hubLabel}
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">
              {isWalkInOrder ? "Walk-in" : `Table ${order.table?.tableNumber ?? "?"}`}
            </h1>
            {isWalkInOrder && (
              <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-medium text-violet-200">
                Counter
              </span>
            )}
            <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm text-[var(--muted)]">
              {orderChipStatusLabel(order.status)}
            </span>
          </div>
          {msg && <p className="rounded-lg border border-red-500/30 bg-red-950/35 px-3 py-2 text-sm text-red-300">{msg}</p>}
          <div className="max-w-md space-y-1.5">
            <div className="relative">
              <input
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                aria-label="Search menu by name, description, or category"
                placeholder="Search all categories (name, notes, category)…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2.5 pl-4 pr-11 text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
                value={menuSearchInput}
                onChange={(e) => setMenuSearchInput(e.target.value)}
              />
              {menuSearchInput.length > 0 && (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--border)]/50 hover:text-[var(--text)]"
                  aria-label="Clear search"
                  onClick={() => {
                    setMenuSearchInput("");
                    setMenuSearchQuery("");
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {menuSearchQuery ? (
              <p className="text-xs text-[var(--muted)]">
                Showing matches across all categories. Diet filter still applies. Use multiple words to narrow (e.g.{" "}
                <span className="whitespace-nowrap">paneer tikka</span>).
              </p>
            ) : null}
          </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Diet</span>
            {(
              [
                ["ALL", "All"] as const,
                ["VEG", "Veg"] as const,
                ["NON_VEG", "Non-veg"] as const,
                ["VEGAN", "Vegan"] as const,
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDietFilter(key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition duration-75 active:scale-[0.97] ${
                  dietFilter === key
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--border)]/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Only the menu grid scrolls; filters stay above; order panel is in the aside. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl max-md:max-h-[calc(100dvh-15rem)] md:max-h-[calc(100dvh-11rem)] lg:max-h-[calc(100dvh-10rem)]">
          <div className="relative min-h-[120px] p-1">
          {menuLoading && items.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--surface)]/70" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {mergedMenuGroups.map((group) => {
                const first = group[0];
                const rowKey = portionBaseKey(first);
                const displayName = stripPortionSuffix(first.name);
                const catLabel = first.category?.name;
                const addingThis = group.some((v) => v.id === addingItemId);
                return (
                  <button
                    key={rowKey}
                    type="button"
                    disabled={addingItemId !== null}
                    onClick={() => openPortionOrAdd(group)}
                    className="relative min-h-[3.5rem] touch-manipulation rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition duration-75 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {addingThis ? (
                      <span className="flex items-center gap-2">
                        <Spinner className="size-5 text-[var(--accent)]" />
                        <span className="text-sm font-medium text-[var(--muted)]">Adding…</span>
                      </span>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 font-semibold leading-snug">{displayName}</div>
                          <OrderDietBadge diet={first.diet} />
                        </div>
                        <div className="mt-1 tabular-nums text-[var(--success)]">{formatVariantPriceLine(group)}</div>
                        {group.length > 1 ? (
                          <div className="mt-1 text-xs text-[var(--muted)]">
                            {group.map((v) => portionChoiceLabel(v.name)).join(" · ")}
                          </div>
                        ) : null}
                        {menuSearchQuery && catLabel ? (
                          <div className="mt-1 text-xs text-[var(--muted)]">{catLabel}</div>
                        ) : null}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {menuLoading && items.length > 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-end pt-2 pr-2">
              <span className="size-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
            </div>
          )}
          {!menuLoading && items.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              {menuSearchQuery || dietFilter !== "ALL"
                ? "No items match your search or diet filter."
                : "No items in this category."}
            </p>
          )}
          </div>
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-96 lg:self-start">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg lg:sticky lg:top-4 max-md:sticky max-md:top-[3.25rem] max-md:z-30">
          <h2 className="text-lg font-semibold">Order {order.orderNumber}</h2>
          <p className="text-sm tabular-nums text-[var(--muted)]">Running total ₹{orderTotals.sub.toFixed(2)}</p>
          <ul className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto overscroll-contain">
            {cartLineItems.length === 0 ? (
              <li className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/40 px-4 py-8 text-center text-sm text-[var(--muted)]">
                No items in this order yet. Add dishes from the menu.
              </li>
            ) : null}
            {cartLineItems.map((it) => (
              <li key={it.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/40 p-3 text-sm">
                <div className="flex justify-between gap-2 font-medium">
                  <span>{it.itemNameSnapshot}</span>
                  <span className="tabular-nums">₹{Number(it.lineTotal).toFixed(2)}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">{orderLineStatusLabel(it.status)}</div>
                {it.note && <div className="text-xs italic">{it.note}</div>}
                {it.status === "ADDED" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {String(it.id).startsWith("opt-") ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
                        <Spinner className="size-3.5" />
                        Saving line…
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={lineMutatingId !== null}
                          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg bg-[var(--border)] px-2 py-1 text-xs transition duration-75 hover:brightness-125 active:scale-95 disabled:opacity-50"
                          onClick={() => void updateQty(it.id, it.quantity - 1)}
                        >
                          {lineMutatingId === it.id ? <Spinner className="size-3.5" /> : "−"}
                        </button>
                        <span className="px-1">{it.quantity}</span>
                        <button
                          type="button"
                          disabled={lineMutatingId !== null}
                          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg bg-[var(--border)] px-2 py-1 text-xs transition duration-75 hover:brightness-125 active:scale-95 disabled:opacity-50"
                          onClick={() => void updateQty(it.id, it.quantity + 1)}
                        >
                          {lineMutatingId === it.id ? <Spinner className="size-3.5" /> : "+"}
                        </button>
                        <button
                          type="button"
                          disabled={lineMutatingId !== null}
                          className="inline-flex min-h-8 items-center justify-center rounded-lg bg-red-900/40 px-2 py-1 text-xs text-red-300 transition duration-75 hover:bg-red-900/60 active:scale-95 disabled:opacity-50"
                          onClick={() => void cancelLine(it.id)}
                        >
                          {lineMutatingId === it.id ? <Spinner className="size-3.5" /> : "Cancel"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2">
            <LoadingButton
              type="button"
              loading={kitchenBusy}
              disabled={billBusy}
              onClick={() => void sendKitchen()}
              className="w-full rounded-xl bg-amber-600 py-3 text-lg font-semibold text-white shadow-md transition duration-75 hover:brightness-110 active:scale-[0.98]"
            >
              Send to kitchen
            </LoadingButton>
            {canBill && (
              <LoadingButton
                type="button"
                loading={billBusy}
                disabled={kitchenBusy}
                onClick={() => void readyBill()}
                className="w-full rounded-xl bg-[var(--accent)] py-3 text-lg font-semibold text-white shadow-md transition duration-75 hover:brightness-110 active:scale-[0.98]"
              >
                Ready for billing
              </LoadingButton>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
