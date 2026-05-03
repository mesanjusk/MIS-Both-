// ARCHIVED: Legacy duplicate report file moved from src/Reports/allBills copy.jsx. Not routed or imported by App.
import React, { useState, useEffect } from "react";
import { fetchBillList } from '../../services/orderService.js';
import { fetchCustomers as fetchCustomersList } from '../../services/customerService.js';
import { useNavigate } from "react-router-dom";
import BillUpdate from "../../Reports/billUpdate";
import AddOrder1 from "../../Pages/addOrder1";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";


export default function AllBills() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [searchOrder, setSearchOrder] = useState("");
    const [filter, setFilter] = useState("");
    const [customers, setCustomers] = useState({});
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showOrderModal, setShowOrderModal] = useState(false);

    function addOrder1() {
        navigate("/addOrder1");
    }

    useEffect(() => {
        const fetchOrders = fetchBillList();
        const fetchCustomers = fetchCustomersList();

        Promise.all([fetchOrders, fetchCustomers])
            .then(([ordersRes, customersRes]) => {
                if (ordersRes.data.success) {
                    setOrders(ordersRes.data.result);
                } else {
                    setOrders([]);
                }

                if (customersRes.data.success) {
                    const customerMap = customersRes.data.result.reduce((acc, customer) => {
                        if (customer.Customer_uuid && customer.Customer_name) {
                            acc[customer.Customer_uuid] = customer.Customer_name;
                        } else {
                            console.warn("Invalid customer data:", customer);
                        }
                        return acc;
                    }, {});
                    setCustomers(customerMap);
                } else {
                    setCustomers({});
                }
            })
            .catch(err => console.log('Error fetching data:', err));
    }, []);
    const exportToPDF = () => {
        const doc = new jsPDF();
        const tableColumn = ["Order #", "Customer", "Created At", "Remark", "Assigned", "Delivery"];
        const tableRows = [];

        filteredOrders.forEach(order => {
            tableRows.push([
                order.Order_Number,
                order.Customer_name,
                new Date(order.createdAt).toLocaleDateString(),
                order.Items[i].Remark,
                order.highestStatusTask?.Assigned || "",
                order.highestStatusTask?.Delivery_Date
                    ? new Date(order.highestStatusTask.Delivery_Date).toLocaleDateString()
                    : ""
            ]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 20,
        });

        doc.text("Bill Report", 14, 15);
        doc.save("bill_report.pdf");
    };

    const exportToExcel = () => {
        const data = filteredOrders.map(order => ({
            "Order Number": order.Order_Number,
            "Customer Name": order.Customer_name,
            "Created At": new Date(order.createdAt).toLocaleDateString(),
            "Remark": order.Items[i].Remark,
            "Assigned": order.highestStatusTask?.Assigned || "",
            "Delivery Date": order.highestStatusTask?.Delivery_Date
                ? new Date(order.highestStatusTask.Delivery_Date).toLocaleDateString()
                : ""
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Bills");

        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const file = new Blob([excelBuffer], { type: "application/octet-stream" });
        saveAs(file, "bill_report.xlsx");
    };

    const filteredOrders = orders.map(order => {
        const highestStatusTask = order.Status.reduce((prev, current) =>
            (prev.Status_number > current.Status_number) ? prev : current, {});

        const customerName = customers[order.Customer_uuid] || "Unknown";


        return {
            ...order,
            highestStatusTask,
            Customer_name: customerName
        };
    }).filter(order => {
        const matchesSearch = order.Customer_name.toLowerCase().includes(searchOrder.toLowerCase());

        const task = (order.highestStatusTask.Task || "").trim().toLowerCase();
        const filterValue = filter.trim().toLowerCase();
        const matchesFilter = filterValue === "" || task === filterValue;

        return matchesSearch && matchesFilter;
    });

    const handleEditClick = (order) => {
        setSelectedOrder(order);
        setShowEditModal(true);
    };

    const closeEditModal = () => {
        setShowEditModal(false);
        setSelectedOrder(null);
    };

    const handleOrder = () => {
        setShowOrderModal(true);
    };

    const closeModal = () => {
        setShowOrderModal(false);
    };

    return (
        <>
             <div className="pt-12 pb-20  max-w-7xl mx-auto px-4">
                <button
                                onClick={exportToPDF}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                PDF
                            </button>
                            <button
                                onClick={exportToExcel}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Excel
                            </button>
                {/* Search + Export */}
               <div className="flex flex-wrap items-center bg-white w-full p-2 mb-4 rounded-lg shadow gap-2">
                    
                        <input
                            type="text"
                            placeholder="Search by Customer Name"
                            className="form-control text-black bg-gray-100 rounded-full px-4 py-2"
                            value={searchOrder}
                            onChange={(e) => setSearchOrder(e.target.value)}
                        />
                        
                            
                        
                    
                </div>

                {/* Orders List */}
                <main className="flex flex-1 p-4 overflow-y-auto">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 w-full">
                        {filteredOrders.length > 0 ? (
                            filteredOrders.map((order, index) => (
                                <div
                                    key={index}
                                    onClick={() => handleEditClick(order)}
                                    className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-all cursor-pointer"
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="font-semibold text-lg text-gray-800">
                                            #{order.Order_Number}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {new Date(order.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div className="text-md font-medium text-gray-700">
                                        {order.Customer_name}
                                    </div>
                                    <div className="text-sm text-gray-600 mb-2">{order.Items[i].Remark}</div>
                                    <div className="flex justify-between text-sm text-gray-600">
                                        <span>Assigned: {order.highestStatusTask?.Assigned || "N/A"}</span>
                                        <span>
                                            Delivery:{" "}
                                            {order.highestStatusTask?.Delivery_Date
                                                ? new Date(order.highestStatusTask.Delivery_Date).toLocaleDateString()
                                                : "N/A"}
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-gray-500">No orders found</div>
                        )}
                    </div>
                </main>

                {/* Add Order Floating Button */}
                <div className="fixed bottom-20 right-8">
                    <button
                        onClick={handleOrder}
                        className="w-12 h-12 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center"
                    >
                        <svg
                            className="h-8 w-8"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            strokeWidth="2"
                            stroke="currentColor"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path stroke="none" d="M0 0h24v24H0z" />
                            <circle cx="12" cy="12" r="9" />
                            <line x1="9" y1="12" x2="15" y2="12" />
                            <line x1="12" y1="9" x2="12" y2="15" />
                        </svg>
                    </button>
                </div>
            </div>

            {showOrderModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <AddOrder1 closeModal={closeModal} />
                    </div>
                </div>
            )}
            {showEditModal && (
                <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center ">
                    <BillUpdate order={selectedOrder} onClose={closeEditModal} />
                </div>
            )}
        </>
    );
}
