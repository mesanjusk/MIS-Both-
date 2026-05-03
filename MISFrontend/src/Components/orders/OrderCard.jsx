import React, { useMemo } from "react";
import { LABELS, TASK_TYPES } from "../../hooks/useOrdersData";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

function OrderCard({
  order,
  isAdmin,
  draggable,
  onView,
  onEdit,
  onCancel,
  onDragStart,
  onMove,
  highlight,
}) {
  const ageInfo = useMemo(() => {
    const created = order?.highestStatusTask?.CreatedAt;
    return {
      label: formatDate(created),
    };
  }, [order]);

  const handleKeyPress = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onView(order);
    }
  };

  const handleDragStart = (event) => {
    const id = order.Order_uuid || order._id || order.Order_id;
    const task = order?.highestStatusTask?.Task;
    onDragStart?.(id, task, event);
  };

  const handleMove = (event) => {
    event.stopPropagation();
    onMove?.(order);
  };

  const handleEdit = (event) => {
    event.stopPropagation();
    onEdit?.(order);
  };

  const handleView = () => onView(order);

  return (
    <div
      className={`relative rounded-md border border-gray-200 bg-white p-0.5 hover:shadow-sm transition-shadow group ${
        highlight ? "ring-2 ring-indigo-300" : ""
      }`}
      draggable={draggable}
      onDragStart={handleDragStart}
      role="listitem"
      aria-label={`Order ${order.Order_Number || ""}`}
    >
      <button
        type="button"
        onClick={handleView}
        onKeyDown={handleKeyPress}
        className="w-full text-left outline-none"
        aria-label="Open order details"
      >
        <div className="pr-2">
          <div
            className="font-semibold text-[12px] text-gray-900 leading-snug line-clamp-2"
            title={order.Customer_name}
          >
            {order.Customer_name}
          </div>
        </div>
        {order.Customer_name && order.Customer_name.length <= 22 && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-gray-600 pr-6">
            <span>{ageInfo.label}</span>
            <span className="text-gray-400">•</span>
            <span className="font-semibold text-indigo-700">#{order.Order_Number || "-"}</span>
          </div>
        )}
      </button>

      <div className="mt-1 flex items-center gap-1.5">
        {onMove && (
          <button
            type="button"
            onClick={handleMove}
            className="text-[11px] px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          >
            {LABELS.MOVE}
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={handleEdit}
            className="text-[11px] px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50"
          >
            {LABELS.EDIT}
          </button>
        )}
        {isAdmin && onCancel && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(order);
            }}
            className="text-[11px] px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          >
            {TASK_TYPES.CANCEL}
          </button>
        )}
      </div>
    </div>
  );
}

export default React.memo(OrderCard);
