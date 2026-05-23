import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import toast from 'react-hot-toast';

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtAmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

const STAGES = ['enquiry','quoted','approved','design','printing','post_printing','finishing','ready','delivered','paid'];
const STAGE_COLOR = {
  enquiry:       'bg-gray-100 text-gray-700',
  quoted:        'bg-yellow-100 text-yellow-800',
  approved:      'bg-blue-100 text-blue-800',
  design:        'bg-purple-100 text-purple-800',
  printing:      'bg-indigo-100 text-indigo-800',
  post_printing: 'bg-cyan-100 text-cyan-800',
  finishing:     'bg-teal-100 text-teal-800',
  ready:         'bg-orange-100 text-orange-800',
  delivered:     'bg-green-100 text-green-800',
  paid:          'bg-emerald-100 text-emerald-800',
};
const BILL_COLOR = {
  paid:   'bg-green-100 text-green-700 border-green-300',
  unpaid: 'bg-red-50 text-red-600 border-red-200',
};

function orderAmount(order) {
  const itemsTotal = (order.Items || []).reduce((s, it) => s + (Number(it.Amount) || 0), 0);
  return itemsTotal || Number(order.Amount) || 0;
}

function orderRemark(order) {
  if (order.Items?.length) return order.Items.map((it) => it.Remark || it.Item || '').filter(Boolean).join(', ');
  return order.Remark || order.orderNote || '—';
}

function latestTask(order) {
  const status = order.Status || [];
  return status.length ? (status[status.length - 1].Task || '—') : '—';
}

