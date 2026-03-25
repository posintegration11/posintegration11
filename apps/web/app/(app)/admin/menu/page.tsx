"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { MenuItem } from "@/lib/types";

type Category = { id: string; name: string; sortOrder: number; status: string };

export default function AdminMenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [newCat, setNewCat] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", description: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const loadCats = useCallback(async () => {
    const c = await api<Category[]>("/menu/categories/all");
    setCategories(c);
    setSel((prev) => (prev ? prev : c[0]?.id ?? null));
  }, []);

  useEffect(() => {
    void loadCats().catch(() => {});
  }, [loadCats]);

  useEffect(() => {
    if (!sel) return;
    void api<MenuItem[]>(`/menu/items?categoryId=${sel}`).then(setItems);
  }, [sel]);

  async function addCategory() {
    if (!newCat.trim()) return;
    setMsg(null);
    try {
      await api("/menu/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCat.trim(), sortOrder: categories.length }),
      });
      setNewCat("");
      await loadCats();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function addItem() {
    if (!sel || !newItem.name.trim()) return;
    setMsg(null);
    try {
      await api("/menu/items", {
        method: "POST",
        body: JSON.stringify({
          categoryId: sel,
          name: newItem.name.trim(),
          price: newItem.price || "0",
          description: newItem.description || undefined,
        }),
      });
      setNewItem({ name: "", price: "", description: "" });
      const list = await api<MenuItem[]>(`/menu/items?categoryId=${sel}`);
      setItems(list);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function removeItem(id: string) {
    if (!confirm("Delete item?")) return;
    await api(`/menu/items/${id}`, { method: "DELETE" });
    if (sel) setItems(await api<MenuItem[]>(`/menu/items?categoryId=${sel}`));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Menu management</h1>
      {msg && <p className="text-sm text-red-400">{msg}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="font-semibold">Categories</h2>
          <ul className="mt-3 space-y-1">
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSel(c.id)}
                  className={`w-full touch-manipulation rounded-lg px-3 py-2 text-left transition duration-75 active:scale-[0.99] ${
                    sel === c.id ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--border)]"
                  }`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              placeholder="New category"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            />
            <button
              type="button"
              onClick={addCategory}
              className="touch-manipulation rounded-lg bg-[var(--accent)] px-4 py-2 text-white transition duration-75 active:scale-[0.98]"
            >
              Add
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="font-semibold">Items</h2>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 border-b border-[var(--border)] py-2">
                <span>
                  {it.name} — ₹{Number(it.price).toFixed(2)}
                </span>
                <button
                  type="button"
                  className="touch-manipulation rounded px-2 py-1 text-red-400 transition duration-75 active:scale-95 hover:underline"
                  onClick={() => removeItem(it.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2">
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              placeholder="Item name"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            />
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              placeholder="Price"
              value={newItem.price}
              onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
            />
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              placeholder="Description"
              value={newItem.description}
              onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
            />
            <button
              type="button"
              onClick={addItem}
              className="w-full touch-manipulation rounded-lg bg-emerald-600 py-2 text-white transition duration-75 hover:brightness-110 active:scale-[0.99]"
            >
              Add item
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
