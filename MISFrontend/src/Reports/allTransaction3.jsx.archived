// src/Pages/AllTransaction3.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from '../apiClient.js';
import { useLocation, useNavigate } from 'react-router-dom';
import AddOrder1 from "../Pages/addOrder1";
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// NEW: reusable modal
import TransactionEditModal from '../Components/TransactionEditModal';

const AllTransaction3 = () => {
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  const [filterType, setFilterType] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Admin-only actions
  const [userRole, setUserRole] = useState('');

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { uuid: customerUuid, name: customerName } = location.state?.customer || {};

  useEffect(() => {
    if (!customerUuid || !customerName) {
      alert("Customer not found. Redirecting...");
      navigate("/allTransaction1");
      return;
    }

    // Read role once
    const role = localStorage.getItem('User_group') || '';
    setUserRole(role);

    // Dynamically set April 1st (FY start)
    const today = new Date();
    const currentYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    setStartDate(`${currentYear}-04-01`);

    const fetchData = async () => {
      try {
        setLoading(true);
        const [transRes, custRes] = await Promise.all([
          axios.get('/transaction'),
          axios.get('/customer/GetCustomersList')
        ]);
        if (transRes.data?.success) setTransactions(transRes.data.result || []);
        if (custRes.data?.success) setCustomers(custRes.data.result || []);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [customerUuid, customerName, navigate]);

  const customerMap = useMemo(() => {
    const map = {};
    for (const customer of customers) map[customer.Customer_uuid] = customer.Customer_name;
    return map;
  }, [customers]);

  const customerTransactions = useMemo(
    () =>
      transactions.filter(t =>
        (t.Journal_entry || []).some(e => e.Account_id === customerUuid)
      ),
    [transactions, customerUuid]
  );

  const openingBalance = useMemo(() => {
    return customerTransactions.reduce((acc, transaction) => {
      const txDate = new Date(transaction.Transaction_date);
      if (!startDate || txDate < new Date(startDate)) {
        (transaction.Journal_entry || []).forEach(entry => {
          if (entry.Account_id === customerUuid) {
            if (entry.Type === 'Credit') acc += entry.Amount || 0;
            if (entry.Type === 'Debit') acc -= entry.Amount || 0;
          }
        });
      }
      return acc;
    }, 0);
  }, [customerTransactions, startDate, customerUuid]);

  const filteredTransactions = useMemo(() => {
    return customerTransactions.filter(transaction => {
      const txDate = new Date(transaction.Transaction_date);
      const withinDateRange =
        (!startDate || new Date(startDate) <= txDate) &&
        (!endDate || new Date(endDate) >= txDate);

      const hasMatchingType = (transaction.Journal_entry || []).some(entry =>
        entry.Account_id === customerUuid &&
        (filterType === "All" || entry.Type === filterType)
      );

      return withinDateRange && hasMatchingType;
    });
  }, [customerTransactions, startDate, endDate, filterType, customerUuid]);

  const sortedCustomerTransactions = useMemo(() => {
    const list = [...filteredTransactions];
    const { key, direction } = sortConfig;
    if (!key) return list;

    return list.sort((a, b) => {
      let aVal = '', bVal = '';

      if (key === "Name") {
        const aNameId = (a.Journal_entry || []).find(e => e.Account_id !== customerUuid)?.Account_id;
        const bNameId = (b.Journal_entry || []).find(e => e.Account_id !== customerUuid)?.Account_id;
        aVal = customerMap[aNameId] || "";
        bVal = customerMap[bNameId] || "";
      } else if (key === "Transaction_date") {
        aVal = new Date(a.Transaction_date).getTime();
        bVal = new Date(b.Transaction_date).getTime();
      } else {
        aVal = a[key] || '';
        bVal = b[key] || '';
      }

      if (typeof aVal === "string") {
        return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [filteredTransactions, sortConfig, customerUuid, customerMap]);

  const calculateTotals = () => {
    const totals = filteredTransactions.reduce(
      (acc, transaction) => {
        (transaction.Journal_entry || []).forEach(entry => {
          if (entry.Account_id === customerUuid) {
            if (entry.Type === 'Debit') acc.debit += entry.Amount || 0;
            if (entry.Type === 'Credit') acc.credit += entry.Amount || 0;
          }
        });
        return acc;
      },
      { debit: 0, credit: 0 }
    );
    totals.total = openingBalance + totals.credit - totals.debit;
    return totals;
  };

  const totals = calculateTotals();

  const sortTable = (key) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Transactions for ${customerName}`, 10, 10);
    let y = 20;
    sortedCustomerTransactions.forEach((t, idx) => {
      (t.Journal_entry || []).filter(e => e.Account_id === customerUuid).forEach(e => {
        doc.text(`${idx + 1}. ${t.Description || ''} - ${e.Type}: ₹${e.Amount}`, 10, y);
        y += 10;
      });
    });
    doc.save('transactions.pdf');
  };

  const handleExportExcel = () => {
    const rows = [];
    sortedCustomerTransactions.forEach(transaction => {
      (transaction.Journal_entry || [])
        .filter(entry => entry.Account_id === customerUuid)
        .forEach(entry => {
          rows.push({
            TransactionID: transaction.Transaction_id,
            Date: new Date(transaction.Transaction_date).toLocaleDateString(),
            Description: transaction.Description,
            Type: entry.Type,
            Amount: entry.Amount,
          });
        });
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(data, "transactions.xlsx");
  };

  const handleOrder = () => setShowOrderModal(true);
  const closeModal = () => setShowOrderModal(false);

  // ---------- Admin-only: Edit/Delete ----------
  const openEdit = (transaction) => {
    // Build a normalized initialData for modal
    const credit = (transaction.Journal_entry || []).find(e => String(e.Type || '').toLowerCase() === 'credit');
    const debit  = (transaction.Journal_entry || []).find(e => String(e.Type || '').toLowerCase() === 'debit');

    const initialData = {
      Transaction_id: transaction.Transaction_id,
      Transaction_date: transaction.Transaction_date,
      Amount: Number(credit?.Amount || debit?.Amount || 0),
      Description: transaction.Description || '',
      Credit_id: credit?.Account_id || '',
      Debit_id: debit?.Account_id || '',
    };

    setEditingTxn(initialData);
    setShowEditModal(true);
  };

  const saveEditedTransaction = async (payload) => {
    try {
      const res = await axios.put(
        `/transaction/updateByTransactionId/${payload.Transaction_id}`,
        {
          updatedDescription: payload.Description || '',
          updatedAmount: payload.Amount,
          updatedDate: payload.Transaction_date,
          creditAccountId: payload.Credit_id,
          debitAccountId: payload.Debit_id,
        }
      );

      if (res.data?.success) {
        // Merge into local state
        setTransactions(prev =>
          prev.map(txn =>
            txn.Transaction_id === payload.Transaction_id
              ? {
                  ...txn,
                  Transaction_date: payload.Transaction_date,
                  Description: payload.Description,
                  Journal_entry: (txn.Journal_entry || []).map(e => {
                    const type = String(e.Type || '').toLowerCase();
                    if (type === 'credit') {
                      return { ...e, Account_id: payload.Credit_id, Amount: payload.Amount };
                    }
                    if (type === 'debit') {
                      return { ...e, Account_id: payload.Debit_id, Amount: payload.Amount };
                    }
                    return e;
                  }),
                }
              : txn
          )
        );
        setShowEditModal(false);
      } else {
        alert('Update failed');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating transaction');
    }
  };

  const handleDelete = async (txnId) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    try {
      const res = await axios.delete(`/transaction/deleteByTransactionId/${txnId}`);
      if (res.data?.success) {
        setTransactions(prev => prev.filter(t => t.Transaction_id !== txnId));
      } else {
        alert('Delete failed');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting transaction');
    }
  };
  // ---------------------------------------------

  return (
    <>
      <div className="no-print" />

      <div className="pt-16 pb-24 px-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold">
              <span className="text-blue-600">{customerName}</span>
            </h2>
          </div>
          <div className="space-x-2">
            <button onClick={handleExportPDF} className="px-4 py-1 bg-red-500 text-white rounded">PDF</button>
            <button onClick={handleExportExcel} className="px-4 py-1 bg-blue-600 text-white rounded">Excel</button>
          </div>
        </div>

        <div className="flex gap-4 mb-4 flex-wrap">
          <div>
            <label className="block text-sm font-medium">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border px-2 py-1 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border px-2 py-1 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Transaction Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border px-2 py-1 rounded">
              <option value="All">All</option>
              <option value="Credit">Credit</option>
              <option value="Debit">Debit</option>
            </select>
          </div>
        </div>

        <p>
          Total Credit: ₹{totals.credit.toFixed(2)} |{' '}
          Total Debit: ₹{totals.debit.toFixed(2)} |{' '}
          Closing Balance: ₹{totals.total.toFixed(2)}
        </p>

        {loading ? (
          <div className="text-center py-12 text-lg">Loading transactions...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-gray-200">
                <tr>
                  <th className="py-2 px-4">No</th>
                  <th className="py-2 px-4 cursor-pointer" onClick={() => sortTable("Transaction_date")}>
                    Date {sortConfig.key === "Transaction_date" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="py-2 px-4 cursor-pointer" onClick={() => sortTable("Name")}>
                    Name {sortConfig.key === "Name" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="py-2 px-4 cursor-pointer" onClick={() => sortTable("Description")}>
                    Description {sortConfig.key === "Description" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="py-2 px-4">Debit</th>
                  <th className="py-2 px-4">Credit</th>
                  <th className="py-2 px-4">Balance</th>
                  {/* Admin-only Actions column header */}
                  {userRole === 'Admin User' && <th className="py-2 px-4 text-center">Actions</th>}
                </tr>
              </thead>

              <tbody>
                <tr className="bg-yellow-100 font-semibold">
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4" colSpan={1}>Opening Balance</td>
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4">{openingBalance.toFixed(2)}</td>
                  {userRole === 'Admin User' && <td className="py-2 px-4" />}
                </tr>

                {(() => {
                  let runningBalance = openingBalance;
                  return sortedCustomerTransactions.flatMap((transaction, index) =>
                    (transaction.Journal_entry || [])
                      .filter(entry => entry.Account_id === customerUuid)
                      .map((entry, entryIndex) => {
                        if (entry.Type === 'Debit') runningBalance -= entry.Amount || 0;
                        if (entry.Type === 'Credit') runningBalance += entry.Amount || 0;

                        const secondEntry = (transaction.Journal_entry || []).find(e => e.Account_id !== customerUuid);
                        const secondCustomerName = secondEntry ? (customerMap[secondEntry.Account_id] || "N/A") : "N/A";

                        return (
                          <tr key={`${index}-${entryIndex}`} className="border-t hover:bg-gray-50">
                            <td className="py-2 px-4">{transaction.Transaction_id}</td>
                            <td className="py-2 px-4">{new Date(transaction.Transaction_date).toLocaleDateString()}</td>
                            <td className="py-2 px-4">{secondCustomerName}</td>
                            <td className="py-2 px-4">{transaction.Description}</td>
                            <td className="py-2 px-4">{entry.Type === 'Debit' ? entry.Amount : ''}</td>
                            <td className="py-2 px-4">{entry.Type === 'Credit' ? entry.Amount : ''}</td>
                            <td className={`py-2 px-4 ${runningBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {runningBalance.toFixed(2)}
                            </td>

                            {/* Admin-only actions per transaction (edit/delete) */}
                            {userRole === 'Admin User' && (
                              <td className="py-2 px-4 text-center whitespace-nowrap">
                                <button
                                  className="text-blue-600 hover:underline mr-3"
                                  onClick={() => openEdit(transaction)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="text-red-600 hover:underline"
                                  onClick={() => handleDelete(transaction.Transaction_id)}
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                  );
                })()}

                <tr className="bg-blue-100 font-semibold">
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4" colSpan={1}>Closing Balance</td>
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4">{totals.debit.toFixed(2)}</td>
                  <td className="py-2 px-4">{totals.credit.toFixed(2)}</td>
                  <td className="py-2 px-4">{totals.total.toFixed(2)}</td>
                  {userRole === 'Admin User' && <td className="py-2 px-4" />}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reusable edit modal (admin only) */}
      <TransactionEditModal
        open={userRole === 'Admin User' && showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={saveEditedTransaction}
        initialData={editingTxn}
        customers={customers}
      />

      {showOrderModal && <AddOrder1 closeModal={closeModal} />}
    </>
  );
};

export default AllTransaction3;
