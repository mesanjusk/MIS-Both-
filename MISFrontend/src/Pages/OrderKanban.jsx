import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../apiClient";
import { toast, LoadingSpinner } from "../Components";
import { useOrdersData } from "../hooks/useOrdersData";
import { useOrderDnD } from "../hooks/useOrderDnD";
import OrderBoard from "../components/orders/OrderBoard";

const STAGES = ["Enquiry", "Design", "Printing", "Finishing", "Ready", "Delivered"];

const normalize = (value = "") => String(value).trim().toLowerCase();

const toDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

export default function OrderKanban() {
  const navigate = useNavigate();
  const { orderList, isOrdersLoading, loadError, refresh, patchOrder } = useOrdersData();
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const moveOrderToStage = useCallback(
    async (orderId, nextStage, setStatusMessage) => {
      if (!orderId || !nextStage) return;

      const currentOrder = orderList.find(
        (order) => (order?.Order_uuid || order?._id || order?.Order_id) === orderId
      );

      if (normalize(currentOrder?.highestStatusTask?.Task) === normalize(nextStage)) {
        return;
      }

      try {
        await axios.patch(`/orders/${orderId}/stage`, { stage: nextStage });
        patchOrder(orderId, {
          highestStatusTask: {
            ...(currentOrder?.highestStatusTask || {}),
            Task: nextStage,
            CreatedAt: new Date().toISOString(),
          },
        });
        setStatusMessage?.(`Order moved to ${nextStage}`);
        toast.success(`Moved to ${nextStage}`);
      } catch (error) {
        try {
          await axios.post("/order/updateStatus", { Order_id: orderId, Task: nextStage });
          patchOrder(orderId, {
            highestStatusTask: {
              ...(currentOrder?.highestStatusTask || {}),
              Task: nextStage,
              CreatedAt: new Date().toISOString(),
            },
          });
          setStatusMessage?.(`Order moved to ${nextStage}`);
          toast.success(`Moved to ${nextStage}`);
        } catch (fallbackError) {
          console.error("Failed to update stage", error, fallbackError);
          toast.error("Could not update order stage.");
        }
      }
    },
    [orderList, patchOrder]
  );

  const { dragHandlers, statusMessage } = useOrderDnD({ onMove: moveOrderToStage });

  const filteredOrders = useMemo(() => {
    return (orderList || []).filter((order) => {
      const stage = order?.highestStatusTask?.Task;
      const createdDate = toDateInput(order?.highestStatusTask?.CreatedAt);

      const matchesStage =
        statusFilter === "all" ? true : normalize(stage) === normalize(statusFilter);

      const matchesFrom = fromDate ? createdDate >= fromDate : true;
      const matchesTo = toDate ? createdDate <= toDate : true;

      return matchesStage && matchesFrom && matchesTo;
    });
  }, [orderList, statusFilter, fromDate, toDate]);

  const groupedOrders = useMemo(() => {
    const base = STAGES.reduce((acc, stage) => {
      acc[stage] = [];
      return acc;
    }, {});

    filteredOrders.forEach((order) => {
      const currentStage = STAGES.find(
        (stage) => normalize(stage) === normalize(order?.highestStatusTask?.Task)
      );
      const stage = currentStage || "Enquiry";
      base[stage]?.push(order);
    });

    return base;
  }, [filteredOrders]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Order Kanban Board</h1>
            <p className="text-sm text-slate-500">Track workflow from enquiry to delivery.</p>
          </div>

          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setFromDate("");
              setToDate("");
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</div>
      ) : null}

      {isOrdersLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <OrderBoard
            columnOrder={STAGES}
            groupedOrders={groupedOrders}
            isAdmin
            isTouchDevice={window.matchMedia?.("(pointer: coarse)")?.matches || false}
            dragHandlers={dragHandlers}
            onView={(order) => {
              const oid = order?.Order_uuid || order?._id || order?.Order_id;
              if (oid) navigate(`/orderUpdate/${oid}`);
            }}
            onEdit={() => {}}
            onCancel={() => {}}
            onMove={(order, nextStage) => moveOrderToStage(order?.Order_uuid || order?._id || order?.Order_id, nextStage, null)}
            statusMessage={statusMessage}
          />
        </div>
      )}
    </div>
  );
}
