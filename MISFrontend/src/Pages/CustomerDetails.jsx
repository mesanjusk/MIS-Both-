import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "../apiClient";
import { LoadingSpinner } from "../Components";

const TABS = ["Orders", "Payments", "Enquiries", "WhatsApp Chats"];

const tabMap = {
  Orders: "orders",
  Payments: "payments",
  Enquiries: "enquiries",
  "WhatsApp Chats": "whatsAppChats",
};

export default function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [customerIdInput, setCustomerIdInput] = useState(id || "");
  const [timeline, setTimeline] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadTimeline = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`/api/customers/${id}/timeline`);
        if (!mounted) return;
        setTimeline(res?.data?.result || res?.data?.data || {});
      } catch (error) {
        if (!mounted) return;
        console.error("Failed to fetch customer timeline", error);
        setTimeline({});
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (id) loadTimeline();
    else {
      setTimeline({});
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [id]);

  const items = useMemo(() => timeline?.[tabMap[activeTab]] || [], [activeTab, timeline]);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Customer 360 View</h1>
        <p className="text-sm text-slate-500">Customer ID: {id || "-"}</p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={customerIdInput}
            onChange={(event) => setCustomerIdInput(event.target.value)}
            placeholder="Enter customer id"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              if (!customerIdInput?.trim()) return;
              navigate(`/customers/${customerIdInput.trim()}`);
            }}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Load Customer
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm ${
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {!id ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Enter a customer ID to view timeline data.
          </div>
        ) : loading ? (
          <div className="py-8 text-center">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {items?.length ? (
              items.map((entry, idx) => (
                <div key={entry?._id || idx} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-800">{entry?.title || entry?.name || `Item ${idx + 1}`}</p>
                  <p className="text-xs text-slate-500">{entry?.description || entry?.status || "No details available"}</p>
                  <p className="mt-1 text-xs text-slate-400">{entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : "-"}</p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No records found for {activeTab}.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
