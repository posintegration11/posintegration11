"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { MenuItem, MenuItemDiet } from "@/lib/types";

type Category = { id: string; name: string; sortOrder: number; status: string };

const ARCHIVE_CATEGORY = "Archived (order history)";

const DIETS: { value: MenuItemDiet; label: string }[] = [
  { value: "VEG", label: "Veg" },
  { value: "NON_VEG", label: "Non-veg" },
  { value: "VEGAN", label: "Vegan" },
];

function dietBadgeClass(d: MenuItemDiet | undefined): string {
  const x = d ?? "VEG";
  if (x === "VEGAN") return "border-emerald-500/35 bg-emerald-600/25 text-emerald-200";
  if (x === "NON_VEG") return "border-amber-500/40 bg-amber-600/25 text-amber-200";
  return "border-lime-500/30 bg-lime-600/20 text-lime-100";
}

function DietBadge({ diet }: { diet?: MenuItemDiet }) {
  const d = diet ?? "VEG";
  const label = d === "NON_VEG" ? "Non-veg" : d === "VEGAN" ? "Vegan" : "Veg";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${dietBadgeClass(d)}`}
    >
      {label}
    </span>
  );
}

type PizzaSize = "Regular" | "Medium" | "Large";

function splitPizzaSize(name: string): { base: string; size: PizzaSize } | null {
  const m = /^(.*) \((Regular|Medium|Large)\)$/.exec(name);
  if (!m) return null;
  return { base: m[1], size: m[2] as PizzaSize };
}

type HalfFullPortion = "Half" | "Full";

function splitHalfFull(name: string): { base: string; portion: HalfFullPortion } | null {
  const m = /^(.*) \((Half|Full)\)$/.exec(name);
  if (!m) return null;
  return { base: m[1], portion: m[2] as HalfFullPortion };
}

/** "Cold Drink — ₹10" style (em dash / en dash / spaced hyphen); avoids splitting names like Pizza-A-Maxicana. */
function splitTier(name: string): { base: string; label: string } | null {
  for (const sep of [" — ", " – ", " - "]) {
    const i = name.indexOf(sep);
    if (i === -1) continue;
    const base = name.slice(0, i).trim();
    const label = name.slice(i + sep.length).trim();
    if (base && label) return { base, label };
  }
  return null;
}

type AdminItemRow =
  | { kind: "single"; item: MenuItem }
  | {
      kind: "sizes";
      base: string;
      regular?: MenuItem;
      medium?: MenuItem;
      large?: MenuItem;
    }
  | { kind: "half_full"; base: string; half?: MenuItem; full?: MenuItem }
  | { kind: "tiers"; base: string; variants: { label: string; item: MenuItem }[] };

function buildAdminItemRows(items: MenuItem[]): AdminItemRow[] {
  const consumed = new Set<string>();

  const pizzaMap = new Map<string, { R?: MenuItem; M?: MenuItem; L?: MenuItem }>();
  for (const it of items) {
    const sp = splitPizzaSize(it.name);
    if (!sp) continue;
    const g = pizzaMap.get(sp.base) ?? {};
    if (sp.size === "Regular") g.R = it;
    if (sp.size === "Medium") g.M = it;
    if (sp.size === "Large") g.L = it;
    pizzaMap.set(sp.base, g);
    consumed.add(it.id);
  }

  const hfMap = new Map<string, { H?: MenuItem; F?: MenuItem }>();
  for (const it of items) {
    if (consumed.has(it.id)) continue;
    const hf = splitHalfFull(it.name);
    if (!hf) continue;
    const g = hfMap.get(hf.base) ?? {};
    if (hf.portion === "Half") g.H = it;
    if (hf.portion === "Full") g.F = it;
    hfMap.set(hf.base, g);
    consumed.add(it.id);
  }

  const tierBuckets = new Map<string, { label: string; item: MenuItem }[]>();
  for (const it of items) {
    if (consumed.has(it.id)) continue;
    const t = splitTier(it.name);
    if (!t) continue;
    const arr = tierBuckets.get(t.base) ?? [];
    arr.push({ label: t.label, item: it });
    tierBuckets.set(t.base, arr);
  }

  for (const [base, arr] of tierBuckets) {
    if (arr.length < 2) tierBuckets.delete(base);
    else for (const { item } of arr) consumed.add(item.id);
  }

  type Tagged = { sortKey: string; row: AdminItemRow };
  const tagged: Tagged[] = [];

  for (const it of items) {
    if (!consumed.has(it.id)) {
      tagged.push({ sortKey: it.name.toLowerCase(), row: { kind: "single", item: it } });
    }
  }

  for (const base of pizzaMap.keys()) {
    const g = pizzaMap.get(base)!;
    if (g.R || g.M || g.L) {
      tagged.push({
        sortKey: base.toLowerCase(),
        row: { kind: "sizes", base, regular: g.R, medium: g.M, large: g.L },
      });
    }
  }

  for (const base of hfMap.keys()) {
    const g = hfMap.get(base)!;
    if (g.H || g.F) {
      tagged.push({
        sortKey: base.toLowerCase(),
        row: { kind: "half_full", base, half: g.H, full: g.F },
      });
    }
  }

  for (const [base, variants] of tierBuckets) {
    const sorted = [...variants].sort((a, b) => {
      const pa = Number(a.item.price);
      const pb = Number(b.item.price);
      if (pa !== pb) return pa - pb;
      return naturalLabelSort(a.label, b.label);
    });
    tagged.push({ sortKey: base.toLowerCase(), row: { kind: "tiers", base, variants: sorted } });
  }

  tagged.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return tagged.map((t) => t.row);
}

function naturalLabelSort(a: string, b: string): number {
  const na = parseFloat(a.replace(/[^\d.]/g, ""));
  const nb = parseFloat(b.replace(/[^\d.]/g, ""));
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

/** Single-line list: avoid "Name — ₹10 — ₹10" when price is already in the name. */
function singleItemDisplayName(item: MenuItem): string {
  const p = `₹${Number(item.price).toFixed(0)}`;
  const p2 = `₹${Number(item.price).toFixed(2)}`;
  const n = item.name;
  if (n.includes(p) || n.includes(p2)) return n;
  return `${n} — ${p2}`;
}

function adminItemsQuery(categoryId: string) {
  return `/menu/items?categoryId=${encodeURIComponent(categoryId)}&includeUnavailable=1`;
}

type AddVariantMode = "single" | "pizza" | "half_full";

export default function AdminMenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [newCat, setNewCat] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", description: "" });
  const [addVariantMode, setAddVariantMode] = useState<AddVariantMode>("single");
  const [pizzaPrices, setPizzaPrices] = useState({ regular: "", medium: "", large: "" });
  const [halfFullPrices, setHalfFullPrices] = useState({ half: "", full: "" });
  const [newItemDiet, setNewItemDiet] = useState<MenuItemDiet>("VEG");
  const [addItemBusy, setAddItemBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"err" | "ok">("err");

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);

  const loadCats = useCallback(async () => {
    try {
      const c = await api<Category[]>("/menu/categories/all");
      setCategories(c);
      setSel((prev) => {
        if (prev && c.some((x) => x.id === prev)) return prev;
        const preferred = c.find((x) => x.name !== ARCHIVE_CATEGORY) ?? c[0];
        return preferred?.id ?? null;
      });
    } catch (e) {
      setMsgTone("err");
      setMsg(e instanceof Error ? e.message : "Could not load categories");
    }
  }, []);

  useEffect(() => {
    void loadCats();
  }, [loadCats]);

  async function applyDefaultMenu() {
    setApplyBusy(true);
    setMsg(null);
    setMsgTone("err");
    try {
      await api("/menu/admin/apply-handwritten", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const c = await api<Category[]>("/menu/categories/all");
      setCategories(c);
      const pick = c.find((x) => x.name !== ARCHIVE_CATEGORY) ?? c[0];
      setSel(pick?.id ?? null);
      setMsgTone("ok");
      setMsg("Default menu merged from handwritten list. Rows that already existed were skipped.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load default menu");
    } finally {
      setApplyBusy(false);
    }
  }

  useEffect(() => {
    if (!sel) return;
    void api<MenuItem[]>(adminItemsQuery(sel))
      .then(setItems)
      .catch(() => setItems([]));
  }, [sel]);

  const itemRows = useMemo(() => buildAdminItemRows(items), [items]);

  async function addCategory() {
    if (!newCat.trim()) return;
    setMsg(null);
    setMsgTone("err");
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
    setMsgTone("err");
    const baseName = newItem.name.trim();
    const desc = newItem.description.trim() || undefined;

    const postOne = (name: string, price: string) =>
      api("/menu/items", {
        method: "POST",
        body: JSON.stringify({
          categoryId: sel,
          name,
          price: price.trim() || "0",
          description: desc,
          diet: newItemDiet,
        }),
      });

    setAddItemBusy(true);
    try {
      let created = 0;
      if (addVariantMode === "single") {
        await postOne(baseName, newItem.price);
        created = 1;
      } else if (addVariantMode === "pizza") {
        const pairs: { label: string; price: string }[] = [
          { label: "Regular", price: pizzaPrices.regular },
          { label: "Medium", price: pizzaPrices.medium },
          { label: "Large", price: pizzaPrices.large },
        ];
        const filled = pairs.filter((p) => p.price.trim() !== "");
        if (filled.length === 0) {
          setMsg("Enter at least one of Regular / Medium / Large price.");
          return;
        }
        for (const { label, price } of filled) {
          await postOne(`${baseName} (${label})`, price);
          created++;
        }
      } else {
        const h = halfFullPrices.half.trim();
        const f = halfFullPrices.full.trim();
        if (!h && !f) {
          setMsg("Enter Half and/or Full price.");
          return;
        }
        if (h) {
          await postOne(`${baseName} (Half)`, h);
          created++;
        }
        if (f) {
          await postOne(`${baseName} (Full)`, f);
          created++;
        }
      }

      setNewItem({ name: "", price: "", description: "" });
      setNewItemDiet("VEG");
      setPizzaPrices({ regular: "", medium: "", large: "" });
      setHalfFullPrices({ half: "", full: "" });
      setMsgTone("ok");
      setMsg(created === 1 ? "Item added." : `${created} items added.`);
      const list = await api<MenuItem[]>(adminItemsQuery(sel));
      setItems(list);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setAddItemBusy(false);
    }
  }

  function startEditCategory(c: Category) {
    setEditingCatId(c.id);
    setEditCatName(c.name);
    setSel(c.id);
    setMsg(null);
  }

  function cancelEditCategory() {
    setEditingCatId(null);
    setEditCatName("");
  }

  async function saveCategoryEdit() {
    if (!editingCatId || !editCatName.trim()) return;
    setMsg(null);
    setMsgTone("err");
    try {
      await api(`/menu/categories/${editingCatId}`, {
        method: "PUT",
        body: JSON.stringify({ name: editCatName.trim() }),
      });
      cancelEditCategory();
      setMsgTone("ok");
      setMsg("Category updated.");
      await loadCats();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function removeCategory(id: string, name: string) {
    if (
      !confirm(
        `Remove category “${name}”? All items in this category will be removed from the menu. Old bills still show each line’s name and price; the link to the menu item will clear.`,
      )
    ) {
      return;
    }
    setMsg(null);
    setMsgTone("err");
    try {
      await api(`/menu/categories/${id}`, { method: "DELETE" });
      if (editingCatId === id) cancelEditCategory();
      setMsgTone("ok");
      setMsg("Category removed.");
      await loadCats();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  async function removeItem(id: string) {
    if (
      !confirm(
        "Delete this menu item permanently? Old bills keep the line name and price; the item unlinks from those lines.",
      )
    ) {
      return;
    }
    setMsg(null);
    setMsgTone("err");
    try {
      await api(`/menu/items/${id}`, { method: "DELETE" });
      setMsgTone("ok");
      setMsg("Item removed.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
    if (sel) setItems(await api<MenuItem[]>(adminItemsQuery(sel)));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Menu management</h1>
      {msg && (
        <p className={`text-sm ${msgTone === "err" ? "text-red-400" : "text-amber-200"}`}>{msg}</p>
      )}
      <div className="w-fit max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <button
          type="button"
          disabled={applyBusy}
          onClick={() => void applyDefaultMenu()}
          className="touch-manipulation rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {applyBusy ? "Loading…" : "Load Default Menu"}
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="font-semibold">Categories</h2>
          <ul className="mt-3 max-h-[min(28rem,60vh)] space-y-2 overflow-y-auto pr-1">
            {categories.map((c) => (
              <li key={c.id}>
                {editingCatId === c.id ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      aria-label="Category name"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => void saveCategoryEdit()}
                        className="touch-manipulation rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditCategory}
                        className="touch-manipulation rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSel(c.id);
                        setMsg(null);
                      }}
                      className={`min-w-0 flex-1 touch-manipulation rounded-lg px-3 py-2 text-left text-sm transition duration-75 active:scale-[0.99] ${
                        sel === c.id ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--border)]"
                      }`}
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.status !== "ACTIVE" ? (
                        <span className="mt-0.5 block text-[10px] uppercase opacity-80">Hidden</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditCategory(c)}
                      className="touch-manipulation rounded-lg border border-[var(--border)] px-2.5 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
                      title="Edit category"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeCategory(c.id, c.name)}
                      className="touch-manipulation rounded-lg border border-red-500/30 px-2.5 py-2 text-xs font-medium text-red-400 hover:bg-red-950/30"
                      title="Remove category"
                    >
                      Remove
                    </button>
                  </div>
                )}
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
          <ul className="mt-3 max-h-[min(28rem,60vh)] space-y-3 overflow-y-auto pr-1 text-sm">
            {items.length === 0 ? (
              <li className="py-4 text-center text-[var(--muted)]">No items in this category.</li>
            ) : null}
            {itemRows.map((row) => {
              const variantCell = (label: string, it: MenuItem | undefined, key: string) => (
                <div
                  key={key}
                  className="flex min-h-[4.5rem] flex-col justify-between rounded-lg border border-[var(--border)]/80 bg-[var(--surface)] px-2.5 py-2"
                >
                  {it ? (
                    <>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          {label}
                        </div>
                        <div
                          className={`mt-0.5 text-base font-semibold ${
                            it.isAvailable === false ? "opacity-60" : ""
                          }`}
                        >
                          ₹{Number(it.price).toFixed(2)}
                        </div>
                        <div className="mt-1">
                          <DietBadge diet={it.diet} />
                        </div>
                        {it.isAvailable === false ? (
                          <span className="mt-1 inline-block text-[9px] uppercase text-[var(--muted)]">
                            Hidden
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="mt-2 touch-manipulation text-left text-xs text-red-400 hover:underline"
                        onClick={() => removeItem(it.id)}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <div className="text-[var(--muted)]">
                      <div className="text-[10px] font-semibold uppercase tracking-wide">{label}</div>
                      <div className="mt-1 text-xs">—</div>
                    </div>
                  )}
                </div>
              );

              if (row.kind === "single") {
                return (
                  <li
                    key={row.item.id}
                    className="flex items-center justify-between gap-2 border-b border-[var(--border)] py-2"
                  >
                    <span
                      className={`flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 ${
                        row.item.isAvailable === false ? "opacity-60" : ""
                      }`}
                    >
                      <DietBadge diet={row.item.diet} />
                      <span className="min-w-0">
                        {singleItemDisplayName(row.item)}
                        {row.item.isAvailable === false ? (
                          <span className="ml-2 text-[10px] uppercase text-[var(--muted)]">Hidden</span>
                        ) : null}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="touch-manipulation shrink-0 rounded px-2 py-1 text-red-400 transition duration-75 active:scale-95 hover:underline"
                      onClick={() => removeItem(row.item.id)}
                    >
                      Delete
                    </button>
                  </li>
                );
              }

              if (row.kind === "half_full") {
                return (
                  <li
                    key={`hf-${row.base}`}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 p-3"
                  >
                    <div className="mb-2 font-medium leading-snug">{row.base}</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {variantCell("Half", row.half, "Half")}
                      {variantCell("Full", row.full, "Full")}
                    </div>
                  </li>
                );
              }

              if (row.kind === "tiers") {
                return (
                  <li
                    key={`tiers-${row.base}`}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 p-3"
                  >
                    <div className="mb-2 font-medium leading-snug">{row.base}</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {row.variants.map(({ label, item: it }) =>
                        variantCell(label, it, `${row.base}-${it.id}`),
                      )}
                    </div>
                  </li>
                );
              }

              return (
                <li
                  key={`pizza-${row.base}`}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 p-3"
                >
                  <div className="mb-2 font-medium leading-snug">{row.base}</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {variantCell("Regular", row.regular, "Regular")}
                    {variantCell("Medium", row.medium, "Medium")}
                    {variantCell("Large", row.large, "Large")}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Add item</div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["single", "Single price"] as const,
                  ["pizza", "Regular · Medium · Large"] as const,
                  ["half_full", "Half · Full"] as const,
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAddVariantMode(mode)}
                  className={`touch-manipulation rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    addVariantMode === mode
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--border)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Diet (applies to every line you add below)
              </div>
              <div className="flex flex-wrap gap-2">
                {DIETS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setNewItemDiet(value)}
                    className={`touch-manipulation rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      newItemDiet === value
                        ? "bg-emerald-700 text-white"
                        : "border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--border)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              placeholder={
                addVariantMode === "single"
                  ? "Item name"
                  : "Base name (without size), e.g. Farm House Pizza or Veg. Momo"
              }
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            />
            {addVariantMode === "single" ? (
              <input
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                placeholder="Price"
                inputMode="decimal"
                value={newItem.price}
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
              />
            ) : null}
            {addVariantMode === "pizza" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                  placeholder="Regular ₹"
                  inputMode="decimal"
                  value={pizzaPrices.regular}
                  onChange={(e) => setPizzaPrices({ ...pizzaPrices, regular: e.target.value })}
                />
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                  placeholder="Medium ₹"
                  inputMode="decimal"
                  value={pizzaPrices.medium}
                  onChange={(e) => setPizzaPrices({ ...pizzaPrices, medium: e.target.value })}
                />
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                  placeholder="Large ₹"
                  inputMode="decimal"
                  value={pizzaPrices.large}
                  onChange={(e) => setPizzaPrices({ ...pizzaPrices, large: e.target.value })}
                />
              </div>
            ) : null}
            {addVariantMode === "half_full" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                  placeholder="Half ₹"
                  inputMode="decimal"
                  value={halfFullPrices.half}
                  onChange={(e) => setHalfFullPrices({ ...halfFullPrices, half: e.target.value })}
                />
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                  placeholder="Full ₹"
                  inputMode="decimal"
                  value={halfFullPrices.full}
                  onChange={(e) => setHalfFullPrices({ ...halfFullPrices, full: e.target.value })}
                />
              </div>
            ) : null}
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              placeholder="Description (optional, same for all sizes)"
              value={newItem.description}
              onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
            />
            <button
              type="button"
              disabled={addItemBusy}
              onClick={() => void addItem()}
              className="w-full touch-manipulation rounded-lg bg-emerald-600 py-2 text-white transition duration-75 hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
            >
              {addItemBusy ? "Adding…" : "Add item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
