import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import { FaWhatsapp, FaSortUp, FaSortDown } from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { jsPDF } from "jspdf";
import "jspdf-autotable";

const OFFICE_VENDOR_GROUP_NAME = 'Office & Vendor';

const AllTransaction1 = () => {
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [outstandingReport, setOutstandingReport] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // receivable | payable | zero | all
  const [groupFilter, setGroupFilter] = useState('all'); // account group filter
  const [role, setRole] = useState('operator'); // admin | operator (default non-admin)

  const navigate = useNavigate();

  // Get role from localStorage (admin shows all mobiles; others get masked for Office & Vendor)
  useEffect(() => {
    const r = (localStorage.getItem('role') || localStorage.getItem('User_role') || 'operator').toLowerCase();
    setRole(r);
  }, []);

  const isAdmin = role === 'admin';

  const groupOf = (cust) =>
    cust?.Account_group || cust?.Group || cust?.group || 'Others';

  useEffect(() => {
    const fetchData = async () => {
      const [txRes, custRes] = await Promise.all([
        axios.get('/transaction'),
        axios.get('/customer/GetCustomersList'),
      ]);
      if (txRes.data?.success) setTransactions(txRes.data.result || []);
      if (custRes.data?.success) setCustomers(custRes.data.result || []);
    };
    fetchData();
  }, []);

  // Build outstanding report
  useEffect(() => {
    const report = customers.map((cust) => {
      let debit = 0, credit = 0;
      (transactions || []).forEach((tx) => {
        (tx?.Journal_entry || []).forEach((entry) => {
          if (entry?.Account_id === cust?.Customer_uuid) {
            if (entry?.Type === 'Debit') debit += Number(entry?.Amount || 0);
            if (entry?.Type === 'Credit') credit += Number(entry?.Amount || 0);
          }
        });
      });

      const grp = groupOf(cust);
      return {
        uuid: cust?.Customer_uuid,
        name: cust?.Customer_name || 'Unnamed',
        mobile: cust?.Mobile_number || 'No phone number',
        group: grp,
        debit,
        credit,
        balance: credit - debit,
      };
    });
    setOutstandingReport(report);
  }, [transactions, customers]);

  // Unique account-group options (sorted)
  const groupOptions = useMemo(() => {
    const set = new Set((customers || []).map((c) => groupOf(c)));
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [customers]);

  // Helper: whether to hide mobile for this row
  const shouldHideMobile = (item) =>
    !isAdmin && item?.group === OFFICE_VENDOR_GROUP_NAME;

  const displayMobile = (item) =>
    shouldHideMobile(item) ? 'Hidden' : (item?.mobile || 'No phone number');

  // Apply filters + sorting
  const sortedReport = useMemo(() => {
    const filtered = (outstandingReport || [])
      .filter((item) => {
        if (filterType === 'receivable') return item.balance > 0;
        if (filterType === 'payable') return item.balance < 0;
        if (filterType === 'zero') return item.balance === 0 && (item.debit !== 0 || item.credit !== 0);
        return true;
      })
      .filter((item) => (groupFilter === 'all' ? true : item.group === groupFilter))
      .filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const sorted = [...filtered].sort((a, b) => {
      const key = sortConfig.key;
      const dir = sortConfig.direction === 'asc' ? 1 : -1;

      const va = key === 'mobile' ? displayMobile(a) : a[key];
      const vb = key === 'mobile' ? displayMobile(b) : b[key];

      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    return sorted;
  }, [outstandingReport, filterType, groupFilter, searchQuery, sortConfig, role]);

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sendMessageToAPI = async (name, phone, balance) => {
    const today = new Date().toLocaleDateString('en-IN');
    const message = `Dear ${name}, your balance is ₹${balance} as of ${today}. Please clear it soon. - S.K.Digital`;

    const payload = {
      mobile: phone,
      userName: name,
      type: 'customer',
      message,
    };

    try {
      const { data: result } = await axios.post('/usertask/send-message', payload);
      alert(result.error ? 'Failed to send: ' + result.error : 'Message sent successfully.');
    } catch (error) {
      console.error('Request failed:', error);
      alert('Failed to send message.');
    }
  };

  const sendWhatsApp = (item) => {
    // Respect privacy rule
    if (shouldHideMobile(item)) {
      return alert('Mobile number is hidden for this account group.');
    }
    if (!item.mobile || item.mobile === 'No phone number') {
      return alert('No phone number available.');
    }
    if (window.confirm(`Send WhatsApp message to ${item.name}?\nBalance: ₹${item.balance}`)) {
      sendMessageToAPI(item.name, item.mobile, item.balance);
    }
  };

  const viewTransactions = (customer) => {
    navigate('/allTransaction3', { state: { customer } });
  };

  const exportToExcel = () => {
    const data = sortedReport.map((item) => ({
      Customer: item.name,
      Group: item.group,
      Mobile: displayMobile(item),
      Debit: item.debit,
      Credit: item.credit,
      Amount: `₹${Math.abs(item.balance)}`,
      Type: item.balance < 0 ? 'Payable' : item.balance > 0 ? 'Receivable' : 'Settled',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Outstanding Report');
    XLSX.writeFile(wb, 'outstanding_report.xlsx');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Outstanding Report', 14, 10);
    doc.autoTable({
      head: [['Customer', 'Group', 'Mobile', 'Amount']],
      body: sortedReport.map((item) => [
        item.name,
        item.group,
        displayMobile(item),
        `₹${Math.abs(item.balance)}`,
      ]),
      startY: 20,
    });
    doc.save('outstanding_report.pdf');
  };

  return (
    <div className="pt-04 pb-12 max-w-8xl mx-auto px-4">
      {/* Header & Toolbar */}
      <div className="flex flex-col md:flex-row justify-between gap-3 mb-4 items-center">
        <h2 className="text-xl font-semibold text-blue-700">Outstanding Report</h2>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Export Excel
          </button>
          <button onClick={exportToPDF} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
            Export PDF
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Search customer name..."
          className="flex-1 p-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Account Group Filter */}
        <select
          className="p-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          title="Filter by Account Group"
        >
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {g === 'all' ? 'All Groups' : g}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2">
          {['receivable', 'payable', 'zero', 'all'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded transition ${
                filterType === type
                  ? type === 'receivable'
                    ? 'bg-blue-600 text-white'
                    : type === 'payable'
                    ? 'bg-red-600 text-white'
                    : type === 'zero'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-white'
                  : type === 'receivable'
                  ? 'bg-blue-100 text-blue-700'
                  : type === 'payable'
                  ? 'bg-red-100 text-red-700'
                  : type === 'zero'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto">
        <table className="w-full table-auto text-sm border shadow-sm rounded bg-white">
          <thead className="bg-blue-100 text-blue-900">
            <tr>
              <th onClick={() => handleSort('name')} className="border px-3 py-2 cursor-pointer text-left">
                Customer {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
              </th>
              <th onClick={() => handleSort('group')} className="border px-3 py-2 cursor-pointer text-left">
                Group {sortConfig.key === 'group' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
              </th>
              <th onClick={() => handleSort('mobile')} className="border px-3 py-2 cursor-pointer text-left">
                Mobile {sortConfig.key === 'mobile' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
              </th>
              <th onClick={() => handleSort('balance')} className="border px-3 py-2 cursor-pointer text-right">
                Amount {sortConfig.key === 'balance' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
              </th>
              <th className="border px-3 py-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedReport.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-6 text-gray-500">No customers found.</td>
              </tr>
            ) : (
              sortedReport.map((item, index) => (
                <tr key={index} className="border-t hover:bg-gray-50 transition">
                  <td onClick={() => viewTransactions(item)} className="px-3 py-2 text-blue-700 cursor-pointer">
                    {item.name}
                  </td>
                  <td className="px-3 py-2">{item.group}</td>
                  <td className="px-3 py-2">{displayMobile(item)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${item.balance < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                    ₹{Math.abs(item.balance)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {(!shouldHideMobile(item) && item.mobile !== 'No phone number') ? (
                      <button onClick={() => sendWhatsApp(item)}>
                        <FaWhatsapp className="text-blue-600 text-lg hover:text-blue-700 transition" />
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">No action</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AllTransaction1;
