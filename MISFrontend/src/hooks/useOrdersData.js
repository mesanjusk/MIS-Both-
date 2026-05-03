import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "../apiClient";
import { differenceInCalendarDays } from "date-fns";
import toast from "react-hot-toast";

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

export const TASK_TYPES = {
  DELIVERED: "Delivered",
  CANCEL: "Cancel",
  OTHER: "Other",
};

export const ROLE_TYPES = {
  ADMIN: "admin",
};

const REQUEST_LIMITS = {
  ORDERS: 500,
  CUSTOMERS: 1000,
  TASK_GROUPS: 500,
};

const API_ENDPOINTS = {
  ORDERS: "/api/orders/GetOrderList",
  CUSTOMERS: "/api/customers/GetCustomersList",
  TASK_GROUPS: "/api/taskgroup/GetTaskgroupList",
  UPDATE_STATUS: "/order/updateStatus",
};

const CLOSED_TASKS = new Set([
  TASK_TYPES.DELIVERED.toLowerCase(),
  TASK_TYPES.CANCEL.toLowerCase(),
]);

const MIN_LOAD_MS = 800;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const toCustomerMap = (rows = []) =>
  rows.reduce((acc, customer) => {
    if (customer?.Customer_uuid) {
      acc[customer.Customer_uuid] =
        customer.Customer_name || customer.Mobile || customer.Code || "Unknown";
    }
    return acc;
  }, {});

const normalizeOrders = (orders = [], customerMap = {}) =>
  orders.map((order) => {
    const statusArr = Array.isArray(order.Status) ? order.Status : [];
    const highestStatusTask =
      statusArr.length === 0
        ? null
        : statusArr.reduce((prev, current) =>
            Number(prev?.Status_number) > Number(current?.Status_number)
              ? prev
              : current
          );

    return {
      ...order,
      highestStatusTask,
      Customer_name: customerMap[order.Customer_uuid] || "Unknown",
    };
  });

/* ------------------------------------------------------------------ */
/* Hook                                                               */
/* ------------------------------------------------------------------ */

