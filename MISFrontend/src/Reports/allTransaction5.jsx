import React, { useEffect, useMemo, useState } from 'react';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';
import TransactionEditModal from '../Components/TransactionEditModal';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '';
const fmtAmt  = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

export default function AllTransaction5() {
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers]       = useState([]);
  const [accounts, setAccounts]         = useState([]);
  const [loading, setLoading]           = useState(false);

  const [searchName,   setSearchName]   = useState('');
  const [searchAmount, setSearchAmount] = useState('');
  const [startDate,    setStartDate]    = useState('');
  const [endDate,      setEndDate]      = useState('');
  const [sortConfig,   setSortConfig]   = useState({ key: 'Transaction_date', direction: 'desc' });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTxn,    setEditingTxn]   = useState(null);

  const userRole = localStorage.getItem('User_group') || '';
  const isAdmin  = userRole === 'Admin User';

  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get('/api/transaction'),
      axios.get('/api/customers/GetCustomersList'),
      axios.get('/api/accounts'),
    ])
      .then(([txRes, custRes, acctRes]) => {
        if (txRes.data?.success)    setTransactions(txRes.data.result || []);
        if (custRes.data?.success)  setCustomers(custRes.data.result || []);
        setAccounts(Array.isArray(acctRes.data?.accounts) ? acctRes.data.accounts : []);
      })
      .catch(() => toast.error('Failed to load transactions'))
      .finally(() => setLoading(false));
  }, []);

  const customerMap = useMemo(() => {
    const m = {};
    customers.forEach((c) => { if (c.Customer_uuid) m[c.Customer_uuid] = c.Customer_name; });
    return m;
  }, [customers]);

  const accountsMap = useMemo(() => {
    const m = {};
    accounts.forEach((a) => { if (a.Account_uuid) m[a.Account_uuid] = a.Account_name; });
    return m;
  }, [accounts]);

  const accountOptions = useMemo(() => {
    const opts = [];
    accounts.forEach((a)  => opts.push({ uuid: a.Account_uuid,  name: a.Account_name,  group: 'Account'  }));
    customers.forEach((c) => opts.push({ uuid: c.Customer_uuid, name: c.Customer_name, group: 'Customer' }));
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts, customers]);

  // Resolve a journal leg's account name — prefer stored Account_name, fall back to maps
  const resolveName = (leg) => {
    if (!leg) return '—';
    const stored = leg.Account_name || '';
    if (stored && !UUID_RE.test(stored)) return stored;
    return customerMap[leg.Account_id] || accountsMap[leg.Account_id] || leg.Account_id || '—';
  };

  // For each transaction derive debit/credit leg for display
  const rows = useMemo(() => transactions.map((txn) => {
    const journal  = txn.Journal_entry || [];
    const debitLeg = journal.find((e) => e.Type === 'Debit');
    const creditLeg= journal.find((e) => e.Type === 'Credit');
    return {
      txn,
      debitName:  resolveName(debitLeg),
      creditName: resolveName(creditLeg),
      amount:     txn.Total_Debit || txn.Total_Credit || 0,
    };
  }), [transactions, customerMap, accountsMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const nameLower   = searchName.trim().toLowerCase();
    const amountQuery = searchAmount.trim();
    const amtNum      = parseFloat(amountQuery.replace(/[₹,\s]/g, ''));

    return rows.filter(({ txn, debitName, creditName, amount }) => {
      if (startDate && new Date(txn.Transaction_date) < new Date(startDate)) return false;
      if (endDate   && new Date(txn.Transaction_date) > new Date(endDate + 'T23:59:59')) return false;

      if (nameLower) {
        const haystack = [
          txn.Description,
          debitName,
          creditName,
          txn.Payment_mode,
        ].join(' ').toLowerCase();
        if (!haystack.includes(nameLower)) return false;
      }

      if (amountQuery && !isNaN(amtNum)) {
        if (Math.abs(amount - amtNum) > 0.009) return false;
      }

      return true;
    });
  }, [rows, searchName, searchAmount, startDate, endDate]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const { key, direction } = sortConfig;
    list.sort((a, b) => {
      let av, bv;
      if (key === 'Transaction_date') {
        av = new Date(a.txn.Transaction_date).getTime();
        bv = new Date(b.txn.Transaction_date).getTime();
      } else if (key === 'amount') {
        av = a.amount; bv = b.amount;
      } else if (key === 'debitName') {
        av = a.debitName; bv = b.debitName;
      } else if (key === 'creditName') {
        av = a.creditName; bv = b.creditName;
      } else {
        av = a.txn[key] || ''; bv = b.txn[key] || '';
      }
      if (typeof av === 'string') return direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return direction === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [filtered, sortConfig]);

  const sort = (key) => setSortConfig((prev) => ({
    key,
    direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
  }));
  const arrow = (key) => sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : '';

  const totalDebit  = filtered.reduce((s, r) => s + (r.txn.Total_Debit  || 0), 0);
  const totalCredit = filtered.reduce((s, r) => s + (r.txn.Total_Credit || 0), 0);

  // ── Edit / Delete ─────────────────────────────────────────────────────────
  const openEdit = (txn) => {
    const journal   = txn.Journal_entry || [];
    const creditLeg = journal.find((e) => String(e.Type).toLowerCase() === 'credit');
    const debitLeg  = journal.find((e) => String(e.Type).toLowerCase() === 'debit');
    setEditingTxn({
      ...txn,
      Amount:    txn.Total_Debit || txn.Total_Credit || 0,
      Credit_id: creditLeg?.Account_id || '',
      Debit_id:  debitLeg?.Account_id  || '',
    });
    setShowEditModal(true);
  };

  const lookupName = (id) => customerMap[id] || accountsMap[id] || id || '';

  const saveEdit = async (payload) => {
    try {
      const res = await axios.put(`/api/transaction/${payload.Transaction_uuid}`, {
        Description:      payload.Description,
        Transaction_date: payload.Transaction_date,
        Total_Debit:      Number(payload.Amount),
        Total_Credit:     Number(payload.Amount),
        Payment_mode:     editingTxn.Payment_mode || 'Journal',
        Created_by:       editingTxn.Created_by   || '',
        Order_uuid:       editingTxn.Order_uuid    || null,
        Order_number:     editingTxn.Order_number  || null,
        Customer_uuid:    editingTxn.Customer_uuid || null,
        Journal_entry: [
          { Account_id: payload.Debit_id,  Account_name: lookupName(payload.Debit_id),  Type: 'Debit',  Amount: Number(payload.Amount) },
          { Account_id: payload.Credit_id, Account_name: lookupName(payload.Credit_id), Type: 'Credit', Amount: Number(payload.Amount) },
        ],
      });
      if (res.data?.success) {
        setTransactions((prev) =>
          prev.map((t) => t.Transaction_uuid === payload.Transaction_uuid ? res.data.result : t)
        );
        setShowEditModal(false);
        setEditingTxn(null);
        toast.success('Transaction updated');
      } else {
        toast.error('Update failed');
      }
    } catch {
      toast.error('Error updating transaction');
    }
  };

  const handleDelete = async (txn) => {
    if (!window.confirm(`Delete transaction #${txn.Transaction_id}?`)) return;
    try {
      const res = await axios.delete(`/api/transaction/${txn.Transaction_uuid}`);
      if (res.data?.success) {
        setTransactions((prev) => prev.filter((t) => t.Transaction_uuid !== txn.Transaction_uuid));
        toast.success('Transaction deleted');
      } else {
        toast.error('Delete failed');
      }
    } catch {
      toast.error('Error deleting transaction');
    }
  };

  return (
    <div className="pt-16 pb-24 px-4">

      {/* ── Header ── */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800">All Transactions</h2>
          <p className="text-sm text-gray-500">Complete ledger — all journal entries</p>
        </div>
        <div className="text-sm text-gray-600 font-medium">
          Showing <span className="text-blue-600 font-bold">{filtered.length}</span> of {transactions.length} entries
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search by Name / Description</label>
            <input
              type="text"
              placeholder="Party name, account, description…"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Filter by Amount (₹)</label>
            <input
              type="number"
              placeholder="e.g. 1000"
              value={searchAmount}
              onChange={(e) => setSearchAmount(e.target.value)}
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {(searchName || searchAmount || startDate || endDate) && (
            <div className="flex items-end">
              <button
                onClick={() => { setSearchName(''); setSearchAmount(''); setStartDate(''); setEndDate(''); }}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Totals bar ── */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {[
          { label: 'Total Debit',  value: totalDebit,  color: 'text-green-700 bg-green-50 border-green-200' },
          { label: 'Total Credit', value: totalCredit, color: 'text-red-700 bg-red-50 border-red-200' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`flex-1 min-w-[140px] border rounded-xl px-4 py-2 ${color}`}>
            <div className="text-xs font-medium opacity-70">{label}</div>
            <div className="text-lg font-black">{fmtAmt(value)}</div>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading transactions…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border shadow-sm">
          <table className="min-w-full border-collapse text-sm bg-white">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="py-2 px-3 text-left cursor-pointer whitespace-nowrap" onClick={() => sort('Transaction_id')}>
                  #{ arrow('Transaction_id') }
                </th>
                <th className="py-2 px-3 text-left cursor-pointer whitespace-nowrap" onClick={() => sort('Transaction_date')}>
                  Date{ arrow('Transaction_date') }
                </th>
                <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('Description')}>
                  Description{ arrow('Description') }
                </th>
                <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('debitName')}>
                  Debit Account{ arrow('debitName') }
                </th>
                <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('creditName')}>
                  Credit Account{ arrow('creditName') }
                </th>
                <th className="py-2 px-3 text-left cursor-pointer whitespace-nowrap" onClick={() => sort('amount')}>
                  Amount{ arrow('amount') }
                </th>
                <th className="py-2 px-3 text-left">Mode</th>
                {isAdmin && <th className="py-2 px-3 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-10 text-center text-gray-400">
                    No transactions found
                  </td>
                </tr>
              )}
              {sorted.map(({ txn, debitName, creditName, amount }, idx) => (
                <tr
                  key={txn._id || idx}
                  className="border-t hover:bg-blue-50 transition-colors"
                >
                  <td className="py-2 px-3 text-gray-400 text-xs">{txn.Transaction_id}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{fmtDate(txn.Transaction_date)}</td>
                  <td className="py-2 px-3 max-w-[200px] truncate" title={txn.Description}>
                    {txn.Description || '—'}
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-block bg-green-50 text-green-800 border border-green-200 rounded-full px-2 py-0.5 text-xs font-medium max-w-[160px] truncate" title={debitName}>
                      {debitName}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-block bg-red-50 text-red-800 border border-red-200 rounded-full px-2 py-0.5 text-xs font-medium max-w-[160px] truncate" title={creditName}>
                      {creditName}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-semibold whitespace-nowrap">{fmtAmt(amount)}</td>
                  <td className="py-2 px-3">
                    <span className="text-xs text-gray-500">{txn.Payment_mode || '—'}</span>
                  </td>
                  {isAdmin && (
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button
                        className="text-blue-600 hover:underline text-xs mr-3"
                        onClick={() => openEdit(txn)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-500 hover:underline text-xs"
                        onClick={() => handleDelete(txn)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit modal ── */}
      <TransactionEditModal
        open={isAdmin && showEditModal}
        onClose={() => { setShowEditModal(false); setEditingTxn(null); }}
        onSave={saveEdit}
        initialData={editingTxn}
        accountOptions={accountOptions}
      />
    </div>
  );
}
