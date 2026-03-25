"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

const roles = ["ADMIN", "CASHIER", "WAITER", "KITCHEN"] as const;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "WAITER" as (typeof roles)[number] });
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setUsers(await api<UserRow[]>("/users"));
  }

  useEffect(() => {
    void load().catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", email: "", password: "", role: "WAITER" });
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  async function patch(id: string, patch: Partial<{ role: string; status: string }>) {
    await api(`/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    await load();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Users</h1>
      {msg && <p className="text-sm text-red-400">{msg}</p>}
      <form
        onSubmit={create}
        className="grid max-w-lg gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <h2 className="font-semibold">New user</h2>
        <input
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          type="password"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as (typeof roles)[number] })}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-[var(--accent)] py-2 text-white">
          Create
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface)] text-[var(--muted)]">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--border)]">
                <td className="p-3">{u.name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <select
                    className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                    value={u.role}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  <select
                    className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                    value={u.status}
                    onChange={(e) => patch(u.id, { status: e.target.value })}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
