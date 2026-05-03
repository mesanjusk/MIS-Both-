import React from "react";

export default function StatusTable({ status }) {
  if (!status || status.length === 0) {
    return (
      <div className="text-center text-gray-500 mb-6 text-sm">
        No status data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto mb-6">
      <table className="min-w-full w-full bg-white rounded-lg shadow border text-xs">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left font-bold text-gray-700">#</th>
            <th className="px-2 py-2 text-left font-bold text-gray-700">
              Date
            </th>
            <th className="px-2 py-2 text-left font-bold text-gray-700">
              Task
            </th>
            <th className="px-2 py-2 text-left font-bold text-gray-700">
              User
            </th>
            <th className="px-2 py-2 text-left font-bold text-gray-700">
              Delivery
            </th>
          </tr>
        </thead>
        <tbody>
          {status.map((s, idx) => (
            <tr key={idx} className="border-t">
              <td className="px-2 py-2">{idx + 1}</td>
              <td className="px-2 py-2">
                {s.CreatedAt ? new Date(s.CreatedAt).toLocaleDateString() : "-"}
              </td>
              <td className="px-2 py-2">{s.Task || "-"}</td>
              <td className="px-2 py-2">{s.Assigned || "-"}</td>
              <td className="px-2 py-2">
                {s.Delivery_Date
                  ? new Date(s.Delivery_Date).toLocaleDateString()
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
