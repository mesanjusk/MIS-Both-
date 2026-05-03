import { useMemo } from "react";
import { isToday } from "date-fns";
import { useOrdersData, TASK_TYPES } from "./useOrdersData";
import { useOrderGrouping } from "./useOrderGrouping";
import { normalizeRole } from "../constants/roles";

const toLower = (value = "") => value.toString().trim().toLowerCase();
const isClosed = (task = "") => {
  const normalized = toLower(task);
  return normalized === toLower(TASK_TYPES.DELIVERED) || normalized === toLower(TASK_TYPES.CANCEL);
};

const isTodayDate = (value) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return isToday(date);
};

export function useDashboardData({ role, userName, isAdmin }) {
  const {
    orderList,
    orderMap,
    tasksMeta,
    isOrdersLoading,
    isTasksLoading,
    loadError,
    refresh,
    replaceOrder,
    patchOrder,
  } = useOrdersData();

  const normalizedUser = useMemo(() => toLower(userName), [userName]);
  const normalizedRole = useMemo(() => normalizeRole(role), [role]);

  const visibleOrders = useMemo(() => {
    if (isAdmin) return orderList;
    return orderList.filter((order) => toLower(order?.highestStatusTask?.Assigned) === normalizedUser);
  }, [isAdmin, orderList, normalizedUser]);

  const { columnOrder, groupedOrders, filteredOrders } = useOrderGrouping(
    visibleOrders,
    tasksMeta,
    "",
    "dateDesc",
    isAdmin,
    { includeCancelColumn: false }
  );

  const activeOrders = useMemo(
    () => visibleOrders.filter((order) => !isClosed(order?.highestStatusTask?.Task)),
    [visibleOrders]
  );

  const pendingToday = useMemo(
    () => activeOrders.filter((order) => isTodayDate(order?.highestStatusTask?.CreatedAt)),
    [activeOrders]
  );

  const deliveredToday = useMemo(
    () =>
      visibleOrders.filter(
        (order) => toLower(order?.highestStatusTask?.Task) === toLower(TASK_TYPES.DELIVERED) &&
          isTodayDate(order?.highestStatusTask?.CreatedAt)
      ),
    [visibleOrders]
  );

  const cancelledToday = useMemo(
    () =>
      visibleOrders.filter(
        (order) => toLower(order?.highestStatusTask?.Task) === toLower(TASK_TYPES.CANCEL) &&
          isTodayDate(order?.highestStatusTask?.CreatedAt)
      ),
    [visibleOrders]
  );

  const summary = useMemo(
    () => ({
      activeOrders: activeOrders.length,
      pendingToday: pendingToday.length,
      deliveredToday: deliveredToday.length,
      cancelledToday: cancelledToday.length,
    }),
    [activeOrders.length, pendingToday.length, deliveredToday.length, cancelledToday.length]
  );

  const myPendingOrders = useMemo(
    () =>
      activeOrders
        .filter((order) =>
          normalizedRole.includes("office") ? toLower(order?.highestStatusTask?.Assigned) === normalizedUser : true
        )
        .slice(0, 10),
    [activeOrders, normalizedRole, normalizedUser]
  );


  return {
    orderList,
    orderMap,
    tasksMeta,
    isOrdersLoading,
    isTasksLoading,
    loadError,
    refresh,
    replaceOrder,
    patchOrder,
    columnOrder,
    groupedOrders,
    filteredOrders,
    visibleOrders,
    activeOrders,
    myPendingOrders,
    summary,
  };
}
