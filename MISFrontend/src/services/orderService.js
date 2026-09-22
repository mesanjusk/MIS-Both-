import axios from "../apiClient.js";

export const fetchOrders = () => axios.get("/api/orders/GetOrderList");
export const fetchDeliveredOrders = () => axios.get("/api/orders/GetDeliveredList");

/**
 * ✅ Backend route: /api/orders/updateOrder/:id
 */
export const updateOrder = (orderId, payload) => axios.put(`/api/orders/updateOrder/${orderId}`, payload);

export const addOrder = (payload) => axios.post("/api/orders/addOrder", payload);

export const fetchBillList = () => axios.get("/api/orders/GetBillList");

export const fetchOrderStepsById = (orderId) => axios.get(`/api/orders/getStepsByOrderId/${orderId}`);

export const updateOrderSteps = (payload) => axios.post("/api/orders/updateOrderSteps", payload);

export const toggleOrderStep = (payload) => axios.post("/api/orders/steps/toggle", payload);

export const addOrderStatus = (payload) => axios.post("/api/orders/addStatus", payload);

export const updateOrderDelivery = (orderId, payload) =>
  axios.put(`/api/orders/updateDelivery/${orderId}`, payload);

/* ---------------- Bills: NEW ---------------- */

/**
 * ✅ Paginated bills list
 * GET /api/orders/GetBillListPaged?page&limit&search&task&paid
 */
export const fetchBillListPaged = ({
  page = 1,
  limit = 50,
  search = "",
  billNumber = "",
  task = "",
  paid = "", // "", "paid", "unpaid"
  date = "", // YYYY-MM-DD (order/bill date)
} = {}) => {
  return axios.get("/api/orders/GetBillListPaged", {
    params: { page, limit, search, billNumber, task, paid, date },
  });
};

/**
 * ✅ Persist paid/unpaid
 * PATCH /api/orders/bills/:id/status
 * Body MUST be: { billStatus: "paid" | "unpaid", paidBy?, paidNote?, txnUuid?, txnId? }
 */
export const updateBillStatus = (orderId, billStatus, meta = {}) => {
  return axios.patch(`/api/orders/bills/${orderId}/status`, {
    billStatus,
    ...meta,
  });
};


export const fetchMyOrderTasks = (userName) => axios.get('/api/orders/tasks/mine', { params: { userName } });
export const fetchOrderQueue = () => axios.get('/api/orders/tasks/queue');
export const fetchPendingTasksOverview = () => axios.get('/api/orders/tasks/overview');
// Backend route reads `assignedTo` (either a Mongo user id or the "Customer"
// sentinel) off the body — accept either shape here so existing callers that
// pass `userId`/`userName` keep working alongside newer `assignedTo` callers.
export const assignOrderToUser = (orderId, payload = {}) => {
  const assignedTo = payload.assignedTo ?? payload.userId ?? payload.userName ?? '';
  return axios.patch(`/api/orders/${orderId}/assign`, {
    assignedTo,
    assignedToType: payload.assignedToType || 'user',
    assignedBy: payload.assignedBy,
  });
};

// Moves an order to a different pipeline stage (Design/Print/Post Print/
// Ready & Archive column, or any specific stage within one). The backend
// normalizes any pre-migration legacy stage value it finds on the order
// first, so this also "fixes" an old stuck order the moment it's moved.
export const moveOrderStage = (orderId, stage) => axios.patch(`/api/orders/${orderId}/stage`, { stage });
