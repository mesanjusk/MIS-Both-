import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { whatsappCloudService } from '../../services/whatsappCloudService';
import EmptyState from './EmptyState';
import LoadingSkeleton from './LoadingSkeleton';

const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(Number(value || 0));
const getTs = (item) => new Date(item?.timestamp || item?.createdAt || item?.time || 0);
const getTextType = (item) => String(item?.status || '').toLowerCase();

function SummaryCard({ title, value }) {
  return <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-sm font-medium text-gray-500">{title}</p><p className="mt-2 text-3xl font-semibold text-gray-900">{formatNumber(value)}</p></article>;
}

export default function AnalyticsDashboard() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await whatsappCloudService.getMessages();
        const list = response?.data?.data?.messages || response?.data?.messages || response?.data?.data || response?.data || [];
        setMessages(Array.isArray(list) ? list : []);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const metrics = useMemo(() => {
    const sent = messages.filter((item) => item?.fromMe || String(item?.direction || '').toLowerCase().includes('out')).length;
    const delivered = messages.filter((item) => ['delivered', 'sent', 'read', 'seen'].includes(getTextType(item))).length;
    const read = messages.filter((item) => ['read', 'seen'].includes(getTextType(item))).length;
    const replies = messages.filter((item) => !item?.fromMe && !String(item?.direction || '').toLowerCase().includes('out')).length;
    return { sent, delivered, read, replies };
  }, [messages]);

  const chartData = useMemo(() => {
    const days = new Map();
    messages.forEach((item) => {
      const date = getTs(item);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      if (!days.has(key)) days.set(key, { day: key.slice(5), sent: 0, delivered: 0, read: 0, replies: 0 });
      const row = days.get(key);
      const outgoing = item?.fromMe || String(item?.direction || '').toLowerCase().includes('out');
      if (outgoing) row.sent += 1;
      if (['delivered', 'sent', 'read', 'seen'].includes(getTextType(item))) row.delivered += 1;
      if (['read', 'seen'].includes(getTextType(item))) row.read += 1;
      if (!outgoing) row.replies += 1;
    });

    return [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-14);
  }, [messages]);

  if (loading) {
    return <section className="rounded-xl border border-gray-200 bg-white shadow-sm"><LoadingSkeleton lines={6} /></section>;
  }

  if (!messages.length) {
    return <section className="rounded-xl border border-gray-200 bg-white shadow-sm"><EmptyState title="No Data Available" description="Analytics will appear once WhatsApp message data is available." /></section>;
  }

  return (
    <section className="space-y-5" aria-label="Analytics Dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Messages Sent" value={metrics.sent} />
        <SummaryCard title="Messages Delivered" value={metrics.delivered} />
        <SummaryCard title="Messages Read" value={metrics.read} />
        <SummaryCard title="Replies Received" value={metrics.replies} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Message Trend</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" /><YAxis /><Tooltip /><Legend />
                <Line type="monotone" dataKey="sent" stroke="#2563eb" strokeWidth={2} />
                <Line type="monotone" dataKey="delivered" stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Read & Replies</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" /><YAxis /><Tooltip /><Legend />
                <Bar dataKey="read" fill="#22c55e" name="Read" />
                <Bar dataKey="replies" fill="#f59e0b" name="Replies" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
    </section>
  );
}
