// src/Components/TransactionEditModal.jsx
import React, { useEffect, useMemo, useState } from "react";

export default function TransactionEditModal({
  open,
  onClose,
  onSave,
  initialData,
  customers = [],
}) {
  const [form, setForm] = useState(() => ({
    Transaction_id: "",
    Transaction_uuid: "", // ✅ FIX ADDED
    Transaction_date: "",
    Amount: 0,
    Description: "",
    Credit_id: "",
    Debit_id: "",
  }));

  useEffect(() => {
    if (open && initialData) {
      setForm({
        Transaction_id: initialData.Transaction_id || "",
        Transaction_uuid: initialData.Transaction_uuid || "", // ✅ FIX
        Transaction_date: normalizeDateInput(initialData.Transaction_date),
        Amount: Number(
          initialData.Amount ||
          initialData.CreditAmount ||
          initialData.DebitAmount ||
          0
        ),
        Description: initialData.Description || "",
        Credit_id: initialData.Credit_id || "",
        Debit_id: initialData.Debit_id || "",
      });
    }
  }, [open, initialData]);

  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) =>
      String(a.Customer_name || "").localeCompare(
        String(b.Customer_name || ""),
        "en",
        { sensitivity: "base" }
      )
    );
  }, [customers]);

  if (!open) return null;

  const canSave =
    Boolean(form.Transaction_date) &&
    Number(form.Amount) > 0 &&
    Boolean(form.Credit_id) &&
    Boolean(form.Debit_id);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!canSave) return;

    const payload = {
      Transaction_id: form.Transaction_id,
      Transaction_uuid: form.Transaction_uuid, // ✅ FIX (IMPORTANT)
      Transaction_date: new Date(form.Transaction_date).toISOString(),
      Amount: Number(form.Amount),
      Description: form.Description || "",
      Credit_id: form.Credit_id,
      Debit_id: form.Debit_id,
    };

    await onSave?.(payload);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-xl">
        <h3 className="text-lg font-semibold mb-4">Edit Transaction</h3>

        <div className="space-y-4">
          <div className="text-xs text-gray-500">
            Txn ID: {form.Transaction_id}
          </div>

          <label className="block text-sm">
            Date:
            <input
              type="date"
              value={form.Transaction_date}
              onChange={(e) =>
                handleChange("Transaction_date", e.target.value)
              }
              className="w-full mt-1 border p-2 rounded"
            />
          </label>

          <label className="block text-sm">
            Amount:
            <input
              type="number"
              value={form.Amount}
              onChange={(e) => handleChange("Amount", e.target.value)}
              className="w-full mt-1 border p-2 rounded"
            />
          </label>

          <label className="block text-sm">
            Description:
            <input
              type="text"
              value={form.Description}
              onChange={(e) => handleChange("Description", e.target.value)}
              className="w-full mt-1 border p-2 rounded"
            />
          </label>

          <label className="block text-sm">
            Credit Name:
            <select
              value={form.Credit_id}
              onChange={(e) => handleChange("Credit_id", e.target.value)}
              className="w-full mt-1 border p-2 rounded"
            >
              <option value="">Select Account</option>
              {sortedCustomers.map((c) => (
                <option key={c.Customer_uuid} value={c.Customer_uuid}>
                  {c.Customer_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            Debit Name:
            <select
              value={form.Debit_id}
              onChange={(e) => handleChange("Debit_id", e.target.value)}
              className="w-full mt-1 border p-2 rounded"
            >
              <option value="">Select Account</option>
              {sortedCustomers.map((c) => (
                <option key={c.Customer_uuid} value={c.Customer_uuid}>
                  {c.Customer_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button className="px-4 py-2 bg-gray-300 rounded" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`px-4 py-2 rounded ${
              !canSave
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
            disabled={!canSave}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeDateInput(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
