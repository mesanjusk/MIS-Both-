import React, { useState, useEffect } from "react";
import axios from '../apiClient.js';
import { useNavigate } from "react-router-dom";
import AddOrder1 from "../Pages/addOrder1";
import OrderUpdate from "../Pages/OrderUpdate";
import { LoadingSpinner } from "../Components";

export default function AllOrder() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [searchOrder, setSearchOrder] = useState("");
    const [filter, setFilter] = useState("Design");
    const [tasks, setTasks] = useState([]);
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [customers, setCustomers] = useState({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [ordersRes, customersRes] = await Promise.all([
                    axios.get("/api/orders/GetOrderList"),
                    axios.get("/api/customers/GetCustomersList")
                ]);

                setOrders(ordersRes.data.success ? ordersRes.data.result : []);

                if (customersRes.data.success) {
                    const customerMap = customersRes.data.result.reduce((acc, customer) => {
                        if (customer.Customer_uuid && customer.Customer_name) {
                            acc[customer.Customer_uuid] = customer.Customer_name;
                        }
                        return acc;
                    }, {});
                    setCustomers(customerMap);
                } else {
                    setCustomers({});
                }
            } catch (err) {
                console.error("Error fetching data:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    useEffect(() => {
        const fetchTasks = async () => {
            try {
                const res = await axios.get("/api/taskgroup/GetTaskgroupList");
                if (res.data.success) {
                    const filteredTasks = res.data.result.filter(task =>
                        !["delivered", "cancel"].includes(task.Task_group.trim().toLowerCase())
                    );
                    setTasks(filteredTasks);
                } else {
                    setTasks([]);
                }
            } catch (err) {
                console.error("Error fetching tasks:", err);
            }
        };

        fetchTasks();
    }, []);

    const taskOptions = [...new Set(tasks.map((task) => task.Task_group.trim()))];

    const filteredOrders = orders
        .map((order) => {
            const highestStatusTask = (order.Status && order.Status.length > 0)
                ? order.Status.reduce((prev, current) =>
                    prev.Status_number > current.Status_number ? prev : current
                ) : {};

            const customerName = customers[order.Customer_uuid] || "Unknown";

            return {
                ...order,
                highestStatusTask,
                Customer_name: customerName,
            };
        })
        .filter((order) => {
            const matchesSearch =
                searchOrder === "" ||
                order.Customer_name.toLowerCase().includes(searchOrder.toLowerCase());

            const matchesFilter =
                filter === "" || order.highestStatusTask?.Task === filter;

            return matchesSearch && matchesFilter;
        });

    const handleEditClick = (order) => {
        setSelectedOrder(order);
        setShowEditModal(true);
    };

    const handleOrder = () => setShowOrderModal(true);
    const closeModal = () => setShowOrderModal(false);
    const closeEditModal = () => {
        setShowEditModal(false);
        setSelectedOrder(null);
    };

    return (
        <>
            <div className="order-update-content">
                <div className="pt-12 pb-20">
                    <div className="d-flex flex-wrap bg-white w-100 max-w-md p-2 mx-auto">
                        <input
                            type="text"
                            placeholder="Search by Customer Name"
                            className="form-control text-black bg-gray-100 rounded-full"
                            value={searchOrder}
                            onChange={(e) => setSearchOrder(e.target.value)}
                        />
                    </div>

                    <div className="overflow-x-scroll flex space-x-1 py-0" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                        <style>{`.overflow-x-scroll::-webkit-scrollbar {display: none;}`}</style>
                        {isLoading ? (
                            <div className="flex justify-center py-4 w-full"><LoadingSpinner /></div>
                        ) : (
                            taskOptions.map((taskGroup) => (
                                <button
                                    key={taskGroup}
                                    onClick={() => {
                                        setFilter(taskGroup);
                                    }}
                                    className={`sanju ${filter === taskGroup ? "bg-blue-200" : "bg-gray-100"} uppercase rounded-full text-black p-2 text-xs me-1`}
                                >
                                    {taskGroup}
                                </button>
                            ))
                        )}
                    </div>

                    <main className="flex flex-1 p-2 overflow-y-auto">
                        <div className="flex flex-col w-100 space-y-2 max-w-md mx-auto">
                            {isLoading ? (
                                <div className="flex justify-center py-4"><LoadingSpinner /></div>
                            ) : (
                                filteredOrders.map((order) => (
                                    <div key={order.Order_uuid || order.Order_Number}>
                                        <div
                                            onClick={() => handleEditClick(order)}
                                            className="grid grid-cols-5 gap-1 flex items-center p-1 bg-white rounded-lg shadow-inner cursor-pointer"
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div className="w-12 h-12 p-2 col-start-1 col-end-1 bg-gray-100 rounded-full flex items-center justify-center">
                                                <strong className="text-l text-gray-500">{order.Order_Number}</strong>
                                            </div>
                                            <div className="p-2 col-start-2 col-end-8">
                                                <strong className="text-l text-gray-900">{order.Customer_name}</strong><br />
                                                <label className="text-xs">
                                                    {order.highestStatusTask?.CreatedAt ? new Date(order.highestStatusTask.CreatedAt).toLocaleDateString() : ''} - {order.Items[i].Remark}
                                                </label>
                                            </div>
                                            <div className="items-center justify-center text-right col-end-9 col-span-1">
                                                <label className="text-xs pr-2">
                                                    {order.highestStatusTask?.Delivery_Date ? new Date(order.highestStatusTask.Delivery_Date).toLocaleDateString() : ''}
                                                </label><br />
                                                <label className="text-s text-blue-500 pr-2">
                                                    {order.highestStatusTask?.Assigned}
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </main>
                </div>

                {showOrderModal && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <AddOrder1 closeModal={closeModal} />
                        </div>
                    </div>
                )}

                {showEditModal && (
                    <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
                        <OrderUpdate order={selectedOrder} onClose={closeEditModal} />
                    </div>
                )}

            </div>
        </>
    );
}
