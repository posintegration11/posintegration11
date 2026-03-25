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
      await api(`/billing/orders/${orderId}/recalculate`, {
        method: "POST",
        body: JSON.stringify({ discountTotal: discount }),
      });
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function createInvoice() {
    setMsg(null);
    try {
      const inv = await api<OrderInvoice>(`/billing/orders/${orderId}/invoice`, { method: "POST" });
      setInvoice(inv);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function pay() {
    if (!invoice || !order) return;
    setMsg(null);
    const grand = Number(invoice.grandTotal);
    try {
      if (!split) {
        await api(`/billing/invoices/${invoice.id}/pay`, {
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
        await api(`/billing/invoices/${invoice.id}/pay`, {
          method: "POST",
          body: JSON.stringify({
            payments: [
              { amount: a1, mode },
              { amount: a2, mode: mode2 },
            ],
          }),
        });
      }
      await refresh();
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

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center gap-4">
        <Link href={`/tables/${order.tableId}/order`} className="text-sm text-[var(--muted)] hover:underline">
          ← Order
        </Link>
        <h1 className="text-2xl font-semibold">
          Billing — Table {order.table?.tableNumber ?? "?"}
        </h1>
      </div>
      {msg && <p className="text-sm text-red-400">{msg}</p>}

      <p className="no-print text-sm text-[var(--muted)]">
        Shop name, address, and invoice footer — edit in{" "}
        <Link href="/settings" className="text-[var(--accent)] hover:underline">
          Settings
        </Link>{" "}
        under <span className="text-[var(--text)]">Shop &amp; invoice</span>.
      </p>

      <div className="grid gap-8 lg:grid-cols-2">
        {billingOpen && (
        <div className="no-print space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-lg font-semibold">Adjust & invoice</h2>
          <label className="block text-sm">
            Discount (₹)
            <input
              type="number"
              min={0}
              step={0.01}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={recalc}
            className="rounded-xl bg-[var(--border)] px-4 py-2 font-medium"
          >
            Recalculate tax
          </button>
          <button
            type="button"
            onClick={createInvoice}
            disabled={!!invoice && !paid}
            className="ml-2 rounded-xl bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-40"
          >
            Generate invoice
          </button>
          {invoice && !paid && (
            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                Split payment
              </label>
              {!split && (
                <select
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
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
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                    value={splitAmount || ""}
                    onChange={(e) => setSplitAmount(Number(e.target.value))}
                  />
                  <select
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="UPI">UPI</option>
                  </select>
                  <select
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
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
                className="w-full rounded-xl bg-emerald-600 py-3 text-lg font-semibold text-white"
              >
                Record payment
              </button>
            </div>
          )}
        </div>
        )}

        <div
          id="invoice-print"
          className="rounded-2xl border border-[var(--border)] bg-white p-8 text-black shadow-lg"
        >
          <div className="text-center">
            {settings.logoUrl ? (
              <div className="mb-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settings.logoUrl}
                  alt=""
                  className="max-h-20 max-w-[200px] object-contain"
                />
              </div>
            ) : null}
            <div className="text-2xl font-bold">{settings.name}</div>
            <div className="mt-1 text-sm whitespace-pre-line">{settings.address}</div>
            <div className="mt-4 text-lg font-semibold">
              {invoice ? `Invoice ${invoice.invoiceNumber}` : "Invoice preview"}
            </div>
            <div className="mt-2 space-y-0.5 text-xs text-gray-600">
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
                <div className="text-gray-500 italic">Invoice date appears after you generate the invoice.</div>
              )}
            </div>
            <div className="mt-3 text-sm">Order {order.orderNumber}</div>
            <div className="text-sm">
              {order.table?.isWalkIn || order.table?.tableNumber === 0
                ? order.table?.name?.trim() || "Walk-in"
                : `Table ${order.table?.tableNumber ?? "?"}`}
            </div>
          </div>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left">
                <th className="py-2">Item</th>
                <th className="py-2">Qty</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items
                .filter((i) => i.status !== "CANCELLED")
                .map((it) => (
                  <tr key={it.id} className="border-b border-gray-200">
                    <td className="py-2">{it.itemNameSnapshot}</td>
                    <td className="py-2">{it.quantity}</td>
                    <td className="py-2 text-right">₹{Number(it.lineTotal).toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>₹{Number(order.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>{settings.gstLabel} ({Number(settings.taxPercent).toFixed(2)}%)</span>
              <span>₹{Number(order.taxTotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span>₹{Number(order.discountTotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>Grand total</span>
              <span>₹{Number(order.grandTotal).toFixed(2)}</span>
            </div>
            {paid && invoice && (
              <div className="pt-2 text-emerald-700">Paid — {invoice.paymentMode}</div>
            )}
          </div>
          <p className="mt-6 text-center text-xs text-gray-600">{settings.invoiceFooter}</p>
          <button
            type="button"
            className="no-print mt-6 w-full rounded-lg border border-gray-400 py-2 text-sm"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
