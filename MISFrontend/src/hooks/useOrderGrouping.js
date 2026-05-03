import { useMemo } from "react";
import { TASK_TYPES } from "./useOrdersData";

const CLOSED_TASKS = new Set([
  TASK_TYPES.DELIVERED.toLowerCase(),
  TASK_TYPES.CANCEL.toLowerCase(),
]);

const sorters = {
  dateDesc: (a, b) =>
    new Date(b?.highestStatusTask?.CreatedAt || 0).getTime() -
    new Date(a?.highestStatusTask?.CreatedAt || 0).getTime(),
  dateAsc: (a, b) =>
    new Date(a?.highestStatusTask?.CreatedAt || 0).getTime() -
    new Date(b?.highestStatusTask?.CreatedAt || 0).getTime(),
  orderNo: (a, b) =>
    String(a.Order_Number || "").localeCompare(String(b.Order_Number || "")),
  name: (a, b) =>
    String(a.Customer_name || "").localeCompare(String(b.Customer_name || "")),
};

const normalizeTaskLabel = (task) => {
  const cleaned = String(task || "").trim();
  return cleaned || TASK_TYPES.OTHER;
};

export function useOrderGrouping(
  orderList,
  tasksMeta,
  searchQuery,
  sortKey,
  isAdmin,
  options = {}
) {
  const {
    includeCancelColumn = true,
    singleColumn = false,                 // ✅ NEW
    singleColumnLabel = "Enquiry",        // ✅ NEW
  } = options;

  const searchedOrders = useMemo(() => {
    const q = String(searchQuery || "").trim().toLowerCase();
    if (!q) return orderList;

    return orderList.filter((order) => {
      const byName = String(order.Customer_name || "").toLowerCase().includes(q);
      const byNo = String(order.Order_Number || "").toLowerCase().includes(q);
      return byName || byNo;
    });
  }, [orderList, searchQuery]);

  const sortedOrders = useMemo(() => {
    const sorter = sorters[sortKey] || sorters.dateDesc;
    return [...searchedOrders].sort(sorter);
  }, [searchedOrders, sortKey]);

  // ✅ If singleColumn mode: force one column and put all orders there
  const columnOrder = useMemo(() => {
    if (singleColumn) return [singleColumnLabel];
    return [];
  }, [singleColumn, singleColumnLabel]);

  const groupedOrders = useMemo(() => {
    if (singleColumn) {
      return { [singleColumnLabel]: sortedOrders };
    }

    // ===== normal board behavior =====
    const base = tasksMeta.map((task) => task.name);
    const seen = new Set(base.map((name) => name.toLowerCase()));

    for (const order of sortedOrders) {
      const task = normalizeTaskLabel(order?.highestStatusTask?.Task);
      const lower = task.toLowerCase();
      if (!CLOSED_TASKS.has(lower) && !seen.has(lower)) {
        base.push(task);
        seen.add(lower);
      }
    }

    const otherIndex = base.findIndex((name) => name === TASK_TYPES.OTHER);
    if (otherIndex > -1) {
      base.splice(otherIndex, 1);
      base.push(TASK_TYPES.OTHER);
    }

    if (!base.includes(TASK_TYPES.DELIVERED)) base.push(TASK_TYPES.DELIVERED);
    if (includeCancelColumn && !base.includes(TASK_TYPES.CANCEL)) base.push(TASK_TYPES.CANCEL);

    if (!isAdmin && includeCancelColumn) {
      const cancelIndex = base.indexOf(TASK_TYPES.CANCEL);
      if (cancelIndex > -1) {
        base.splice(cancelIndex, 1);
        base.push(TASK_TYPES.CANCEL);
      }
    }

    const groups = base.reduce((acc, name) => {
      acc[name] = [];
      return acc;
    }, {});

    for (const order of sortedOrders) {
      const task = normalizeTaskLabel(order?.highestStatusTask?.Task);
      if (!groups[task]) groups[task] = [];
      groups[task].push(order);
    }

    return groups;
  }, [
    singleColumn,
    singleColumnLabel,
    sortedOrders,
    tasksMeta,
    includeCancelColumn,
    isAdmin,
  ]);

  return {
    columnOrder: singleColumn ? columnOrder : Object.keys(groupedOrders),
    groupedOrders,
    filteredOrders: sortedOrders,
  };
}
