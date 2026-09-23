import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';
import { ORDER_STAGES } from '../constants/orderStages';

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtAmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const DELIVERED_STAGES = new Set(['delivered', 'paid']);

const STAGE_COLOR = {
  enquiry: 'bg-gray-100 text-gray-700', quoted: 'bg-yellow-100 text-yellow-800', approved: 'bg-blue-100 text-blue-800',
  design: 'bg-purple-100 text-purple-800', printing: 'bg-indigo-100 text-indigo-800', post_printing: 'bg-cyan-100 text-cyan-800',
  finishing: 'bg-teal-100 text-teal-800', ready: 'bg-orange-100 text-orange-800', delivered: 'bg-green-100 text-green-800',
  paid: 'bg-emerald-100 text-emerald-800', lost: 'bg-red-100 text-red-700', cancelled: 'bg-rose-100 text-rose-700',
};

function orderAmount(order) {
  const itemsTotal = (order.Items || []).reduce((s, it) => s + (Number(it.Amount) || 0), 0);
  return Number(order.billTotal) || itemsTotal || Number(order.Amount) || 0;
}
function orderRemark(order) {
  if (order.Items?.length) return order.Items.map((it) => it.Remark || it.Item || '').filter(Boolean).join(', ');
  return order.Remark || order.orderNote || '—';
}
function latestTask(order) {
  const status = order.Status || [];
  return status.length ? (status[status.length - 1].Task || '—') : '—';
}
function delivered(order) {
  const stage = String(order.stage || '').toLowerCase();
  if (DELIVERED_STAGES.has(stage)) return true;
  return (order.Status || []).some((s) => String(s?.Task || '').toLowerCase().includes('delivered'));
}

