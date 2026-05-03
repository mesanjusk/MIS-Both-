import { memo, useMemo, useCallback } from "react";
import OrderCard from "./OrderCard";
import { TASK_TYPES } from "../../hooks/useOrdersData";

const headerColors = {
  [TASK_TYPES.DELIVERED]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [TASK_TYPES.CANCEL]: "bg-rose-50 text-rose-700 border-rose-200",
};

function OrderColumn({
  title,
  orders,
  isAdmin,
  allowDrop,
  onDrop,
  onDragOver,
  onDragStart,
  onView,
  onEdit,
  onCancel,
  onMove,
  isTouchDevice,
}) {
  const normalizedTitle = title || TASK_TYPES.OTHER;
  const isDelivered = normalizedTitle === TASK_TYPES.DELIVERED;
  const isCancel = normalizedTitle === TASK_TYPES.CANCEL;
  const headerClass = headerColors[normalizedTitle] || "bg-slate-50 text-slate-700 border-slate-200";
  const droppable = allowDrop && !isCancel;

  const handleDrop = useCallback(
    (event) => onDrop?.(event, normalizedTitle, droppable),
    [droppable, normalizedTitle, onDrop]
  );

  const handleDragOver = useCallback(
    (event) => onDragOver?.(event, droppable),
    [droppable, onDragOver]
  );

  const renderOrders = useMemo(
    () =>
      orders.map((order) => {
        const id = order.Order_uuid || order._id || order.Order_id;
        return (
          <OrderCard
            key={id}
            order={order}
            isAdmin={isAdmin}
            onView={onView}
            onEdit={onEdit}
            onCancel={onCancel}
            onMove={isTouchDevice ? () => onMove?.(order) : undefined}
            draggable={!isTouchDevice && droppable}
            onDragStart={onDragStart}
          />
        );
      }),
    [orders, isAdmin, onView, onEdit, onCancel, onMove, isTouchDevice, droppable, onDragStart]
  );

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white flex flex-col min-h-[200px]"
      role="list"
      aria-label={`${normalizedTitle} column`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <header
        className={`sticky top-0 z-[1] px-1.5 py-1.5 flex items-center justify-between text-[11px] font-semibold border-b ${headerClass}`}
      >
        <span className="truncate" title={normalizedTitle}>
          {normalizedTitle}
        </span>
        <span className="text-[11px] text-slate-500">{orders.length}</span>
      </header>

      <div className="p-1 space-y-1 min-h-[140px]">
        {orders.length === 0 ? (
          <div className="text-[11px] text-slate-500 py-5 text-center border-2 border-dashed rounded-lg border-slate-200 bg-slate-50/60">
            {isCancel
              ? "Cancel is display-only"
              : isDelivered
              ? "Drag an order here to mark as Delivered"
              : droppable
              ? "No orders in this stage. Drag & drop here"
              : "No orders in this stage"}
          </div>
        ) : (
          renderOrders
        )}
      </div>
    </section>
  );
}

const areOrderColumnPropsEqual = (prevProps, nextProps) => {
  if (
    prevProps.title !== nextProps.title ||
    prevProps.isAdmin !== nextProps.isAdmin ||
    prevProps.allowDrop !== nextProps.allowDrop ||
    prevProps.isTouchDevice !== nextProps.isTouchDevice ||
    prevProps.onDrop !== nextProps.onDrop ||
    prevProps.onDragOver !== nextProps.onDragOver ||
    prevProps.onDragStart !== nextProps.onDragStart ||
    prevProps.onView !== nextProps.onView ||
    prevProps.onEdit !== nextProps.onEdit ||
    prevProps.onCancel !== nextProps.onCancel ||
    prevProps.onMove !== nextProps.onMove
  ) {
    return false;
  }

  const prevOrders = prevProps.orders || [];
  const nextOrders = nextProps.orders || [];

  if (prevOrders.length !== nextOrders.length) {
    return false;
  }

  return prevOrders === nextOrders;
};

export default memo(OrderColumn, areOrderColumnPropsEqual);
