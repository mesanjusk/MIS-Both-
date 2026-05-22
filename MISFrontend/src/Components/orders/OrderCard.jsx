import React, { useMemo } from "react";

const fmt = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const dueMeta = (dateVal) => {
  const d = fmt(dateVal);
  if (!d) return { label: "—", cls: "text-gray-400" };
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(d); target.setHours(0,0,0,0);
  const diff = Math.floor((target - today) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: "text-red-600 font-semibold" };
  if (diff === 0) return { label: "Due today",                  cls: "text-amber-600 font-semibold" };
  if (diff === 1) return { label: "Due tomorrow",               cls: "text-blue-600" };
  return { label: `Due in ${diff}d`, cls: "text-gray-500" };
};

function OrderCard({ order, onView, onEdit, onMove }) {
  const due  = useMemo(() => dueMeta(order?.highestStatusTask?.Delivery_Date || order?.dueDate), [order]);
  const item = order?.Items?.[0];
  const itemSummary = item ? `${item.Item || item.item || "Item"} × ${item.Qty || item.qty || 1}` : null;
  const total = (order?.Items || []).reduce((s, i) => s + (Number(i.Amount) || Number(i.Rate) * Number(i.Qty) || 0), 0);

  return (
    <div
      className="relative rounded-lg border border-gray-200 bg-white p-2 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onView?.(order)}
      role="listitem"
      aria-label={`Order ${order.Order_Number || ""}`}
    >
      {/* Order # + Customer */}
      <div className="font-bold text-[12px] text-gray-900 leading-snug truncate">
        #{order.Order_Number} · {order.Customer_name || "Unknown"}
      </div>

      {/* Item summary */}
      {itemSummary && (
        <div className="text-[11px] text-gray-500 truncate mt-0.5">{itemSummary}</div>
      )}

      {/* Due + Amount */}
      <div className={`text-[10.5px] mt-1 ${due.cls}`}>{due.label}</div>
      {total > 0 && (
        <div className="text-[11px] font-semibold text-indigo-700 mt-0.5">
          ₹{total.toLocaleString("en-IN")}
        </div>
      )}

      {/* Actions */}
      <div className="mt-1.5 flex gap-1">
        {onMove && (
          <button type="button"
            onClick={(e) => { e.stopPropagation(); onMove?.(order); }}
            className="text-[11px] px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
            → Next Stage
          </button>
        )}
        {onEdit && (
          <button type="button"
            onClick={(e) => { e.stopPropagation(); onEdit?.(order); }}
            className="text-[11px] px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-50">
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

export default React.memo(OrderCard);
