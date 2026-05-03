import React, { useEffect, useMemo, useState } from "react";
import axios from '../apiClient.js';
import { ToastContainer, toast } from "../Components";

export default function MigrateOrders() {
  const [rows, setRows] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState({});
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const reasonBadge = (r) => {
    if (r.startsWith("steps:")) return "bg-amber-100 text-amber-800";
    if (r.startsWith("items:")) return "bg-indigo-100 text-indigo-800";
    if (r === "legacySingleLine") return "bg-rose-100 text-rose-800";
    return "bg-gray-100 text-gray-800";
    };

  const fetchFlatOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`/api/orders-migrate/migrate/flat?limit=500`);
      if (data?.success) {
        setRows(data.rows || []);
        setFiltered(data.rows || []);
        setSelectedIds([]);
        setSelectAll(false);
      } else {
        setError("Failed to load migration list");
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlatOrders();
  }, []);

  useEffect(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) {
      setFiltered(rows);
      return;
    }
    const num = Number(q);
    const byNum = !Number.isNaN(num);
    const res = rows.filter((r) => {
      const hitNum = byNum && r.Order_Number === num;
      const hitCust = (r.Customer_uuid || "").toLowerCase().includes(q);
      const hitReasons = (r.reasons || []).some((x) => x.toLowerCase().includes(q));
      return hitNum || hitCust || hitReasons;
    });
    setFiltered(res);
  }, [search, rows]);

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds([]);
      setSelectAll(false);
    } else {
      const ids = filtered.map((r) => r._id);
      setSelectedIds(ids);
      setSelectAll(true);
    }
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const migrateSelected = async () => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one row");
      return;
    }
    try {
      setBusyIds((p) => {
        const c = { ...p };
        selectedIds.forEach((id) => (c[id] = true));
        return c;
      });
      const { data } = await axios.post(`/api/orders-migrate/migrate/ids`, { ids: selectedIds });
      if (data?.success) {
        toast.success(`Migrated ${data.migrated} orders`);
        await fetchFlatOrders();
      } else {
        toast.error("Migration failed");
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Migration failed");
    } finally {
      setBusyIds({});
    }
  };

  const migrateAll = async () => {
    if (!window.confirm("Migrate ALL old-format orders? This updates every matching order.")) return;
    try {
      setLoading(true);
      const { data } = await axios.post(`/api/orders-migrate/migrate/all`);
      if (data?.success) {
        toast.success(`Migrated ${data.migrated} orders`);
        await fetchFlatOrders();
      } else {
        toast.error("Migration failed");
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Migration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <ToastContainer />
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold">Migrate Orders</h2>
          <p className="text-sm text-gray-600">
            Normalize old data → per‑item Priority/Remark, fixed Steps, recalculated totals.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            className="border rounded px-3 py-2"
            placeholder="Search: Order # / Customer / reason"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={fetchFlatOrders}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
            disabled={loading}
            title="Refresh list"
          >
            Refresh
          </button>
          <button
            onClick={migrateSelected}
            className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={loading || selectedIds.length === 0}
          >
            Migrate Selected ({selectedIds.length})
          </button>
          <button
            onClick={migrateAll}
            className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            disabled={loading || filtered.length === 0}
          >
            Migrate All
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin h-8 w-8 rounded-full border-2 border-gray-300 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-600">No orders need migration. ✅</div>
      ) : (
        <div className="bg-white overflow-x-auto w-full">
          <table className="min-w-full text-sm text-left border">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-2">
                  <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} />
                </th>
                <th className="border px-2 py-2">Order #</th>
                <th className="border px-2 py-2">Customer UUID</th>
                <th className="border px-2 py-2 text-center">Items</th>
                <th className="border px-2 py-2 text-center">Steps</th>
                <th className="border px-2 py-2">Reasons</th>
                <th className="border px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const busy = !!busyIds[r._id];
                const checked = selectedIds.includes(r._id);
                return (
                  <tr key={r._id} className="hover:bg-gray-50 border-t">
                    <td className="border px-2 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(r._id)}
                        disabled={busy}
                      />
                    </td>
                    <td className="border px-2 py-2">{r.Order_Number}</td>
                    <td className="border px-2 py-2">{r.Customer_uuid}</td>
                    <td className="border px-2 py-2 text-center">{r.itemsCount}</td>
                    <td className="border px-2 py-2 text-center">{r.stepsCount}</td>
                    <td className="border px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(r.reasons || []).map((reason, i) => (
                          <span
                            key={i}
                            className={`px-2 py-0.5 rounded text-xs ${reasonBadge(reason)}`}
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="border px-2 py-2">
                      <button
                        className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        onClick={async () => {
                          try {
                            setBusyIds((p) => ({ ...p, [r._id]: true }));
                            const { data } = await axios.post(`/api/orders-migrate/migrate/ids`, {
                              ids: [r._id],
                            });
                            if (data?.success) {
                              toast.success(`Migrated 1 order (#${r.Order_Number})`);
                              await fetchFlatOrders();
                            } else {
                              toast.error("Migration failed");
                            }
                          } catch (e) {
                            console.error(e);
                            toast.error(e.message || "Migration failed");
                          } finally {
                            setBusyIds((p) => {
                              const copy = { ...p };
                              delete copy[r._id];
                              return copy;
                            });
                          }
                        }}
                        disabled={busy}
                      >
                        {busy ? "..." : "Migrate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="text-xs text-gray-500 p-2">
            Showing {filtered.length} / {rows.length} needing migration.
          </div>
        </div>
      )}
    </div>
  );
}
