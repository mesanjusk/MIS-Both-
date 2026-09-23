import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from '../apiClient.js';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import AddOrder1 from '../Pages/addOrder1';
import UpdateDelivery from '../Pages/updateDelivery';
import TransactionEditModal from '../Components/TransactionEditModal';
import TransactionDocumentModal from '../Components/TransactionDocumentModal';
import StatementModal from '../Components/StatementModal';
import ExportGuard from '../Components/ExportGuard';
import { getCustomerLedgerLegs, getVoucherInfo, isSalesInvoiceTransaction } from '../utils/voucher';
import { ROUTES } from '../constants/routes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmtDMY = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
};

const AllTransaction3 = () => {
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'Transaction_date', direction: 'asc' });
  const [filterType, setFilterType] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLedgerNames, setSelectedLedgerNames] = useState([]);
  const [ledgerFilterOpen, setLedgerFilterOpen] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [userRole, setUserRole] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);
  const [invoiceEdit, setInvoiceEdit] = useState(null);
  const [loadingInvoiceFor, setLoadingInvoiceFor] = useState(null);
  const [docRow, setDocRow] = useState(null);
  const [showStatement, setShowStatement] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { uuid: customerUuid, name: customerName } = location.state?.customer || {};

  const refreshTransactions = useCallback(async () => {
    try {
      const res = await axios.get('/api/transaction');
      if (res.data?.success) setTransactions(res.data.result || []);
    } catch (error) { console.error('Error refreshing transactions:', error); }
  }, []);

  useEffect(() => {
    if (!customerUuid || !customerName) return;
    setUserRole(localStorage.getItem('User_group') || '');
    const today = new Date();
    const currentYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    setStartDate(`${currentYear}-04-01`);
    setSelectedLedgerNames([]);
    const fetchData = async () => {
      try {
        setLoading(true);
        const [transRes, custRes, acctRes] = await Promise.all([
          axios.get('/api/transaction'),
          axios.get('/api/customers/GetCustomersList'),
          axios.get('/api/accounts'),
        ]);
        if (transRes.data?.success) setTransactions(transRes.data.result || []);
        if (custRes.data?.success) setCustomers(custRes.data.result || []);
        setAccounts(Array.isArray(acctRes.data?.accounts) ? acctRes.data.accounts : []);
      } catch (error) { console.error('Error fetching data:', error); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [customerUuid, customerName]);

  const customerMap = useMemo(() => Object.fromEntries(customers.map(c => [c.Customer_uuid, c.Customer_name])), [customers]);
  const accountMap = useMemo(() => Object.fromEntries(accounts.map(a => [a.Account_uuid, a.Account_name])), [accounts]);
  const lookupName = useCallback((id) => customerMap[id] || accountMap[id] || id || '', [customerMap, accountMap]);
  const accountOptions = useMemo(() => [
    ...accounts.map(a => ({ uuid: a.Account_uuid, name: a.Account_name, group: 'Account' })),
    ...customers.map(c => ({ uuid: c.Customer_uuid, name: c.Customer_name, group: 'Customer' })),
  ].sort((a, b) => a.name.localeCompare(b.name)), [accounts, customers]);
  const cashOrBankUuids = useMemo(() => new Set([
    ...accounts.map(a => a.Account_uuid).filter(Boolean),
    ...customers.filter(c => c.Customer_group === 'Bank and Account').map(c => c.Customer_uuid),
  ]), [accounts, customers]);
  const customerMobile = useMemo(() => {
    const c = customers.find(x => x.Customer_uuid === customerUuid);
    return c?.Mobile_number || c?.mobile || c?.phone || '';
  }, [customers, customerUuid]);

  const customerTransactions = useMemo(() => transactions.filter(t => getCustomerLedgerLegs(t, customerUuid).length > 0), [transactions, customerUuid]);
  const counterFor = useCallback((transaction) => {
    const legs = transaction.Journal_entry || [];
    const own = new Set(getCustomerLedgerLegs(transaction, customerUuid).filter(e => legs.includes(e)));
    const counter = legs.find(e => String(e?.Account_id || '') !== String(customerUuid || '') && !own.has(e));
    const name = counter ? ((counter.Account_name && !UUID_RE.test(counter.Account_name)) ? counter.Account_name : lookupName(counter.Account_id)) : 'N/A';
    return { entry: counter, name: name || 'N/A' };
  }, [customerUuid, lookupName]);

  const ledgerNameOptions = useMemo(() => {
    const names = new Set();
    customerTransactions.forEach(t => {
      const name = counterFor(t).name;
      if (name && name !== 'N/A') names.add(name);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [customerTransactions, counterFor]);
  const visibleLedgerOptions = useMemo(() => ledgerNameOptions.filter(n => n.toLowerCase().includes(ledgerSearch.trim().toLowerCase())), [ledgerNameOptions, ledgerSearch]);
  const toggleLedgerName = (name) => setSelectedLedgerNames(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);

  const openingBalance = useMemo(() => customerTransactions.reduce((acc, t) => {
    const txDate = new Date(t.Transaction_date);
    if (!startDate || txDate < new Date(startDate)) getCustomerLedgerLegs(t, customerUuid).forEach(e => {
      if (e.Type === 'Debit') acc += e.Amount || 0;
      if (e.Type === 'Credit') acc -= e.Amount || 0;
    });
    return acc;
  }, 0), [customerTransactions, startDate, customerUuid]);

  const filteredTransactions = useMemo(() => customerTransactions.filter(t => {
    const txDate = new Date(t.Transaction_date);
    const endExclusive = endDate ? new Date(new Date(endDate).getTime() + 86400000) : null;
    const inRange = (!startDate || new Date(startDate) <= txDate) && (!endExclusive || txDate < endExclusive);
    const typeOk = getCustomerLedgerLegs(t, customerUuid).some(e => filterType === 'All' || e.Type === filterType);
    const ledgerOk = selectedLedgerNames.length === 0 || selectedLedgerNames.includes(counterFor(t).name);
    return inRange && typeOk && ledgerOk;
  }), [customerTransactions, startDate, endDate, filterType, customerUuid, selectedLedgerNames, counterFor]);

  const sortedCustomerTransactions = useMemo(() => [...filteredTransactions].sort((a, b) => {
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    if (sortConfig.key === 'Transaction_date') return (new Date(a.Transaction_date) - new Date(b.Transaction_date)) * dir;
    if (sortConfig.key === 'Name') return counterFor(a).name.localeCompare(counterFor(b).name) * dir;
    return String(a[sortConfig.key] || '').localeCompare(String(b[sortConfig.key] || '')) * dir;
  }), [filteredTransactions, sortConfig, counterFor]);

  const ledgerRows = useMemo(() => {
    let running = openingBalance;
    const rows = [];
    sortedCustomerTransactions.forEach(transaction => {
      const counter = counterFor(transaction);
      const counterIsCashOrBank = !!counter.entry && cashOrBankUuids.has(counter.entry.Account_id);
      getCustomerLedgerLegs(transaction, customerUuid).forEach(entry => {
        const debit = entry.Type === 'Debit' ? entry.Amount || 0 : 0;
        const credit = entry.Type === 'Credit' ? entry.Amount || 0 : 0;
        running += debit - credit;
        rows.push({ transaction, entry, counterName: counter.name, counterIsCashOrBank, voucher: getVoucherInfo({ transaction, entry, counterIsCashOrBank }), debit, credit, balance: running });
      });
    });
    return rows;
  }, [sortedCustomerTransactions, openingBalance, counterFor, cashOrBankUuids, customerUuid]);

  const totals = useMemo(() => {
    let debit = 0, credit = 0;
    filteredTransactions.forEach(t => getCustomerLedgerLegs(t, customerUuid).forEach(e => {
      if (e.Type === 'Debit') debit += e.Amount || 0;
      if (e.Type === 'Credit') credit += e.Amount || 0;
    }));
    return { debit, credit, total: openingBalance + debit - credit };
  }, [filteredTransactions, customerUuid, openingBalance]);

  const sortTable = key => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  const statementPayload = useMemo(() => ({
    partyUuid: customerUuid, partyName: customerName, periodFrom: fmtDMY(startDate), periodTo: fmtDMY(endDate), generatedOn: new Date().toLocaleDateString('en-GB'),
    openingBalance, totalDebit: totals.debit, totalCredit: totals.credit, closingBalance: totals.total,
    rows: ledgerRows.map(r => ({ txnNo: r.transaction.Transaction_id ?? '', voucherNo: r.voucher.display, voucherType: r.voucher.label, dateStr: new Date(r.transaction.Transaction_date).toLocaleDateString('en-GB'), particulars: r.counterName, description: r.transaction.Description || '', debit: r.debit, credit: r.credit, balance: r.balance })),
  }), [customerUuid, customerName, startDate, endDate, openingBalance, totals, ledgerRows]);

  const handleExportExcel = () => {
    const rows = [{ TransactionNo: '', VoucherNo: '', VoucherType: '', Date: '', Name: 'Opening Balance', Description: '', Debit: '', Credit: '', Balance: Number(openingBalance.toFixed(2)) },
      ...ledgerRows.map(r => ({ TransactionNo: r.transaction.Transaction_id, VoucherNo: r.voucher.display, VoucherType: r.voucher.label, Date: new Date(r.transaction.Transaction_date).toLocaleDateString('en-GB'), Name: r.counterName, Description: r.transaction.Description, Debit: r.debit || '', Credit: r.credit || '', Balance: Number(r.balance.toFixed(2)) })),
      { TransactionNo: '', VoucherNo: '', VoucherType: '', Date: '', Name: 'Closing Balance', Description: '', Debit: Number(totals.debit.toFixed(2)), Credit: Number(totals.credit.toFixed(2)), Balance: Number(totals.total.toFixed(2)) }];
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), 'transactions.xlsx');
  };

  const openEdit = async transaction => {
    if (isSalesInvoiceTransaction(transaction)) {
      const ref = transaction.Order_uuid || transaction.Order_number; setLoadingInvoiceFor(transaction.Transaction_uuid);
      try { const res = await axios.get(`/order/${encodeURIComponent(ref)}`); const order = res.data?.result || res.data; if (order && (order._id || order.Order_uuid)) { setInvoiceEdit({ transaction, order: { ...order, Customer_name: lookupName(order.Customer_uuid) || customerName } }); return; } } catch (e) { console.error(e); toast.error('Could not load the invoice — editing ledger entry instead'); } finally { setLoadingInvoiceFor(null); }
    }
    setEditingTxn(transaction); setShowEditModal(true);
  };
  const saveEditedTransaction = async payload => {
    if (!editingTxn) return;
    try {
      const journal = [{ Account_id: payload.Debit_id, Account_name: lookupName(payload.Debit_id), Type: 'Debit', Amount: Number(payload.Amount) }, { Account_id: payload.Credit_id, Account_name: lookupName(payload.Credit_id), Type: 'Credit', Amount: Number(payload.Amount) }];
      const res = await axios.put(`/api/transaction/${payload.Transaction_uuid}`, { Description: payload.Description || editingTxn.Description || '', Transaction_date: payload.Transaction_date, Total_Debit: Number(payload.Amount), Total_Credit: Number(payload.Amount), Payment_mode: editingTxn.Payment_mode || 'Journal', Created_by: editingTxn.Created_by || '', Order_uuid: editingTxn.Order_uuid || null, Order_number: editingTxn.Order_number || null, Customer_uuid: editingTxn.Customer_uuid || null, Journal_entry: journal });
      if (!res.data?.success) return toast.error('Update failed');
      setTransactions(prev => prev.map(t => t.Transaction_uuid === payload.Transaction_uuid ? { ...t, Transaction_date: payload.Transaction_date, Description: payload.Description, Total_Debit: Number(payload.Amount), Total_Credit: Number(payload.Amount), Journal_entry: journal } : t));
      setShowEditModal(false); setEditingTxn(null); toast.success('Transaction updated');
    } catch (e) { console.error(e); toast.error('Error updating transaction'); }
  };
  const handleDelete = async transaction => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    try { const res = await axios.delete(`/api/transaction/${transaction.Transaction_uuid}`); if (res.data?.success) setTransactions(prev => prev.filter(t => t.Transaction_uuid !== transaction.Transaction_uuid)); else toast.error('Delete failed'); } catch (e) { console.error(e); toast.error('Error deleting transaction'); }
  };

  if (!customerUuid || !customerName) return <div className="pt-16 pb-24 px-4 text-center text-gray-600"><p className="text-lg font-medium mb-2">No account selected</p><p className="mb-4">Open a customer or account from the Outstanding report or Party Balances tab.</p><button onClick={() => navigate(ROUTES.OUTSTANDING_REPORT)} className="px-4 py-2 bg-blue-600 text-white rounded">Go to Outstanding report</button></div>;

  return <>
    <div className="no-print" />
    <div className="pt-16 pb-24 px-4">
      <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-blue-600">{customerName}</h2><div className="space-x-2"><button onClick={() => setShowStatement(true)} className="px-4 py-1 bg-red-500 text-white rounded">Statement PDF</button><ExportGuard><button onClick={handleExportExcel} className="px-4 py-1 bg-blue-600 text-white rounded">Excel</button></ExportGuard></div></div>
      <div className="flex gap-4 mb-4 flex-wrap items-end">
        <div><label className="block text-sm font-medium">Start Date</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border px-2 py-1 rounded" /></div>
        <div><label className="block text-sm font-medium">End Date</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border px-2 py-1 rounded" /></div>
        <div><label className="block text-sm font-medium">Transaction Type</label><select value={filterType} onChange={e => setFilterType(e.target.value)} className="border px-2 py-1 rounded"><option value="All">All</option><option value="Credit">Credit</option><option value="Debit">Debit</option></select></div>
        <div className="relative min-w-[240px]"><label className="block text-sm font-medium">Ledger Name</label><button type="button" onClick={() => setLedgerFilterOpen(v => !v)} className="border px-3 py-1 rounded bg-white w-full text-left flex justify-between"><span>{selectedLedgerNames.length ? `${selectedLedgerNames.length} selected` : 'All ledgers'}</span><span>▾</span></button>
          {ledgerFilterOpen && <div className="absolute z-50 mt-1 w-80 max-w-[90vw] bg-white border rounded shadow-lg p-2"><input autoFocus value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} placeholder="Search ledger name..." className="border rounded px-2 py-1 w-full mb-2" /><div className="flex justify-between text-xs mb-2"><button type="button" className="text-blue-600" onClick={() => setSelectedLedgerNames(visibleLedgerOptions)}>Select shown</button><button type="button" className="text-red-600" onClick={() => setSelectedLedgerNames([])}>Clear / All</button></div><div className="max-h-64 overflow-y-auto">{visibleLedgerOptions.map(name => <label key={name} className="flex gap-2 items-center py-1 px-1 hover:bg-gray-50 cursor-pointer"><input type="checkbox" checked={selectedLedgerNames.includes(name)} onChange={() => toggleLedgerName(name)} /><span className="truncate">{name}</span></label>)}</div><button type="button" onClick={() => setLedgerFilterOpen(false)} className="mt-2 w-full bg-blue-600 text-white rounded py-1">Apply</button></div>}
        </div>
        {selectedLedgerNames.length > 0 && <button type="button" onClick={() => setSelectedLedgerNames([])} className="text-sm text-red-600 px-2 py-1">Clear ledger filter</button>}
      </div>
      <p>Total Credit: ₹{totals.credit.toFixed(2)} | Total Debit: ₹{totals.debit.toFixed(2)} | Closing Balance: ₹{totals.total.toFixed(2)}</p>
      {loading ? <div className="text-center py-12 text-lg">Loading transactions...</div> : <div className="overflow-x-auto"><table className="min-w-full border-collapse"><thead className="bg-gray-200"><tr><th className="py-2 px-4">Txn No</th><th className="py-2 px-4">Voucher No</th><th className="py-2 px-4 cursor-pointer" onClick={() => sortTable('Transaction_date')}>Date {sortConfig.key === 'Transaction_date' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th><th className="py-2 px-4 cursor-pointer" onClick={() => sortTable('Name')}>Name {sortConfig.key === 'Name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th><th className="py-2 px-4 cursor-pointer" onClick={() => sortTable('Description')}>Description</th><th className="py-2 px-4">Debit</th><th className="py-2 px-4">Credit</th><th className="py-2 px-4">Balance</th>{userRole === 'Admin User' && <th className="py-2 px-4">Actions</th>}</tr></thead><tbody>
        <tr className="bg-yellow-100 font-semibold"><td colSpan={3} /><td className="py-2 px-4">Opening Balance</td><td colSpan={3} /><td className="py-2 px-4">{openingBalance.toFixed(2)}</td>{userRole === 'Admin User' && <td />}</tr>
        {ledgerRows.map((r, i) => <tr key={`${r.transaction.Transaction_uuid || r.transaction.Transaction_id}-${i}`} className="border-t hover:bg-gray-50"><td className="py-2 px-4">{r.transaction.Transaction_id}</td><td className="py-2 px-4"><button type="button" onClick={() => setDocRow({ transaction: r.transaction, entry: r.entry, counterAccountName: r.counterName, counterIsCashOrBank: r.counterIsCashOrBank })} className="text-blue-600 font-semibold hover:underline">{r.voucher.display || '—'}</button></td><td className="py-2 px-4">{new Date(r.transaction.Transaction_date).toLocaleDateString('en-GB')}</td><td className="py-2 px-4">{r.counterName}</td><td className="py-2 px-4">{r.transaction.Description}</td><td className="py-2 px-4">{r.debit || ''}</td><td className="py-2 px-4">{r.credit || ''}</td><td className={`py-2 px-4 ${r.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{r.balance.toFixed(2)}</td>{userRole === 'Admin User' && <td className="py-2 px-4 whitespace-nowrap"><button disabled={loadingInvoiceFor === r.transaction.Transaction_uuid} onClick={() => openEdit(r.transaction)} className="text-blue-600 mr-3">{loadingInvoiceFor === r.transaction.Transaction_uuid ? 'Opening…' : 'Edit'}</button><button onClick={() => handleDelete(r.transaction)} className="text-red-600">Delete</button></td>}</tr>)}
        <tr className="bg-blue-100 font-semibold"><td colSpan={3} /><td className="py-2 px-4">Closing Balance</td><td /><td className="py-2 px-4">{totals.debit.toFixed(2)}</td><td className="py-2 px-4">{totals.credit.toFixed(2)}</td><td className="py-2 px-4">{totals.total.toFixed(2)}</td>{userRole === 'Admin User' && <td />}</tr>
      </tbody></table></div>}
    </div>
    <TransactionEditModal open={userRole === 'Admin User' && showEditModal} onClose={() => { setShowEditModal(false); setEditingTxn(null); }} onSave={saveEditedTransaction} initialData={editingTxn ? (() => { const credit = (editingTxn.Journal_entry || []).find(e => String(e.Type).toLowerCase() === 'credit'); const debit = (editingTxn.Journal_entry || []).find(e => String(e.Type).toLowerCase() === 'debit'); return { Transaction_id: editingTxn.Transaction_id, Transaction_uuid: editingTxn.Transaction_uuid, Transaction_date: editingTxn.Transaction_date, Amount: Number(credit?.Amount || debit?.Amount || 0), Description: editingTxn.Description || '', Credit_id: credit?.Account_id || '', Debit_id: debit?.Account_id || '' }; })() : null} accountOptions={accountOptions} />
    <TransactionDocumentModal open={!!docRow} onClose={() => setDocRow(null)} transaction={docRow?.transaction} entry={docRow?.entry} partyName={customerName} customerMobile={customerMobile} counterAccountName={docRow?.counterAccountName || ''} counterIsCashOrBank={!!docRow?.counterIsCashOrBank} />
    {invoiceEdit && <UpdateDelivery mode="edit" order={invoiceEdit.order} invoiceTxn={invoiceEdit.transaction} onClose={() => { setInvoiceEdit(null); refreshTransactions(); }} onSaved={refreshTransactions} />}
    <StatementModal open={showStatement} onClose={() => setShowStatement(false)} statement={statementPayload} partyMobile={customerMobile} />
    {showOrderModal && <AddOrder1 closeModal={() => setShowOrderModal(false)} />}
  </>;
};

export default AllTransaction3;
