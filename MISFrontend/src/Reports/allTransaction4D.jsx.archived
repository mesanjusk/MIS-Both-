import React, { useEffect, useState } from 'react';
import axios from '../apiClient.js';
import AddOrder1 from "../Pages/addOrder1";
import { FaTrash } from "react-icons/fa";


const AllTransaction = () => {
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
    const [openingBalance, setOpeningBalance] = useState(0);
    const [closingBalance, setClosingBalance] = useState(0);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [entryToDelete, setEntryToDelete] = useState(null);

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
            setOpeningBalance(0);
            setClosingBalance(0);
            return;
        }

        const customerUUID = selectedCustomer.Customer_uuid;
        let runningDebit = 0;
        let runningCredit = 0;
        let openingBalanceTemp = 0;
        let closingBalanceTemp = 0;

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

        const updatedEntries = filtered.map(entry => {
            if (entry.Type === 'Debit') {
                runningDebit += entry.Amount || 0;
            } else if (entry.Type === 'Credit') {
                runningCredit += entry.Amount || 0;
            }

            closingBalanceTemp = runningCredit - runningDebit;

            return {
                ...entry,
                Balance: closingBalanceTemp,
            };
        });

        // Calculate opening balance (just before start date)
        const openingEntries = transactions.flatMap(transaction => {
            if (startDate && new Date(transaction.Transaction_date) < new Date(startDate)) {
                const customerEntries = transaction.Journal_entry.filter(entry => entry.Account_id === customerUUID);
                return customerEntries.length > 0
                    ? transaction.Journal_entry.filter(entry => entry.Account_id !== customerUUID).map(entry => ({
                        ...entry,
                        Transaction_id: transaction.Transaction_id,
                        Transaction_date: transaction.Transaction_date,
                        Description: transaction.Description,
                    }))
                    : [];
            }
            return [];
        });

        let runningOpeningDebit = 0;
        let runningOpeningCredit = 0;

        openingEntries.forEach(entry => {
            if (entry.Type === 'Debit') {
                runningOpeningDebit += entry.Amount || 0;
            } else if (entry.Type === 'Credit') {
                runningOpeningCredit += entry.Amount || 0;
            }
        });

        openingBalanceTemp = runningOpeningCredit - runningOpeningDebit;

        setOpeningBalance(openingBalanceTemp);
        setClosingBalance(closingBalanceTemp);
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
    const formatDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
};

    return (
        <>
            <div className="no-print">
            </div>
            <div className="min-w-xl pt-12 pb-20">
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

                <div className="mt-4 min-w-xl flex flex-wrap gap-2">
                    {customers
                        .filter((c) => c.Customer_group === 'Bank and Account')
                        .map((customer) => (
                            <button
                                key={customer.Customer_uuid}
                                onClick={() => {
                                    handleCustomerSelect(customer);
                                    setTimeout(handleSearch, 0); // Ensure selectedCustomer updates first
                                }}
                                className="px-4 py-2 bg-blue-500 text-white rounded-md shadow hover:bg-blue-600"
                            >
                                {customer.Customer_name}
                            </button>
                        ))}
                </div>

                <div className="mt-4 text-center">
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

                    <button
                        onClick={handleSearch}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-blue-700 mt-2"
                    >
                        Search
                    </button>
                </div>

                <main className="overflow-x-auto mt-6">
                    <div className="w-full min-w-xl overflow-x-scroll">
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
                                        <th className="py-2 px-4">Actions</th>

                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEntries.map((entry, index) => (
                                        <tr key={index} className="border-t">
                                            <td className="py-2 px-4">{entry.Transaction_id}</td>
                                            <td className="py-2 px-4">{formatDate(entry.Transaction_date)}</td>

<td className="py-2 px-4">
{customerMap[entry.Account_id]}
</td>
<td className="py-2 px-4">{entry.Description}</td>
<td className="py-2 px-4">
{entry.Type === 'Credit' ? entry.Amount : '-'}
</td>
<td className="py-2 px-4">
{entry.Type === 'Debit' ? entry.Amount : '-'}
</td>
<td className="py-2 px-4">{entry.Balance}</td>
<td className="py-2 px-4 text-center">
    <button
        onClick={() => {
            setEntryToDelete(entry);
            setShowDeleteModal(true);
        }}
        className="text-red-600 hover:text-red-800"
    >
        <FaTrash />
    </button>
</td>

</tr>
))}
</tbody>
</table>

) : (
<p>No transactions found.</p>
)}
{showDeleteModal && (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
        <div className="bg-white p-6 rounded-lg w-80 text-center">
            <h2 className="text-lg font-semibold mb-4">Confirm Delete</h2>
            <p>Are you sure you want to delete this transaction entry?</p>
            <div className="mt-4 flex justify-center gap-4">
                <button
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                    Cancel
                </button>
                <button
                    onClick={async () => {
                        try {
                            await axios.delete(`/transaction/deleteEntry/${entryToDelete.Transaction_id}/${entryToDelete.Account_id}`);
                            // Re-fetch transactions or manually remove the entry from state
                            setFilteredEntries(prev =>
                                prev.filter(e =>
                                    !(
                                        e.Transaction_id === entryToDelete.Transaction_id &&
                                        e.Account_id === entryToDelete.Account_id
                                    )
                                )
                            );
                            setShowDeleteModal(false);
                        } catch (error) {
                            console.error("Delete failed", error);
                        }
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                    Delete
                </button>
            </div>
        </div>
    </div>
)}

</div>
</main>
            

                <div className="flex items-center space-x-4">
                    <div>
                        <p>Opening Balance: {openingBalance}</p>
                    </div>
                    <div>
                        <p>Closing Balance: {closingBalance}</p>
                    </div>
                </div>
            </div>

      
        <div className="no-print">
        </div>
    </>
);
};

export default AllTransaction;