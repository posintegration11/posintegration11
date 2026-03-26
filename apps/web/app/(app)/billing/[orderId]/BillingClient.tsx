"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { OrderDetail, OrderInvoice, RestaurantSettings } from "@/lib/types";

function formatInvoiceDateTime(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function BillingClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [discount, setDiscount] = useState(0);
  const [invoice, setInvoice] = useState<OrderInvoice | null>(null);
  const [mode, setMode] = useState<"CASH" | "CARD" | "UPI">("CASH");
  const [split, setSplit] = useState(false);
  const [mode2, setMode2] = useState<"CASH" | "CARD" | "UPI">("UPI");
  const [splitAmount, setSplitAmount] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [o, s] = await Promise.all([
      api<OrderDetail>(`/orders/${orderId}`),
      api<RestaurantSettings>("/settings"),
    ]);
    setOrder(o);
    setSettings(s);
    const unpaid = o.invoices?.find((i) => i.paymentStatus === "UNPAID");
    const paidInv = o.invoices?.find((i) => i.paymentStatus === "PAID");
    setInvoice(unpaid ?? paidInv ?? null);
    setDiscount(Number(o.discountTotal));
  }, [orderId]);

  useEffect(() => {
    void refresh().catch(() => setMsg("Failed to load"));
  }, [refresh]);

  async function recalc() {
    setMsg(null);
    try {
      const patch = await api<Pick<OrderDetail, "subtotal" | "taxTotal" | "discountTotal" | "grandTotal">>(
        `/billing/orders/${orderId}/recalculate`,
        {
          method: "POST",
          body: JSON.stringify({ discountTotal: discount }),
        },
      );
      setOrder((o) => (o ? { ...o, ...patch } : null));
      setDiscount(Number(patch.discountTotal));
      void refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function createInvoice() {
    setMsg(null);
    try {
      const inv = await api<OrderInvoice>(`/billing/orders/${orderId}/invoice`, { method: "POST" });
      setInvoice(inv);
      void refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function pay() {
    if (!invoice || !order) return;
    setMsg(null);
    const grand = Number(invoice.grandTotal);
    try {
      type PaidPayload = OrderInvoice & { order: OrderDetail };
      let fresh: PaidPayload;
      if (!split) {
        fresh = await api<PaidPayload>(`/billing/invoices/${invoice.id}/pay`, {
          method: "POST",
          body: JSON.stringify({
            payments: [{ amount: grand, mode }],
          }),
        });
      } else {
        const a1 = splitAmount;
        const a2 = grand - a1;
        if (a1 <= 0 || a2 <= 0) {
          setMsg("Invalid split amounts");
          return;
        }
        fresh = await api<PaidPayload>(`/billing/invoices/${invoice.id}/pay`, {
          method: "POST",
          body: JSON.stringify({
            payments: [
              { amount: a1, mode },
              { amount: a2, mode: mode2 },
            ],
          }),
        });
      }
      setOrder(fresh.order);
      setInvoice({
        id: fresh.id,
        invoiceNumber: fresh.invoiceNumber,
        subtotal: fresh.subtotal,
        taxTotal: fresh.taxTotal,
        discountTotal: fresh.discountTotal,
        grandTotal: fresh.grandTotal,
        paymentStatus: fresh.paymentStatus,
        paymentMode: fresh.paymentMode,
        createdAt: fresh.createdAt,
      });
      void refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  if (!order || !settings) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  if (order.status !== "READY_FOR_BILLING" && order.status !== "CLOSED") {
    return (
      <div className="space-y-4">
        <p>Order must be in Ready for billing. Current: {order.status}</p>
        <Link href="/tables" className="text-[var(--accent)] underline">
          Back to tables
        </Link>
      </div>
    );
  }

  const paid = invoice?.paymentStatus === "PAID";
  const billingOpen = order.status === "READY_FOR_BILLING";

  const backToOrder = `/tables/${order.tableId}/order?orderId=${order.id}`;
  const tableLabel =
    order.table?.isWalkIn || order.table?.tableNumber === 0
      ? order.table?.name?.trim() || "Walk-in"
      : `Table ${order.table?.tableNumber ?? "?"}`;

  return (
    <div className="space-y-4">
      <header className="no-print flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link
            href={backToOrder}
            className="touch-manipulation inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition duration-75 hover:border-[var(--accent)]/50 hover:bg-[var(--border)]/30 active:scale-[0.98]"
          >
            <span className="text-[var(--muted)]" aria-hidden>
              ←
            </span>
            Order
          </Link>
          <div className="hidden h-4 w-px shrink-0 bg-[var(--border)] sm:block" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-[var(--text)] sm:text-lg">
              Billing
              <span className="font-normal text-[var(--muted)]"> · </span>
              <span className="tabular-nums">{tableLabel}</span>
            </h1>
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]" title={order.orderNumber}>
              {order.orderNumber}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span className="rounded-md bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-300">
            ₹{Number(order.grandTotal).toFixed(2)}
          </span>
          {paid ? (
            <span className="rounded-md bg-emerald-900/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
              Paid
            </span>
          ) : (
            <span className="rounded-md bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
              Unpaid
            </span>
          )}
        </div>
      </header>
      {msg && <p className="text-sm text-red-400">{msg}</p>}

      <p className="no-print text-xs leading-snug text-[var(--muted)]">
        Invoice header/footer in{" "}
        <Link href="/settings" className="text-[var(--accent)] underline-offset-2 hover:underline">
          Settings
        </Link>
        .
      </p>

      <div
        className={
          billingOpen
            ? "grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,28rem)] xl:justify-center"
            : "grid gap-4 lg:justify-items-center"
        }
      >
        {billingOpen && (
          <div className="no-print space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--text)]">Adjust &amp; invoice</h2>
            <label className="block text-xs text-[var(--muted)]">
              Discount (₹)
              <input
                type="number"
                min={0}
                step={0.01}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--text)]"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={recalc}
                className="touch-manipulation flex-1 rounded-lg bg-[var(--border)] px-3 py-1.5 text-xs font-medium transition duration-75 active:scale-[0.98] sm:flex-none"
              >
                Recalculate
              </button>
              <button
                type="button"
                onClick={createInvoice}
                disabled={!!invoice && !paid}
                className="touch-manipulation flex-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition duration-75 active:scale-[0.98] disabled:opacity-40 sm:flex-none"
              >
                Invoice
              </button>
            </div>
            {invoice && !paid && (
              <div className="space-y-2 border-t border-[var(--border)] pt-2.5">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                  Split payment
                </label>
                {!split && (
                  <select
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="UPI">UPI</option>
                  </select>
                )}
                {split && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="number"
                      placeholder="Amount 1"
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
                      value={splitAmount || ""}
                      onChange={(e) => setSplitAmount(Number(e.target.value))}
                    />
                    <select
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm"
                      value={mode}
                      onChange={(e) => setMode(e.target.value as typeof mode)}
                    >
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="UPI">UPI</option>
                    </select>
                    <select
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm sm:col-span-2"
                      value={mode2}
                      onChange={(e) => setMode2(e.target.value as typeof mode2)}
                    >
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="UPI">UPI</option>
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={pay}
                  className="w-full touch-manipulation rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white transition duration-75 hover:brightness-110 active:scale-[0.98]"
                >
                  Record payment
                </button>
              </div>
            )}
          </div>
        )}

        <div
          id="invoice-print"
          className="mx-auto w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 text-black shadow-lg shadow-black/10 print:max-w-none print:p-8 print:shadow-none lg:max-w-sm xl:max-w-md"
        >
          <div className="text-center print:mt-0">
            {settings.logoUrl ? (
              <div className="mb-2 flex justify-center print:mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settings.logoUrl}
                  alt=""
                  className="max-h-14 max-w-[160px] object-contain print:max-h-20 print:max-w-[200px]"
                />
              </div>
            ) : null}
            <div className="text-lg font-bold print:text-2xl">{settings.name}</div>
            <div className="mt-0.5 text-xs whitespace-pre-line text-gray-700 print:mt-1 print:text-sm">
              {settings.address}
            </div>
            <div className="mt-3 text-base font-semibold print:mt-4 print:text-lg">
              {invoice ? `Invoice ${invoice.invoiceNumber}` : "Invoice preview"}
            </div>
            <div className="mt-1.5 space-y-0.5 text-[10px] text-gray-600 print:mt-2 print:text-xs">
              <div>
                <span className="font-medium text-gray-700">Order opened:</span>{" "}
                {formatInvoiceDateTime(order.openedAt)}
              </div>
              {invoice?.createdAt && (
                <div>
                  <span className="font-medium text-gray-700">Invoice date:</span>{" "}
                  {formatInvoiceDateTime(invoice.createdAt)}
                </div>
              )}
              {!invoice && (
                <div className="italic text-gray-500">Generate invoice for invoice date.</div>
              )}
            </div>
            <div className="mt-2 text-xs print:mt-3 print:text-sm">Order {order.orderNumber}</div>
            <div className="text-xs print:text-sm">{tableLabel}</div>
          </div>
          <table className="mt-3 w-full text-xs print:mt-6 print:text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left">
                <th className="py-1 print:py-2">Item</th>
                <th className="py-1 print:py-2">Qty</th>
                <th className="py-1 text-right print:py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items
                .filter((i) => i.status !== "CANCELLED")
                .map((it) => (
                  <tr key={it.id} className="border-b border-gray-200">
                    <td className="py-1 print:py-2">{it.itemNameSnapshot}</td>
                    <td className="py-1 print:py-2">{it.quantity}</td>
                    <td className="py-1 text-right tabular-nums print:py-2">
                      ₹{Number(it.lineTotal).toFixed(2)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="mt-3 space-y-0.5 text-xs print:mt-4 print:text-sm">
            <div className="flex justify-between gap-4">
              <span>Subtotal</span>
              <span className="tabular-nums">₹{Number(order.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="min-w-0">
                {settings.gstLabel} ({Number(settings.taxPercent).toFixed(2)}%)
              </span>
              <span className="tabular-nums">₹{Number(order.taxTotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Discount</span>
              <span className="tabular-nums">₹{Number(order.discountTotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold print:text-lg">
              <span>Grand total</span>
              <span className="tabular-nums">₹{Number(order.grandTotal).toFixed(2)}</span>
            </div>
            {paid && invoice && (
              <div className="pt-1.5 text-xs text-emerald-700 print:pt-2 print:text-sm">
                Paid — {invoice.paymentMode}
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-[10px] text-gray-600 print:mt-6 print:text-xs">{settings.invoiceFooter}</p>
          <button
            type="button"
            className="no-print mt-4 w-full touch-manipulation rounded-lg border border-gray-400 py-1.5 text-xs font-medium transition duration-75 active:scale-[0.99]"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
