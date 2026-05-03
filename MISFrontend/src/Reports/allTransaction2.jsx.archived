import React, { useEffect, useState } from 'react';
import axios from '../apiClient.js';
import AddOrder1 from "../Pages/addOrder1";
import { FaWhatsapp, FaSortUp, FaSortDown } from 'react-icons/fa';

const AllTransaction2 = () => {
    const [transactions, setTransactions] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [outstandingReport, setOutstandingReport] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all' | 'receivable' | 'payable'
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [showCustomerTransactions, setShowCustomerTransactions] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    useEffect(() => {
        const fetchTransactions = async () => {
            try {
                const response = await axios.get('/transaction');
                if (response.data.success) {
                    setTransactions(response.data.result);
                }
            } catch (error) {
                console.error('Error fetching transactions:', error);
            }
        };

        const fetchCustomers = async () => {
            try {
                const response = await axios.get('/customer/GetCustomersList');
                if (response.data.success) {
                    setCustomers(response.data.result);
                }
            } catch (error) {
                console.error('Error fetching customers:', error);
            }
        };

        fetchTransactions();
        fetchCustomers();
    }, []);

    useEffect(() => {
        generateOutstandingReport();
    }, [transactions, customers]);

    const generateOutstandingReport = () => {
        const report = customers.map(customer => {
            let debit = 0;
            let credit = 0;
            transactions.forEach(tx => {
                tx.Journal_entry.forEach(entry => {
                    if (entry.Account_id === customer.Customer_uuid) {
                        if (entry.Type === 'Debit') debit += entry.Amount || 0;
                        if (entry.Type === 'Credit') credit += entry.Amount || 0;
                    }
                });
            });
            return {
                uuid: customer.Customer_uuid,
                name: customer.Customer_name,
                mobile: customer.Mobile_number || 'No phone number',
                debit,
                credit,
                balance: credit - debit
            };
        }).filter(r => (r.debit !== 0 || r.credit !== 0) && r.balance !== 0);

        setOutstandingReport(report);
    };

    const sortedReport = [...outstandingReport]
        .filter(item => {
            if (filterType === 'receivable') return item.balance > 0;
            if (filterType === 'payable') return item.balance < 0;
            return true;
        })
        .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sendMessageToAPI = async (name, phone, balance) => {
        const today = new Date().toLocaleDateString('en-IN');
        const senderName = "S.K.Digital";

        const message = `Dear ${name}, your balance is ₹${balance} as of ${today}. Please clear it soon. - ${senderName}`;

        const payload = {
            mobile: phone,
            userName: name,
            type: 'customer',
            message: message
        };

        try {
            const { data: result } = await axios.post('/usertask/send-message', payload);
            if (result.error) {
                alert("Failed to send: " + result.error);
            } else {
                alert("Message sent successfully.");
            }
        } catch (error) {
            console.error("Request failed:", error);
            alert("Failed to send message.");
        }
    };

    const sendWhatsApp = (name, phone, balance) => {
        if (phone === 'No phone number') {
            alert("No phone number available for this customer.");
            return;
        }
        sendMessageToAPI(name, phone, balance);
    };

    const viewTransactions = (customer) => {
        setSelectedCustomer(customer);
        setShowCustomerTransactions(true);
    };

    const closeTransactionModal = () => {
        setShowCustomerTransactions(false);
        setSelectedCustomer(null);
    };

    // Helper function to check if the date is valid
    const isValidDate = (date) => {
        const parsedDate = new Date(date);
        return !isNaN(parsedDate.getTime());
    };

    return (
        <>
            <div className="no-print">
            </div>
            <div className="pt-12 pb-20">
                <div className="mt-6 max-w-4xl mx-auto bg-white p-4 rounded shadow">
                    <h2 className="text-lg font-semibold mb-4 text-center text-blue-700">Outstanding Report</h2>

                    {/* Search and Filter Buttons */}
                    <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center">
                        <input
                            type="text"
                            placeholder="Search customer name..."
                            className="flex-1 p-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />

                        <div className="flex gap-2">
                            <button
                                onClick={() => setFilterType('receivable')}
                                className={`px-4 py-2 rounded ${filterType === 'receivable' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'} hover:bg-blue-200`}
                            >
                                Receivable
                            </button>
                            <button
                                onClick={() => setFilterType('payable')}
                                className={`px-4 py-2 rounded ${filterType === 'payable' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'} hover:bg-red-200`}
                            >
                                Payable
                            </button>
                            <button
                                onClick={() => setFilterType('all')}
                                className={`px-4 py-2 rounded ${filterType === 'all' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700'} hover:bg-gray-200`}
                            >
                                Show All
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <table className="w-full table-auto text-sm border">
                        <thead className="bg-blue-100 text-blue-900">
                            <tr>
                                <th onClick={() => handleSort('name')} className="border px-3 py-2 cursor-pointer text-left">
                                    Customer {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
                                </th>
                                <th onClick={() => handleSort('mobile')} className="border px-3 py-2 cursor-pointer text-left">
                                    Mobile {sortConfig.key === 'mobile' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
                                </th>
                                <th onClick={() => handleSort('balance')} className="border px-3 py-2 cursor-pointer text-right">
                                    Amount {sortConfig.key === 'balance' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
                                </th>
                                <th className="border px-3 py-2 text-center">Send</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedReport.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="text-center py-6 text-gray-500">
                                        No customers found.
                                    </td>
                                </tr>
                            ) : (
                                sortedReport.map((item, index) => (
                                    <tr key={index} className="border-t hover:bg-gray-50">
                                        <td
                                            className="px-3 py-2 cursor-pointer text-blue-600"
                                            onClick={() => viewTransactions(item)} // Make name clickable
                                        >
                                            {item.name}
                                        </td>
                                        <td className="px-3 py-2">{item.mobile}</td>
                                        <td className={`px-3 py-2 text-right ${item.balance < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                                            ₹{Math.abs(item.balance)}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {item.mobile !== 'No phone number' && (
                                                <button onClick={() => sendWhatsApp(item.name, item.mobile, item.balance)}>
                                                    <FaWhatsapp className="text-blue-600 text-lg" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Customer Transaction Modal */}
                {showCustomerTransactions && (
                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                            <h3 className="text-xl font-semibold mb-4">{selectedCustomer.name}'s Transactions</h3>
                            <table className="w-full table-auto text-sm border">
                                <thead className="bg-gray-100 text-gray-900">
                                    <tr>
                                        <th className="border px-3 py-2 text-left">Date</th>
                                        <th className="border px-3 py-2 text-left">Description</th>
                                        <th className="border px-3 py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions
                                        .filter(tx => tx.Journal_entry.some(entry => entry.Account_id === selectedCustomer.uuid)) // Filter by selected customer
                                        .map((tx, idx) => (
                                            <tr key={idx} className="border-t hover:bg-gray-50">
                                                <td className="px-3 py-2">
                                                    {isValidDate(tx.Date) ? new Date(tx.Date).toLocaleDateString() : 'Invalid Date'}
                                                </td>
                                                <td className="px-3 py-2">{tx.Description || 'No Description'}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {tx.Journal_entry.map(entry => {
                                                        if (entry.Account_id === selectedCustomer.uuid) {
                                                            return entry.Amount ? `₹${entry.Amount.toFixed(2)}` : 'No Amount';
                                                        }
                                                        return null;
                                                    }).join(', ')}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                            <button
                                onClick={closeTransactionModal}
                                className="mt-4 bg-gray-600 text-white px-4 py-2 rounded"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}

                {/* Order Modal */}
                {showOrderModal && (
                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                            <AddOrder1 closeModal={() => setShowOrderModal(false)} />
                        </div>
                    </div>
                )}

                <div className="no-print">
                </div>
            </div>
        </>
    );
};

export default AllTransaction2;
