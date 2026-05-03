import React, { useMemo, useState } from 'react';

const GROUPS = [
  { title: 'New Orders', keys: ['enquiry', 'quoted', 'approved'] },
  { title: 'In Design', keys: ['design'] },
  { title: 'Printing', keys: ['printing', 'finishing'] },
  { title: 'Ready', keys: ['ready'] },
  { title: 'Delivered', keys: ['delivered', 'paid'] },
];
const NEXT = { enquiry: 'design', quoted: 'approved', approved: 'design', design: 'printing', printing: 'finishing', finishing: 'ready', ready: 'delivered', delivered: 'paid' };
const normalize = (v='') => String(v || '').toLowerCase();
const idOf = (o) => o.Order_uuid || o._id || o.Order_id;
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const dueStatus = (date) => {
  if (!date) return { label: 'No due date', cls: 'text-slate-500', rank: 9 };
  const d = new Date(date); const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (target < today) return { label: d.toLocaleDateString('en-IN'), cls: 'text-red-700', rank: 0 };
  if (target.getTime() === today.getTime()) return { label: 'Today', cls: 'text-orange-700', rank: 1 };
  return { label: d.toLocaleDateString('en-IN'), cls: 'text-emerald-700', rank: 2 };
};

function OrderMiniCard({ order, onView, onMove }) {
  const stage = normalize(order?.stage || order?.highestStatusTask?.Task || 'enquiry');
  const due = dueStatus(order?.dueDate || order?.highestStatusTask?.Delivery_Date);
  const items = Array.isArray(order?.Items) ? order.Items : [];
  const summary = items.slice(0, 2).map((i) => i.Item).filter(Boolean).join(', ') || order?.orderNote || order?.Remark || 'Order details';
  const extra = items.length > 2 ? ` and ${items.length - 2} more` : '';
  const initials = String(order?.assignedToName || order?.highestStatusTask?.Assigned || 'NA').slice(0, 2).toUpperCase();
  const left = due.rank === 0 ? 'border-l-red-500' : due.rank === 1 ? 'border-l-yellow-500' : 'border-l-blue-500';
  return <div className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm border-l-4 ${left}`} onClick={() => onView?.(order)} role="button" tabIndex={0}>
    <div className="flex items-start justify-between gap-2"><div><div className="text-base font-black text-slate-900">#{order.Order_Number || '-'}</div><div className="text-sm font-semibold text-slate-700">{order.Customer_name || 'Unknown'}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold capitalize">{stage}</span></div>
    <div className="mt-2 text-sm text-slate-600 line-clamp-2">{summary}{extra}</div>
    <div className="mt-3 flex items-center justify-between gap-2"><div className={`text-xs font-bold ${due.cls}`}>Due: {due.label}</div><div className="flex items-center gap-2"><span className="text-sm font-black">{money(order.Amount || order.saleSubtotal)}</span><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-[11px] font-black text-emerald-800">{initials}</span></div></div>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white" onClick={(e) => { e.stopPropagation(); onMove?.(order, NEXT[stage] || 'ready'); }}>Move Forward</button>{order?.Mobile_number ? <a className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={(e) => e.stopPropagation()} href={`tel:${order.Mobile_number}`}>Call Customer</a> : null}{stage === 'delivered' ? <button type="button" className="rounded-lg border border-orange-300 px-3 py-2 text-xs font-bold text-orange-700" onClick={(e) => e.stopPropagation()}>Mark Paid</button> : null}</div>
  </div>;
}

function OrderBoard({ columnOrder, groupedOrders, onView, onMove, statusMessage }) {
  const [myOnly, setMyOnly] = useState(false);
  const [overdueFirst, setOverdueFirst] = useState(true);
  const userName = localStorage.getItem('User_name') || '';
  const allOrders = useMemo(() => Object.values(groupedOrders || {}).flat(), [groupedOrders]);
  const filtered = useMemo(() => {
    let rows = [...allOrders];
    if (myOnly) rows = rows.filter((o) => String(o?.highestStatusTask?.Assigned || o?.assignedToName || '').toLowerCase() === userName.toLowerCase());
    if (overdueFirst) rows.sort((a, b) => dueStatus(a.dueDate || a?.highestStatusTask?.Delivery_Date).rank - dueStatus(b.dueDate || b?.highestStatusTask?.Delivery_Date).rank);
    return rows;
  }, [allOrders, myOnly, overdueFirst, userName]);
  const grouped = GROUPS.map((g) => ({ ...g, orders: filtered.filter((o) => g.keys.includes(normalize(o.stage || o?.highestStatusTask?.Task || 'enquiry'))) }));
  const overdue = filtered.filter((o) => dueStatus(o.dueDate || o?.highestStatusTask?.Delivery_Date).rank === 0).length;
  const dueToday = filtered.filter((o) => dueStatus(o.dueDate || o?.highestStatusTask?.Delivery_Date).rank === 1).length;
  return <div className="space-y-3"><div className="rounded-xl border bg-white p-3 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="text-sm font-bold">Total Orders: {filtered.length} | Overdue: {overdue} | Due Today: {dueToday}</div><div className="flex gap-2"><button className={`rounded-lg px-3 py-2 text-sm font-bold ${myOnly ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`} onClick={() => setMyOnly((p) => !p)}>My Orders Only</button><button className={`rounded-lg px-3 py-2 text-sm font-bold ${overdueFirst ? 'bg-orange-500 text-white' : 'bg-slate-100'}`} onClick={() => setOverdueFirst((p) => !p)}>Overdue First</button></div></div></div><div className="grid gap-3 md:grid-cols-5">{grouped.map((group) => <section key={group.title} className={`rounded-xl border p-2 ${group.title === 'Ready' ? 'bg-yellow-50' : group.title === 'Delivered' ? 'bg-emerald-50' : 'bg-slate-50'}`}><h3 className="mb-2 text-sm font-black">{group.title} ({group.orders.length})</h3><div className="space-y-2">{group.orders.map((order) => <OrderMiniCard key={idOf(order)} order={order} onView={onView} onMove={onMove} />)}{!group.orders.length ? <div className="rounded-lg border border-dashed bg-white p-4 text-center text-xs text-slate-500">No orders</div> : null}</div></section>)}</div><div className="sr-only" aria-live="polite">{statusMessage}</div></div>;
}
export default React.memo(OrderBoard);
