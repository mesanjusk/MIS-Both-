import React, { useEffect, useState } from 'react';
import axios from '../apiClient.js';
import AddOrder1 from "../Pages/addOrder1";

const AccountTransaction = () => {
    const [transactions, setTransactions] = useState([]);
    const [filteredEntries, setFilteredEntries] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [customerSearchTerm, setCustomerSearchTerm] = useState('');
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });

    useEffect(() => {
        const fetchTransactions = async () => {
            try {
                const response = await axios.get('/api/transaction');
                if (response.data.success) {
                    setTransactions(response.data.result);
                }
            } catch (error) {
                console.error('Error fetching transactions:', error);
            }
        };

        const fetchCustomers = async () => {
            try {
                const response = await axios.get('/api/customers/GetCustomersList');
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

    const customerMap = customers.reduce((acc, customer) => {
        acc[customer.Customer_uuid] = customer.Customer_name;
        return acc;
    }, {});

    const handleSearchInputChange = (e) => {
        const searchTerm = e.target.value.trim().toLowerCase();
        setCustomerSearchTerm(searchTerm);

        if (searchTerm) {
            const filtered = customers.filter(customer =>
                customer.Customer_name.toLowerCase().includes(searchTerm)
            );
            setFilteredCustomers(filtered);
        } else {
            setFilteredCustomers([]);
        }
    };

    const handleCustomerSelect = (customer) => {
        setSelectedCustomer(customer);
        setCustomerSearchTerm(customer.Customer_name);
        setFilteredCustomers([]);
    };

    const handleSearch = () => {
        if (!selectedCustomer) {
            setFilteredEntries([]);
            return;
        }
    
        const customerUUID = selectedCustomer.Customer_uuid;
    
        const filtered = transactions.flatMap(transaction => {
            const isWithinDateRange = (!startDate || new Date(transaction.Transaction_date) >= new Date(startDate)) &&
                                      (!endDate || new Date(transaction.Transaction_date) <= new Date(endDate));
            if (isWithinDateRange) {
                const customerEntries = transaction.Journal_entry.filter(entry => entry.Account_id === customerUUID);
                if (customerEntries.length > 0) {
                    return transaction.Journal_entry
                        .filter(entry => entry.Account_id !== customerUUID)
                        .map(entry => ({
                            ...entry,
                            Transaction_id: transaction.Transaction_id,
                            Transaction_date: transaction.Transaction_date,
                            Description: transaction.Description,
                        }));
                }
            }
            return [];
        });
    
        let runningDebit = 0;
        let runningCredit = 0;
    
        const updatedEntries = filtered.map(entry => {
            if (entry.Type === 'Debit') {
                runningDebit += entry.Amount || 0;
            } else if (entry.Type === 'Credit') {
                runningCredit += entry.Amount || 0;
            }
    
            return {
                ...entry,
                Balance: runningCredit - runningDebit,
            };
        });
    
        setFilteredEntries(updatedEntries);
    };

    const calculateTotals = () => {
        const totals = filteredEntries.reduce(
            (acc, entry) => {
                if (entry.Type === 'Debit') {
                    acc.debit += entry.Amount || 0;
                } else if (entry.Type === 'Credit') {
                    acc.credit += entry.Amount || 0;
                }
                return acc;
            },
            { debit: 0, credit: 0 }
        );

        const total = totals.credit - totals.debit;

        return { debit: totals.debit, credit: totals.credit, total };
    };

    const totals = calculateTotals();

    const handlePrint = () => {
        window.print();
    };

    const handleOrder = () => {
        setShowOrderModal(true);
    };

    const closeModal = () => {
        setShowOrderModal(false);
    };

    // Sort function
    const sortTable = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });

        const sortedEntries = [...filteredEntries].sort((a, b) => {
            if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
            if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        setFilteredEntries(sortedEntries);
    };

    return (
        <>
            <div className="no-print">
            </div>
            <div className="pt-12 pb-20">
                <div className="flex flex-wrap bg-white p-4 space-x-4">
                    <label className="flex flex-col">
                        Start :
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="p-2 border rounded-md mt-2"
                        />
                    </label>
                    <label className="flex flex-col">
                        End :
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="p-2 border rounded-md mt-2"
                        />
                    </label>
                </div>

                <button
                    onClick={handlePrint}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600"
                >
                    <svg className="h-6 w-6 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 9V3h12v6M6 15h12m-6 0v6m0 0H9m3 0h3" />
                    </svg>
                    Print
                </button>

                <div className="mt-4 flex flex-col items-center max-w-xs mx-auto">
                    <input
                        type="text"
                        placeholder="Search Customer"
                        value={customerSearchTerm}
                        onChange={handleSearchInputChange}
                        className="w-full p-2 border rounded-md"
                    />
                    {filteredCustomers.length > 0 && (
                        <ul className="absolute bg-white border border-gray-300 w-full z-10 mt-1">
                            {filteredCustomers.map((customer) => (
                                <li
                                    key={customer.Customer_uuid}
                                    className="cursor-pointer p-2 hover:bg-gray-200"
                                    onClick={() => handleCustomerSelect(customer)}
                                >
                                    {customer.Customer_name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="mt-4 text-center">
                    <button
                        onClick={handleSearch}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-blue-700"
                    >
                        Search
                    </button>
                </div>

                <main className="overflow-x-auto mt-6">
                    <div className="w-full overflow-x-scroll">
                        {filteredEntries.length > 0 ? (
                            <table className="min-w-full table-auto border-collapse">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th
                                            onClick={() => sortTable("Transaction_id")}
                                            className="py-2 px-4 cursor-pointer"
                                        >
                                            No
                                        </th>
                                        <th
                                            onClick={() => sortTable("Transaction_date")}
                                            className="py-2 px-4 cursor-pointer"
                                        >
                                            Date
                                        </th>
                                        <th
                                            onClick={() => sortTable("Account_id")}
                                            className="py-2 px-4 cursor-pointer"
                                        >
                                            Name
                                        </th>
                                        <th
                                            onClick={() => sortTable("Description")}
                                            className="py-2 px-4 cursor-pointer"
                                        >
                                            Description
                                        </th>
                                        <th
                                            onClick={() => sortTable("Debit")}
                                            className="py-2 px-4 cursor-pointer"
                                        >
                                            Credit
                                        </th>
                                        <th
                                            onClick={() => sortTable("Credit")}
                                            className="py-2 px-4 cursor-pointer"
                                        >
                                            Debit
                                        </th>
                                        <th
                                            onClick={() => sortTable("Balance")}
                                            className="py-2 px-4 cursor-pointer"
                                        >
                                            Balance
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEntries.map((entry, id) => {
                                        const customerName = customerMap[entry.Account_id] || 'Unknown';
                                        return (
                                            <tr key={id} className="border-t hover:bg-gray-50">
                                                <td className="py-2 px-4">{entry.Transaction_id}</td>
                                                <td className="py-2 px-4">{new Date(entry.Transaction_date).toLocaleDateString()}</td>
                                                <td className="py-2 px-4">{customerName}</td>
                                                <td className="py-2 px-4">{entry.Description}</td>
                                                <td className="py-2 px-4">{entry.Type === 'Debit' ? entry.Amount : '0'}</td>
                                                <td className="py-2 px-4">{entry.Type === 'Credit' ? entry.Amount : '0'}</td>
                                                <td className="py-2 px-4">{entry.Balance}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-100">
                                        <td colSpan="6" className="py-2 px-4 text-right font-semibold">Total</td>
                                        <td className="py-2 px-4 font-semibold">{totals.total}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        ) : (
                            <p className="text-center text-gray-600">No transactions found.</p>
                        )}
                    </div>
                </main>

                <div className="fixed bottom-6 right-6">
                    <button
                        onClick={handleOrder}
                        className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-700"
                    >
                        <svg
                            className="h-8 w-8"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v14m7-7H5" />
                        </svg>
                    </button>
                </div>
            </div>

            {showOrderModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                        <AddOrder1 closeModal={closeModal} />
                    </div>
                </div>
            )}

            <div className="no-print">
            </div>
        </>
    );
};

export default AccountTransaction;