export default function AllOrdersList() {
  const navigate = useNavigate();

  const [orders,    setOrders]    = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const [searchText,    setSearchText]    = useState('');
  const [stageFilter,   setStageFilter]   = useState('');
  const [billFilter,    setBillFilter]    = useState('');
  const [startDate,     setStartDate]     = useState('');
  const [endDate,       setEndDate]       = useState('');
  const [sortConfig,    setSortConfig]    = useState({ key: 'Order_Number', direction: 'desc' });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get('/api/orders/GetOrderList?limit=1000'),
      axios.get('/api/orders/GetDeliveredList'),
      axios.get('/api/customers/GetCustomersList'),
    ])
      .then(([activeRes, deliveredRes, custRes]) => {
        const active    = activeRes.data?.success    ? (activeRes.data.result    || []) : [];
        const delivered = deliveredRes.data?.success ? (deliveredRes.data.result || []) : [];
        // Merge, deduplicate by Order_uuid
        const seen = new Set();
        const merged = [];
        [...active, ...delivered].forEach((o) => {
          const key = o.Order_uuid || o._id;
          if (!seen.has(key)) { seen.add(key); merged.push(o); }
        });
        setOrders(merged);
        if (custRes.data?.success) setCustomers(custRes.data.result || []);
      })
      .catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoading(false));
  }, []);

  const customerMap = useMemo(() => {
    const m = {};
    customers.forEach((c) => { if (c.Customer_uuid) m[c.Customer_uuid] = c.Customer_name; });
    return m;
  }, [customers]);

  const rows = useMemo(() => orders.map((o) => ({
    order:        o,
    customerName: customerMap[o.Customer_uuid] || o.Customer_uuid || '—',
    remark:       orderRemark(o),
    amount:       orderAmount(o),
    stage:        (o.stage || latestTask(o)).toLowerCase(),
    latestTask:   latestTask(o),
    billStatus:   (o.billStatus || '').toLowerCase(),
    date:         o.createdAt || o.updatedAt || '',
  })), [orders, customerMap]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter(({ order, customerName, remark, stage, latestTask: lt }) => {
      if (startDate && new Date(order.createdAt) < new Date(startDate)) return false;
      if (endDate   && new Date(order.createdAt) > new Date(endDate + 'T23:59:59')) return false;
      if (stageFilter && stage !== stageFilter && lt.toLowerCase() !== stageFilter) return false;
      if (billFilter  && (order.billStatus || '').toLowerCase() !== billFilter) return false;
      if (q) {
        const hay = [
          String(order.Order_Number || ''),
          customerName,
          remark,
          stage,
          lt,
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, searchText, stageFilter, billFilter, startDate, endDate]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const { key, direction } = sortConfig;
    list.sort((a, b) => {
      let av, bv;
      if      (key === 'Order_Number') { av = a.order.Order_Number || 0; bv = b.order.Order_Number || 0; }
      else if (key === 'date')         { av = new Date(a.date).getTime(); bv = new Date(b.date).getTime(); }
      else if (key === 'amount')       { av = a.amount; bv = b.amount; }
      else if (key === 'customerName') { av = a.customerName; bv = b.customerName; }
      else if (key === 'remark')       { av = a.remark; bv = b.remark; }
      else if (key === 'stage')        { av = a.stage; bv = b.stage; }
      else                             { av = ''; bv = ''; }
      if (typeof av === 'string') return direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return direction === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [filtered, sortConfig]);

  const sort = (key) => setSortConfig((p) => ({ key, direction: p.key === key && p.direction === 'asc' ? 'desc' : 'asc' }));
  const arrow = (key) => sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : '';

  const totalAmount  = filtered.reduce((s, r) => s + r.amount, 0);
  const paidCount    = filtered.filter((r) => r.billStatus === 'paid').length;
  const unpaidCount  = filtered.filter((r) => r.billStatus === 'unpaid').length;

  const clearFilters = () => { setSearchText(''); setStageFilter(''); setBillFilter(''); setStartDate(''); setEndDate(''); };
  const hasFilter = searchText || stageFilter || billFilter || startDate || endDate;

  return (
    <div className="pt-16 pb-24 px-4">

      {/* ── Header ── */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800">All Orders</h2>
          <p className="text-sm text-gray-500">Complete order register — active and delivered</p>
        </div>
        <div className="text-sm text-gray-600 font-medium">
          Showing <span className="text-blue-600 font-bold">{filtered.length}</span> of {orders.length} orders
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search (Order #, Customer, Remark)</label>
            <input
              type="text"
              placeholder="Type to search…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All Stages</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Bill Status</label>
            <select
              value={billFilter}
              onChange={(e) => setBillFilter(e.target.value)}
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
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
          {hasFilter && (
            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary bar ── */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {[
          { label: 'Total Amount',  value: fmtAmt(totalAmount),    color: 'text-blue-700  bg-blue-50   border-blue-200'   },
          { label: 'Paid Orders',   value: paidCount,              color: 'text-green-700 bg-green-50  border-green-200'  },
          { label: 'Unpaid Orders', value: unpaidCount,            color: 'text-red-600   bg-red-50    border-red-200'    },
          { label: 'Total Orders',  value: filtered.length,        color: 'text-gray-700  bg-gray-50   border-gray-200'   },
        ].map(({ label, value, color }) => (
          <div key={label} className={`flex-1 min-w-[130px] border rounded-xl px-4 py-2 ${color}`}>
            <div className="text-xs font-medium opacity-70">{label}</div>
            <div className="text-lg font-black">{value}</div>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading orders…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border shadow-sm">
          <table className="min-w-full border-collapse text-sm bg-white">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="py-2 px-3 text-left cursor-pointer whitespace-nowrap" onClick={() => sort('Order_Number')}>
                  Order #{arrow('Order_Number')}
                </th>
                <th className="py-2 px-3 text-left cursor-pointer whitespace-nowrap" onClick={() => sort('date')}>
                  Date{arrow('date')}
                </th>
                <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('customerName')}>
                  Customer{arrow('customerName')}
                </th>
                <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('remark')}>
                  Items / Remark{arrow('remark')}
                </th>
                <th className="py-2 px-3 text-left cursor-pointer" onClick={() => sort('stage')}>
                  Stage{arrow('stage')}
                </th>
                <th className="py-2 px-3 text-left cursor-pointer whitespace-nowrap" onClick={() => sort('amount')}>
                  Amount{arrow('amount')}
                </th>
                <th className="py-2 px-3 text-left">Bill</th>
                <th className="py-2 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400">No orders found</td>
                </tr>
              )}
              {sorted.map(({ order, customerName, remark, amount, stage, latestTask: lt, billStatus, date }, idx) => {
                const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1).replace('_', ' ');
                const stageClass = STAGE_COLOR[stage] || 'bg-gray-100 text-gray-600';
                const billClass  = BILL_COLOR[billStatus] || 'bg-gray-50 text-gray-400 border-gray-200';
                const billLabel  = billStatus ? (billStatus.charAt(0).toUpperCase() + billStatus.slice(1)) : '—';
                return (
                  <tr key={order._id || idx} className="border-t hover:bg-blue-50 transition-colors">
                    <td className="py-2 px-3 font-semibold text-blue-700 whitespace-nowrap">
                      #{order.Order_Number}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-gray-600">{fmtDate(date)}</td>
                    <td className="py-2 px-3 font-medium">{customerName}</td>
                    <td className="py-2 px-3 max-w-[220px]">
                      <span className="block truncate text-gray-700" title={remark}>{remark}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${stageClass}`}>
                        {stageLabel || lt}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-semibold whitespace-nowrap">
                      {amount > 0 ? fmtAmt(amount) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-2 px-3">
                      {billStatus ? (
                        <span className={`inline-block border rounded-full px-2 py-0.5 text-xs font-medium ${billClass}`}>
                          {billLabel}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/orderUpdate/${order.Order_uuid || order._id}`)}
                        className="text-blue-600 hover:underline text-xs mr-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => navigate(`/updateDelivery/${order.Order_uuid || order._id}`)}
                        className="text-green-600 hover:underline text-xs"
                      >
                        Delivery
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
