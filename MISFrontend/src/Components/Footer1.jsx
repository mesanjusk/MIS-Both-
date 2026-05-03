import React, { useEffect, useState } from 'react';
import {
  FiCheckCircle,
  FiBarChart2,
  FiAlertCircle,
  FiFileText,
} from 'react-icons/fi';
import axios from '../apiClient.js';

export default function UnifiedFooterTabView() {
  const [activeTab, setActiveTab] = useState('delivered');
  const [data, setData] = useState({
    delivered: [],
    report: [],
    outstanding: [],
    bills: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch all required data once
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/orders/all-data'); // ✅ Replace with your unified API
        setData({
          delivered: res.data.delivered,
          report: res.data.report,
          outstanding: res.data.outstanding,
          bills: res.data.bills,
        });
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const renderTabContent = () => {
    if (loading) return <div className="text-center mt-10">Loading...</div>;

    switch (activeTab) {
      case 'delivered':
        return <DeliveredTab data={data.delivered} />;
      case 'report':
        return <ReportTab data={data.report} />;
      case 'outstanding':
        return <OutstandingTab data={data.outstanding} />;
      case 'bills':
        return <BillsTab data={data.bills} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Main content area */}
      <div className="flex-grow p-4">{renderTabContent()}</div>

      {/* Footer tabs */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-secondary to-primary text-white">
        <div className="flex justify-around p-2">
          <TabButton
            label="Delivered"
            icon={<FiCheckCircle className="h-6 w-6 mb-1" />}
            active={activeTab === 'delivered'}
            onClick={() => setActiveTab('delivered')}
          />
          <TabButton
            label="Report"
            icon={<FiBarChart2 className="h-6 w-6 mb-1" />}
            active={activeTab === 'report'}
            onClick={() => setActiveTab('report')}
          />
          <TabButton
            label="Outstanding"
            icon={<FiAlertCircle className="h-6 w-6 mb-1" />}
            active={activeTab === 'outstanding'}
            onClick={() => setActiveTab('outstanding')}
          />
          <TabButton
            label="Bills"
            icon={<FiFileText className="h-6 w-6 mb-1" />}
            active={activeTab === 'bills'}
            onClick={() => setActiveTab('bills')}
          />
        </div>
      </div>
    </div>
  );
}

// Reusable tab button
function TabButton({ label, icon, active, onClick }) {
  return (
    <button
      className={`flex flex-col items-center px-2 transition ${
        active ? 'text-yellow-300' : 'text-white opacity-80'
      }`}
      onClick={onClick}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}

// Sample components for each tab
function DeliveredTab({ data }) {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Delivered Orders</h2>
      {data.map((item, idx) => (
        <div key={idx} className="border p-2 mb-2 rounded bg-white text-black">
          {item.name}
        </div>
      ))}
    </div>
  );
}

function ReportTab({ data }) {
  return <div>Report Content – {data.length} items</div>;
}

function OutstandingTab({ data }) {
  return <div>Outstanding Content – {data.length} items</div>;
}

function BillsTab({ data }) {
  return <div>Bills Content – {data.length} items</div>;
}