export function useOrdersData() {
  const [orderList, setOrderList] = useState([]);
  const [orderMap, setOrderMap] = useState({});
  const [customerMap, setCustomerMap] = useState({});
  const [tasksMeta, setTasksMeta] = useState([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  /* ---------------- Normalize & Store ---------------- */

  const applyNormalizedData = useCallback((orders, customers) => {
    const normalized = normalizeOrders(orders, customers);
    setOrderList(normalized);
    setOrderMap(
      normalized.reduce((acc, order) => {
        const id = order.Order_uuid || order._id || order.Order_id;
        if (id) acc[id] = order;
        return acc;
      }, {})
    );
  }, []);

  /* ---------------- Data Loader (NO cleanup here) ---------------- */

  const loadData = useCallback(
    async (signal) => {
      setLoadError(null);
      setIsOrdersLoading(true);
      setIsTasksLoading(true);

      const start = Date.now();

      try {
        const [ordersRes, customersRes] = await Promise.all([
          axios.get(
            `${API_ENDPOINTS.ORDERS}?page=1&limit=${REQUEST_LIMITS.ORDERS}`,
            { signal }
          ),
          axios.get(
            `${API_ENDPOINTS.CUSTOMERS}?page=1&limit=${REQUEST_LIMITS.CUSTOMERS}`,
            { signal }
          ),
        ]);

        const orders = ordersRes?.data?.success
          ? ordersRes.data.result ?? []
          : [];
        const customers = customersRes?.data?.success
          ? customersRes.data.result ?? []
          : [];

        const customerLookup = toCustomerMap(customers);
        setCustomerMap(customerLookup);
        applyNormalizedData(orders, customerLookup);
      } catch (err) {
        if (signal.aborted) return;
        setLoadError("Failed to fetch orders or customers.");
        toast.error("Failed to fetch orders or customers.");
        setOrderList([]);
        setOrderMap({});
        setCustomerMap({});
      } finally {
        const dt = Date.now() - start;
        const pad = Math.max(0, MIN_LOAD_MS - dt);
        setTimeout(() => setIsOrdersLoading(false), pad);
      }

      try {
        const res = await axios.get(
          `${API_ENDPOINTS.TASK_GROUPS}?page=1&limit=${REQUEST_LIMITS.TASK_GROUPS}`,
          { signal }
        );

        if (res?.data?.success) {
          const rows = (res.data.result ?? [])
            .filter((task) => {
              const name = String(task?.Task_group || "").trim();
              return name && !CLOSED_TASKS.has(name.toLowerCase());
            })
            .map((task, index) => {
              const name = String(task.Task_group || "").trim();
              const seq =
                Number(
                  task.Sequence ??
                    task.sequence ??
                    task.Order ??
                    task.order ??
                    task.Sort_order ??
                    task.Position ??
                    task.Index ??
                    index
                ) || index;
              return { name, seq };
            })
            .sort((a, b) => a.seq - b.seq);

          setTasksMeta(rows);
        } else {
          setTasksMeta([]);
        }
      } catch (err) {
        if (!signal.aborted) setTasksMeta([]);
      } finally {
        setIsTasksLoading(false);
      }
    },
    [applyNormalizedData]
  );

  /* ---------------- Effect (cleanup lives HERE) ---------------- */

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadData]);

  /* ---------------- Derived Data ---------------- */

  const baseGroupedOrders = useMemo(
    () =>
      orderList.reduce((acc, order) => {
        const task = String(
          order?.highestStatusTask?.Task || TASK_TYPES.OTHER
        ).trim();
        if (!acc[task]) acc[task] = [];
        acc[task].push(order);
        return acc;
      }, {}),
    [orderList]
  );

  /* ---------------- Mutators ---------------- */

  const replaceOrder = useCallback(
    (nextOrder) => {
      if (!nextOrder) return;
      const id = nextOrder.Order_uuid || nextOrder._id || nextOrder.Order_id;
      if (!id) return;

      setOrderList((prev) => {
        const idx = prev.findIndex(
          (o) => (o.Order_uuid || o._id || o.Order_id) === id
        );
        const normalized = normalizeOrders([nextOrder], customerMap)[0];

        if (idx === -1) return [normalized, ...prev];
        const copy = prev.slice();
        copy[idx] = { ...prev[idx], ...normalized };
        return copy;
      });
    },
    [customerMap]
  );

  const patchOrder = useCallback((orderId, patch) => {
    if (!orderId || !patch) return;
    setOrderList((prev) =>
      prev.map((order) =>
        (order.Order_uuid || order._id || order.Order_id) === orderId
          ? { ...order, ...patch }
          : order
      )
    );
  }, []);

  useEffect(() => {
    setOrderMap(
      orderList.reduce((acc, order) => {
        const id = order.Order_uuid || order._id || order.Order_id;
        if (id) acc[id] = order;
        return acc;
      }, {})
    );
  }, [orderList]);

  /* ---------------- Utils ---------------- */

  const computeAgeDays = useCallback((order) => {
    const created = order?.highestStatusTask?.CreatedAt;
    if (!created) return 0;
    return differenceInCalendarDays(new Date(), new Date(created));
  }, []);

  /* ---------------- Public API ---------------- */

  return {
    orderList,
    orderMap,
    baseGroupedOrders,
    tasksMeta,
    customerMap,
    isOrdersLoading,
    isTasksLoading,
    loadError,
    setLoadError,
    refresh: () => {
      const controller = new AbortController();
      loadData(controller.signal);
      return () => controller.abort();
    },
    replaceOrder,
    patchOrder,
    computeAgeDays,
  };
}

/* ------------------------------------------------------------------ */
/* Status API                                                         */
/* ------------------------------------------------------------------ */

export const statusApi = {
  updateStatus: (orderId, task) =>
    axios.post(API_ENDPOINTS.UPDATE_STATUS, {
      Order_id: orderId,
      Task: task,
    }),
};

export const LABELS = {
  SEARCH_PLACEHOLDER: "Search by Customer or Order No.",
  MOVE: "Move",
  EDIT: "Edit",
  VIEW: "View",
};
