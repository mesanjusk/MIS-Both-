import React, { useState, useEffect } from "react";
import axios from '../apiClient.js';
import { useNavigate } from "react-router-dom";
import BillUpdate from "../Reports/billUpdate";
import AddOrder1 from "../Pages/addOrder1";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function AllBills() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [searchOrder, setSearchOrder] = useState("");
    const [customers, setCustomers] = useState({});
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showOrderModal, setShowOrderModal] = useState(false);

    // Table sorting
    const [sortBy, setSortBy] = useState("Order_Number");
    const [sortDir, setSortDir] = useState("desc");

    useEffect(() => {
        const fetchOrders = axios.get("/api/orders/GetOrderList");
        const fetchCustomers = axios.get("/api/customers/GetCustomersList");

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
                            acc[customer.Customer_uuid] = {
                                name: customer.Customer_name,
                                mobile: customer.Mobile || "",
                            };
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

    // Table search & sort logic
    const filteredOrders = orders.map(order => {
        const customerObj = customers[order.Customer_uuid] || {};
        return {
            ...order,
            Customer_name: customerObj.name || "Unknown",
            Mobile: customerObj.mobile || "",
        };
    }).filter(order => {
        // Search by customer name
        return order.Customer_name.toLowerCase().includes(searchOrder.toLowerCase());
    }).sort((a, b) => {
        let vA, vB;
        switch (sortBy) {
            case "Order_Number":
                vA = a.Order_Number;
                vB = b.Order_Number;
                break;
            case "createdAt":
                vA = new Date(a.createdAt);
                vB = new Date(b.createdAt);
                break;
            case "Customer_name":
                vA = a.Customer_name.toLowerCase();
                vB = b.Customer_name.toLowerCase();
                break;
            case "Mobile":
                vA = a.Mobile || "";
                vB = b.Mobile || "";
                break;
            case "Remark":
                vA = (a.Remark || "").toLowerCase();
                vB = (b.Remark || "").toLowerCase();
                break;
            default:
                vA = a.Order_Number;
                vB = b.Order_Number;
        }
        if (vA < vB) return sortDir === "asc" ? -1 : 1;
        if (vA > vB) return sortDir === "asc" ? 1 : -1;
        return 0;
    });

    // Table sorting handler
    const handleSort = (field) => {
        if (sortBy === field) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
        } else {
            setSortBy(field);
            setSortDir("asc");
        }
    };

    // PDF/Excel Export
    const exportToPDF = () => {
        const doc = new jsPDF();
        const tableColumn = ["Order #", "Date", "Customer Name", "Mobile", "Remark"];
        const tableRows = [];

        filteredOrders.forEach(order => {
            tableRows.push([
                order.Order_Number,
                new Date(order.createdAt).toLocaleDateString(),
                order.Customer_name,
                order.Mobile,
                order.Items[i].Remark || ""
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
            "Date": new Date(order.createdAt).toLocaleDateString(),
            "Customer Name": order.Customer_name,
            "Mobile": order.Mobile,
            "Remark": order.Items[i].Remark || ""
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Bills");

        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const file = new Blob([excelBuffer], { type: "application/octet-stream" });
        saveAs(file, "bill_report.xlsx");
    };

    // Modal handlers
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
            <div className="pt-12 pb-20 max-w-7xl mx-auto px-4">
                {/* Export Buttons */}
                <div className="mb-3 flex gap-2">
                    <button
                        onClick={exportToPDF}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        PDF
                    </button>
                    <button
                        onClick={exportToExcel}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Excel
                    </button>
                </div>
                {/* Search */}
                <div className="flex flex-wrap items-center bg-white w-full p-2 mb-4 rounded-lg shadow gap-2">
                    <input
                        type="text"
                        placeholder="Search by Customer Name"
                        className="form-control text-black bg-gray-100 rounded-full px-4 py-2"
                        value={searchOrder}
                        onChange={(e) => setSearchOrder(e.target.value)}
                    />
                </div>
                {/* Table */}
                <div className="overflow-x-auto bg-white rounded-lg shadow">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-2 text-xs font-bold text-left cursor-pointer" onClick={() => handleSort("Order_Number")}>
                                    Order #
                                    {sortBy === "Order_Number" && (sortDir === "asc" ? " ▲" : " ▼")}
                                </th>
                                <th className="p-2 text-xs font-bold text-left cursor-pointer" onClick={() => handleSort("createdAt")}>
                                    Date
                                    {sortBy === "createdAt" && (sortDir === "asc" ? " ▲" : " ▼")}
                                </th>
                                <th className="p-2 text-xs font-bold text-left cursor-pointer" onClick={() => handleSort("Customer_name")}>
                                    Customer Name
                                    {sortBy === "Customer_name" && (sortDir === "asc" ? " ▲" : " ▼")}
                                </th>
                                <th className="p-2 text-xs font-bold text-left cursor-pointer" onClick={() => handleSort("Mobile")}>
                                    Mobile
                                    {sortBy === "Mobile" && (sortDir === "asc" ? " ▲" : " ▼")}
                                </th>
                                <th className="p-2 text-xs font-bold text-left cursor-pointer" onClick={() => handleSort("Remark")}>
                                    Remark
                                    {sortBy === "Remark" && (sortDir === "asc" ? " ▲" : " ▼")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.length > 0 ? (
                                filteredOrders.map((order, index) => (
                                    <tr key={index} className="hover:bg-gray-100 cursor-pointer"
                                        onClick={() => handleEditClick(order)}
                                    >
                                        <td className="p-2 text-sm">{order.Order_Number}</td>
                                        <td className="p-2 text-sm">{new Date(order.createdAt).toLocaleDateString()}</td>
                                        <td className="p-2 text-sm">{order.Customer_name}</td>
                                        <td className="p-2 text-sm">{order.Mobile}</td>
                                        <td className="p-2 text-sm">{order.Items[i].Remark || "-"}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="text-center text-gray-500 p-4">
                                        No orders found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
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
            {/* Modals */}
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
