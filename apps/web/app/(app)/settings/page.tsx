"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LoadingButton } from "@/components/LoadingButton";
import { getUser } from "@/lib/auth";
import { readShopLogoFile } from "@/lib/shopLogo";
import type { RestaurantSettings } from "@/lib/types";

export default function SettingsPage() {
  const [s, setS] = useState<RestaurantSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const role = getUser()?.role ?? "";
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    void api<RestaurantSettings>("/settings").then(setS);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setMsg(null);
    try {
      const payload = isAdmin
        ? {
            name: s.name,
            logoUrl: s.logoUrl ?? "",
            address: s.address,
            gstLabel: s.gstLabel,
            taxPercent: Number(s.taxPercent),
            invoiceFooter: s.invoiceFooter,
            currency: s.currency,
            tableCount: s.tableCount,
          }
        : {
            name: s.name.trim() || "Restaurant",
            logoUrl: s.logoUrl ?? "",
            address: s.address,
            invoiceFooter: s.invoiceFooter,
          };
      const updated = await api<RestaurantSettings>("/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setS(updated);
      setMsg("Saved");
      window.dispatchEvent(new CustomEvent("pos-shop-updated"));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {isAdmin ? "Restaurant defaults, tax, and what prints on invoices." : "Shop name and address for printed invoices (tax is admin-only)."}
        </p>
      </div>
      {msg && (
        <p className={`text-sm ${msg === "Saved" ? "text-[var(--success)]" : "text-red-400"}`}>{msg}</p>
      )}
      <form onSubmit={save} className="space-y-8">
        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Shop &amp; invoice</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Shown at the top and bottom of every printed invoice.
            </p>
          </div>
          <label className="block text-sm">
            Restaurant name
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              value={s.name}
              onChange={(e) => setS({ ...s, name: e.target.value })}
            />
          </label>
          <div className="block text-sm">
            <span className="font-medium text-[var(--text)]">Logo</span>
            <div className="mt-2 flex flex-wrap items-end gap-4">
              {s.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.logoUrl}
                  alt=""
                  className="h-20 w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] object-contain"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--muted)]">
                  No logo
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer touch-manipulation rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-medium transition duration-75 hover:bg-[var(--border)]/40 active:scale-[0.98]">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        const data = await readShopLogoFile(f);
                        setS({ ...s, logoUrl: data });
                        setMsg(null);
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Invalid file");
                      }
                    }}
                  />
                  Choose image
                </label>
                {s.logoUrl ? (
                  <button
                    type="button"
                    className="touch-manipulation text-left text-sm text-red-400 transition duration-75 hover:underline active:scale-[0.99]"
                    onClick={() => setS({ ...s, logoUrl: null })}
                  >
                    Remove logo
                  </button>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">PNG, JPG, or WebP · max ~380 KB · shown in header and invoices</p>
          </div>
          <label className="block text-sm">
            Address
            <textarea
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              rows={3}
              value={s.address}
              onChange={(e) => setS({ ...s, address: e.target.value })}
              placeholder="Street, city (new lines allowed)"
            />
          </label>
          <label className="block text-sm">
            Invoice footer
            <textarea
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              rows={2}
              value={s.invoiceFooter}
              onChange={(e) => setS({ ...s, invoiceFooter: e.target.value })}
              placeholder="Thank you · GSTIN · terms"
            />
          </label>
        </section>

        {isAdmin && (
          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Tax &amp; currency</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Billing calculations and labels.</p>
            </div>
            <label className="block text-sm">
              Tax label (e.g. GST)
              <input
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
                value={s.gstLabel}
                onChange={(e) => setS({ ...s, gstLabel: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Tax %
              <input
                type="number"
                step={0.01}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
                value={s.taxPercent}
                onChange={(e) => setS({ ...s, taxPercent: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Currency code
              <input
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
                value={s.currency}
                onChange={(e) => setS({ ...s, currency: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Table count (reference)
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
                value={s.tableCount}
                onChange={(e) => setS({ ...s, tableCount: Number(e.target.value) })}
              />
            </label>
          </section>
        )}

        <LoadingButton
          type="submit"
          loading={saving}
          className="w-full touch-manipulation rounded-xl bg-[var(--accent)] py-3 font-semibold text-white transition duration-75 hover:brightness-110 active:scale-[0.98]"
        >
          Save
        </LoadingButton>
      </form>
    </div>
  );
}
