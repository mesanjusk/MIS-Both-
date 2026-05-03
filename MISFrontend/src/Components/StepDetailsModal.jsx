import React, { useState } from "react";

export default function StepDetailsModal({ step, onSave, onClose, paymentOptions = [] }) {
  const [form, setForm] = useState({
    completed: step.completed || false,
    charge: step.charge || "",
    paymentStatus: step.paymentStatus || "Balance",
    paymentMode: step.paymentMode || "",
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave({ ...step, ...form });
    onClose();
  };

  return (
    <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">{step.name} Details</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-red-500">X</button>
        </div>
        <div className="space-y-3">
          <label className="flex items-center space-x-1">
            <input
              type="checkbox"
              checked={form.completed}
              onChange={e => handleChange("completed", e.target.checked)}
            />
            <span>Completed</span>
          </label>
          <input
            type="number"
            className="w-full p-2 border rounded"
            placeholder="Charge"
            value={form.charge}
            onChange={e => handleChange("charge", e.target.value)}
          />
          <select
            className="w-full p-2 border rounded"
            value={form.paymentStatus}
            onChange={e => handleChange("paymentStatus", e.target.value)}
          >
            <option value="Paid">Paid</option>
            <option value="Balance">Balance</option>
          </select>
          {form.paymentStatus === "Paid" && (
            <select
              className="w-full p-2 border rounded"
              value={form.paymentMode}
              onChange={e => handleChange("paymentMode", e.target.value)}
            >
              <option value="">Payment Mode</option>
              {paymentOptions.map((mode, i) => (
                <option key={i} value={mode}>{mode}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={handleSave} className="bg-blue-600 text-white w-full py-2 rounded">Save</button>
          <button onClick={onClose} className="bg-gray-400 text-white w-full py-2 rounded">Cancel</button>
        </div>
      </div>
    </div>
  );
}
