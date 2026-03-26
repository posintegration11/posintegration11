"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { LoadingButton } from "@/components/LoadingButton";
import type { AuthUser } from "@/lib/auth";
import { readShopLogoFile } from "@/lib/shopLogo";
import type { RestaurantSettings } from "@/lib/types";

type Props = {
  user: AuthUser;
  settings: RestaurantSettings | null;
  onSettingsChange: (s: RestaurantSettings) => void;
  onLogout: () => void;
};

export function HeaderProfile({ user, settings, onSettingsChange, onLogout }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const canEditShop = user.role === "ADMIN" || user.role === "CASHIER";
  const canOpenSettings = user.role === "ADMIN" || user.role === "CASHIER";

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen]);

  return (
    <>
      <div className="no-print relative flex shrink-0 items-center gap-2" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--border)]/40"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <span className="hidden text-left sm:block">
              <span className="block max-w-[140px] truncate leading-tight">{user.name}</span>
              <span className="text-xs font-normal text-[var(--muted)]">{user.role}</span>
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-bold text-white sm:hidden">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-[var(--muted)]" aria-hidden>
              <path fill="currentColor" d="M6 8L1 3h10z" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
              role="menu"
            >
              <div className="border-b border-[var(--border)] px-3 py-2 sm:hidden">
                <div className="truncate font-medium">{user.name}</div>
                <div className="truncate text-xs text-[var(--muted)]">{user.email}</div>
              </div>
              {canEditShop && settings ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left text-sm hover:bg-[var(--border)]/50"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditOpen(true);
                  }}
                >
                  Edit restaurant profile
                </button>
              ) : null}
              {canOpenSettings && (
                <Link
                  href="/settings"
                  role="menuitem"
                  className="block px-3 py-2 text-sm hover:bg-[var(--border)]/50"
                  onClick={() => setMenuOpen(false)}
                >
                  All settings
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--border)]/50"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                Log out
              </button>
            </div>
          )}
      </div>

      {editOpen && settings && (
        <EditProfileModal
          initial={settings}
          onClose={() => setEditOpen(false)}
          onSaved={(s) => {
            onSettingsChange(s);
            setEditOpen(false);
            window.dispatchEvent(new CustomEvent("pos-shop-updated"));
          }}
        />
      )}
    </>
  );
}

function EditProfileModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: RestaurantSettings;
  onClose: () => void;
  onSaved: (s: RestaurantSettings) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [invoiceFooter, setInvoiceFooter] = useState(initial.invoiceFooter);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      const updated = await api<RestaurantSettings>("/settings", {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim() || "Restaurant",
          address,
          invoiceFooter,
          logoUrl: logoUrl || "",
        }),
      });
      onSaved(updated);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="edit-profile-title"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl"
      >
        <h2 id="edit-profile-title" className="text-xl font-semibold text-[var(--text)]">
          Restaurant profile
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Name, logo, and invoice lines shown across the app.</p>
        {msg && <p className="mt-3 text-sm text-red-400">{msg}</p>}
        <form onSubmit={save} className="mt-6 space-y-4">
          <div>
            <span className="block text-sm font-medium text-[var(--text)]">Logo</span>
            <div className="mt-2 flex flex-wrap items-end gap-4">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-[var(--border)] bg-[var(--bg)] object-contain"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--muted)]">
                  No logo
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-medium hover:bg-[var(--border)]/40">
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
                        setLogoUrl(data);
                        setMsg(null);
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Invalid file");
                      }
                    }}
                  />
                  Choose image
                </label>
                {logoUrl ? (
                  <button
                    type="button"
                    className="text-left text-sm text-red-400 hover:underline"
                    onClick={() => setLogoUrl("")}
                  >
                    Remove logo
                  </button>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">PNG, JPG, or WebP · max ~380 KB</p>
          </div>
          <label className="block text-sm font-medium text-[var(--text)]">
            Restaurant name
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-[var(--text)]">
            Address
            <textarea
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-[var(--text)]">
            Invoice footer
            <textarea
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              rows={2}
              value={invoiceFooter}
              onChange={(e) => setInvoiceFooter(e.target.value)}
            />
          </label>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="flex-1 rounded-xl border border-[var(--border)] py-3 font-medium text-[var(--text)]"
              onClick={onClose}
            >
              Cancel
            </button>
            <LoadingButton
              type="submit"
              loading={saving}
              className="flex-1 rounded-xl bg-[var(--accent)] py-3 font-semibold text-white disabled:opacity-50"
            >
              Save
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
