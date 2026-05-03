import axios from "../apiClient.js";

export const fetchOrders = () => axios.get("/api/orders/GetOrderList");
export const fetchDeliveredOrders = () => axios.get("/order/GetDeliveredList");

/**
 * ✅ Backend route: /order/updateOrder/:id
 */
export const updateOrder = (orderId, payload) => axios.put(`/order/updateOrder/${orderId}`, payload);

export const addOrder = (payload) => axios.post("/api/orders/addOrder", payload);

export const fetchBillList = () => axios.get("/order/GetBillList");

export const fetchOrderStepsById = (orderId) => axios.get(`/order/getStepsByOrderId/${orderId}`);

export const updateOrderSteps = (payload) => axios.post("/order/updateOrderSteps", payload);

export const toggleOrderStep = (payload) => axios.post("/order/steps/toggle", payload);

export const addOrderStatus = (payload) => axios.post("/order/addStatus", payload);

export const updateOrderDelivery = (orderId, payload) =>
  axios.put(`/order/updateDelivery/${orderId}`, payload);

/* ---------------- Bills: NEW ---------------- */

/**
 * ✅ Paginated bills list
 * GET /order/GetBillListPaged?page&limit&search&task&paid
 */
export const fetchBillListPaged = ({
  page = 1,
  limit = 50,
  search = "",
  task = "",
  paid = "", // "", "paid", "unpaid"
} = {}) => {
  return axios.get("/order/GetBillListPaged", {
    params: { page, limit, search, task, paid },
  });
};

/**
 * ✅ Persist paid/unpaid
 * PATCH /order/bills/:id/status
 * Body MUST be: { billStatus: "paid" | "unpaid", paidBy?, paidNote?, txnUuid?, txnId? }
 */
export const updateBillStatus = (orderId, billStatus, meta = {}) => {
  return axios.patch(`/order/bills/${orderId}/status`, {
    billStatus,
    ...meta,
  });
};


export const fetchMyOrderTasks = (userName) => axios.get('/api/orders/tasks/mine', { params: { userName } });
export const fetchOrderQueue = () => axios.get('/api/orders/tasks/queue');
export const assignOrderToUser = (orderId, payload) => axios.patch(`/order/${orderId}/assign`, payload);