export default function AllOrdersList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState(searchParams.get('q') || '');
  const [view, setView] = useState(searchParams.get('view') || 'all');
  const [stageFilter, setStageFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'Order_Number', direction: 'desc' });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get('/api/orders/GetOrderList?limit=1000'),
      axios.get('/api/orders/GetDeliveredList'),
      axios.get('/api/orders/GetBillListPaged?page=1&limit=200'),
      axios.get('/api/customers/GetCustomersList'),
    ]).then(([activeRes, deliveredRes, billRes, custRes]) => {
      const active = activeRes.data?.success ? (activeRes.data.result || []) : [];
      const done = deliveredRes.data?.success ? (deliveredRes.data.result || []) : [];
      const bills = billRes.data?.success ? (billRes.data.result || []) : [];
      const byKey = new Map();
      [...active, ...done, ...bills].forEach((o) => {
        const key = o.Order_uuid || o._id;
        if (!key) return;
        byKey.set(key, { ...(byKey.get(key) || {}), ...o });
      });
      setOrders([...byKey.values()]);
      if (custRes.data?.success) setCustomers(custRes.data.result || []);
    }).catch(() => toast.error('Failed to load orders')).finally(() => setLoading(false));
  }, []);

  const customerMap = useMemo(() => Object.fromEntries(customers.filter((c) => c.Customer_uuid).map((c) => [c.Customer_uuid, c.Customer_name])), [customers]);
  const rows = useMemo(() => orders.map((o) => {
    const amount = orderAmount(o);
    const isDelivered = delivered(o);
    const billStatus = String(o.billStatus || 'unpaid').toLowerCase();
    return {
      order: o,
      customerName: o.Customer_name || customerMap[o.Customer_uuid] || o.Customer_uuid || '—',
      remark: orderRemark(o), amount,
      stage: String(o.stage || latestTask(o)).toLowerCase(),
      latestTask: latestTask(o), billStatus, isDelivered,
      isBillable: amount > 0,
      isComplete: isDelivered && (amount <= 0 || billStatus === 'paid'),
      date: o.createdAt || o.updatedAt || '',
    };
  }), [orders, customerMap]);

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => !r.isDelivered).length,
    payment: rows.filter((r) => r.isBillable && r.billStatus !== 'paid').length,
    delivery: rows.filter((r) => !r.isDelivered).length,
    completed: rows.filter((r) => r.isComplete).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter((r) => {
      if (view === 'active' && r.isDelivered) return false;
      if (view === 'payment' && (!r.isBillable || r.billStatus === 'paid')) return false;
      if (view === 'delivery' && r.isDelivered) return false;
      if (view === 'completed' && !r.isComplete) return false;
      if (stageFilter && r.stage !== stageFilter && r.latestTask.toLowerCase() !== stageFilter) return false;
      if (startDate && new Date(r.date) < new Date(startDate)) return false;
      if (endDate && new Date(r.date) > new Date(`${endDate}T23:59:59`)) return false;
      if (q && ![r.order.Order_Number, r.customerName, r.remark, r.stage, r.latestTask].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, view, searchText, stageFilter, startDate, endDate]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const { key, direction } = sortConfig;
    const mul = direction === 'asc' ? 1 : -1;
    const av = key === 'Order_Number' ? Number(a.order.Order_Number || 0) : key === 'date' ? new Date(a.date).getTime() : key === 'amount' ? a.amount : String(a[key] || '');
    const bv = key === 'Order_Number' ? Number(b.order.Order_Number || 0) : key === 'date' ? new Date(b.date).getTime() : key === 'amount' ? b.amount : String(b[key] || '');
    return typeof av === 'string' ? av.localeCompare(bv) * mul : (av - bv) * mul;
  }), [filtered, sortConfig]);

  const setQuickView = (next) => { setView(next); const p = new URLSearchParams(searchParams); if (next === 'all') p.delete('view'); else p.set('view', next); setSearchParams(p, { replace: true }); };
  const sort = (key) => setSortConfig((p) => ({ key, direction: p.key === key && p.direction === 'asc' ? 'desc' : 'asc' }));
  const arrow = (key) => sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : '';
  const clearFilters = () => { setSearchText(''); setStageFilter(''); setStartDate(''); setEndDate(''); setQuickView('all'); };
  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0);

  const quickViews = [
    ['all', 'All'], ['active', 'Active'], ['payment', 'Payment Due'], ['delivery', 'Delivery Pending'], ['completed', 'Completed'],
  ];

  return (
    <div className="pt-16 pb-24 px-4">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div><h2 className="text-xl font-bold text-gray-800">Orders</h2><p className="text-sm text-gray-500">Production, billing, payment and delivery in one place</p></div>
        <div className="text-sm text-gray-600">Showing <b className="text-blue-600">{filtered.length}</b> of {orders.length}</div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {quickViews.map(([key, label]) => <button key={key} onClick={() => setQuickView(key)} className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${view === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{label} <span className="opacity-75">({counts[key]})</span></button>)}
      </div>

      <div className="bg-white border rounded-xl p-3 mb-4 shadow-sm flex flex-wrap gap-3">
        <div className="flex-1 min-w-[220px]"><label className="block text-xs font-medium text-gray-600 mb-1">Search order, customer or job</label><input value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="Order # / customer / remark" /></div>
        <div className="min-w-[150px]"><label className="block text-xs font-medium text-gray-600 mb-1">Stage</label><select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="w-full border rounded-lg px-3 py-1.5 text-sm"><option value="">All stages</option>{ORDER_STAGES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">From</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">To</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></div>
        <div className="flex items-end"><button onClick={clearFilters} className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg border">Clear</button></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="border rounded-lg px-3 py-2 bg-blue-50"><div className="text-xs text-blue-700">Value shown</div><b>{fmtAmt(totalAmount)}</b></div>
        <div className="border rounded-lg px-3 py-2 bg-red-50"><div className="text-xs text-red-700">Payment due</div><b>{counts.payment}</b></div>
        <div className="border rounded-lg px-3 py-2 bg-orange-50"><div className="text-xs text-orange-700">Delivery pending</div><b>{counts.delivery}</b></div>
        <div className="border rounded-lg px-3 py-2 bg-green-50"><div className="text-xs text-green-700">Completed</div><b>{counts.completed}</b></div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-500">Loading orders…</div> : <div className="overflow-x-auto rounded-xl border shadow-sm"><table className="min-w-full border-collapse text-sm bg-white">
        <thead className="bg-gray-100 text-gray-700"><tr>
          <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('Order_Number')}>Order #{arrow('Order_Number')}</th>
          <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('date')}>Date{arrow('date')}</th>
          <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('customerName')}>Customer{arrow('customerName')}</th>
          <th className="py-2 px-3 text-left">Job</th><th className="py-2 px-3 text-left">Stage</th>
          <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('amount')}>Amount{arrow('amount')}</th>
          <th className="py-2 px-3 text-left">Payment</th><th className="py-2 px-3 text-left">Delivery</th><th className="py-2 px-3 text-center">Actions</th>
        </tr></thead>
        <tbody>{sorted.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-gray-400">No orders found</td></tr>}
          {sorted.map((r, idx) => {
            const id = r.order.Order_uuid || r.order._id;
            const stageClass = STAGE_COLOR[r.stage] || 'bg-gray-100 text-gray-600';
            return <tr key={id || idx} className="border-t hover:bg-blue-50">
              <td className="py-2 px-3 font-semibold text-blue-700">#{r.order.Order_Number}</td><td className="py-2 px-3 whitespace-nowrap text-gray-600">{fmtDate(r.date)}</td>
              <td className="py-2 px-3 font-medium">{r.customerName}</td><td className="py-2 px-3 max-w-[220px]"><span className="block truncate" title={r.remark}>{r.remark}</span></td>
              <td className="py-2 px-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stageClass}`}>{r.stage.replace('_', ' ')}</span></td>
              <td className="py-2 px-3 font-semibold whitespace-nowrap">{r.amount > 0 ? fmtAmt(r.amount) : '—'}</td>
              <td className="py-2 px-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.billStatus === 'paid' ? 'bg-green-100 text-green-700' : r.isBillable ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{r.isBillable ? (r.billStatus === 'paid' ? 'Paid' : 'Due') : 'No bill'}</span></td>
              <td className="py-2 px-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.isDelivered ? 'bg-green-100 text-green-700' : 'bg-orange-50 text-orange-700'}`}>{r.isDelivered ? 'Delivered' : 'Pending'}</span></td>
              <td className="py-2 px-3 text-center whitespace-nowrap"><button onClick={() => navigate(`/orderUpdate/${id}`)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button><button onClick={() => navigate(`/reports/invoices?q=${encodeURIComponent(r.order.Order_Number || '')}`)} className="text-purple-600 hover:underline text-xs mr-3">Invoice</button><button onClick={() => navigate(`/updateDelivery/${id}`)} className="text-green-600 hover:underline text-xs">Delivery</button></td>
            </tr>;
          })}
        </tbody>
      </table></div>}
    </div>
  );
}
