import toast from 'react-hot-toast';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import { FaWhatsapp, FaSortUp, FaSortDown } from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Autocomplete, TextField } from '@mui/material';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import SummaryCard from '../Components/dashboard/SummaryCard';

const todayISO = () => new Date().toLocaleDateString('en-CA');

const addDaysISO = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
};

const dayStartUTC = (isoDate) => new Date(`${isoDate}T00:00:00`).toISOString();
const dayEndUTC = (isoDate) => new Date(`${isoDate}T23:59:59.999`).toISOString();

const DATE_PRESETS = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last Week' },
  { key: 'month', label: 'Last Month' },
  { key: 'custom', label: 'Custom Range' },
];

const getPresetRange = (preset) => {
  const today = todayISO();
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') return { from: addDaysISO(today, -6), to: today };
  if (preset === 'month') return { from: addDaysISO(today, -29), to: today };
  return { from: '', to: '' };
};

const OutstandingReport = () => {
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerGroups, setCustomerGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const [datePreset, setDatePreset] = useState('all');
  const [customFrom, setCustomFrom] = useState(addDaysISO(todayISO(), -29));
  const [customTo, setCustomTo] = useState(todayISO());

  const [partyFilter, setPartyFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [filterType, setFilterType] = useState('all'); // receivable | payable | all
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  const activeRange = useMemo(() => {
    if (datePreset === 'custom') return { from: customFrom, to: customTo };
    return getPresetRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await axios.get('/api/customers/GetCustomersList');
        if (res.data?.success) setCustomers(res.data.result || []);
      } catch (error) {
        console.error('Error fetching customers:', error);
        toast.error('Unable to load customers.');
      }
    };
    fetchCustomers();
  }, []);

  useEffect(() => {
    const fetchCustomerGroups = async () => {
      try {
        const res = await axios.get('/api/customergroup/GetCustomergroupList');
        if (res.data?.success) setCustomerGroups(res.data.result || []);
      } catch (error) {
        console.error('Error fetching customer groups:', error);
      }
    };
    fetchCustomerGroups();
  }, []);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const params = {};
        if (activeRange.from) params.fromDate = dayStartUTC(activeRange.from);
        if (activeRange.to) params.toDate = dayEndUTC(activeRange.to);
        const res = await axios.get('/api/transaction', { params });
        if (res.data?.success) setTransactions(res.data.result || []);
      } catch (error) {
        console.error('Error fetching transactions:', error);
        toast.error('Unable to load transactions.');
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [activeRange.from, activeRange.to]);

  // Party-wise outstanding balance for the selected date range.
  const outstandingReport = useMemo(() => {
    return customers.map((cust) => {
      let debit = 0;
      let credit = 0;
      (transactions || []).forEach((tx) => {
        (tx?.Journal_entry || []).forEach((entry) => {
          if (entry?.Account_id === cust?.Customer_uuid) {
            if (entry?.Type === 'Debit') debit += Number(entry?.Amount || 0);
            if (entry?.Type === 'Credit') credit += Number(entry?.Amount || 0);
          }
        });
      });

      return {
        uuid: cust?.Customer_uuid,
        name: cust?.Customer_name || 'Unnamed',
        mobile: cust?.Mobile_number || 'No phone number',
        group: cust?.Customer_group || 'Others',
        debit,
        credit,
        balance: debit - credit,
      };
    });
  }, [transactions, customers]);

  const partyOptions = useMemo(
    () => Array.from(new Set(customers.map((c) => c?.Customer_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [customers]
  );

  const groupOptions = useMemo(
    () => Array.from(new Set(customerGroups.map((g) => g?.Customer_group).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [customerGroups]
  );

  const filteredReport = useMemo(() => {
    return outstandingReport
      .filter((item) => (item.debit !== 0 || item.credit !== 0))
      .filter((item) => {
        if (filterType === 'receivable') return item.balance > 0;
        if (filterType === 'payable') return item.balance < 0;
        return true;
      })
      .filter((item) => (partyFilter ? item.name === partyFilter : true))
      .filter((item) => (groupFilter ? item.group === groupFilter : true));
  }, [outstandingReport, filterType, partyFilter, groupFilter]);

  const sortedReport = useMemo(() => {
    const sorted = [...filteredReport].sort((a, b) => {
      const key = sortConfig.key;
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      const va = a[key];
      const vb = b[key];
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [filteredReport, sortConfig]);

  const totals = useMemo(() => {
    const totalReceivable = filteredReport.filter((r) => r.balance > 0).reduce((sum, r) => sum + r.balance, 0);
    const totalPayable = filteredReport.filter((r) => r.balance < 0).reduce((sum, r) => sum + Math.abs(r.balance), 0);
    return {
      totalReceivable,
      totalPayable,
      netOutstanding: totalReceivable - totalPayable,
      partyCount: filteredReport.length,
    };
  }, [filteredReport]);

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      return { key, direction: 'asc' };
    });
  };

  const sendMessageToAPI = async (name, phone, balance) => {
    const today = new Date().toLocaleDateString('en-IN');
    const message = `Dear ${name}, your outstanding balance is ₹${Math.abs(balance)} as of ${today}. Please clear it soon. - S.K.Digital`;

    const payload = { mobile: phone, userName: name, type: 'customer', message };

    try {
      const { data: result } = await axios.post('/api/usertasks/send-message', payload);
      result.error ? toast.error('Failed to send: ' + result.error) : toast.success('Message sent successfully.');
    } catch (error) {
      console.error('Request failed:', error);
      toast.error('Failed to send message.');
    }
  };

  const sendWhatsApp = (item) => {
    if (!item.mobile || item.mobile === 'No phone number') {
      toast.error('No phone number available.');
      return;
    }
    if (window.confirm(`Send WhatsApp message to ${item.name}?\nOutstanding: ₹${Math.abs(item.balance)}`)) {
      sendMessageToAPI(item.name, item.mobile, item.balance);
    }
  };

  const viewTransactions = (customer) => {
    navigate('/allTransaction3', { state: { customer } });
  };

  const rangeLabel = activeRange.from && activeRange.to ? `${activeRange.from} to ${activeRange.to}` : 'All time';

  const exportToExcel = () => {
    const data = sortedReport.map((item) => ({
      Customer: item.name,
      Group: item.group,
      Mobile: item.mobile,
      Debit: item.debit,
      Credit: item.credit,
      Amount: Math.abs(item.balance),
      Type: item.balance < 0 ? 'Payable' : item.balance > 0 ? 'Receivable' : 'Settled',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Outstanding');
    XLSX.writeFile(wb, `outstanding_${datePreset}_${todayISO()}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text(`Outstanding Report (${rangeLabel})`, 14, 10);
    doc.autoTable({
      head: [['Customer', 'Group', 'Mobile', 'Amount', 'Type']],
      body: sortedReport.map((item) => [
        item.name,
        item.group,
        item.mobile,
        `Rs ${Math.abs(item.balance)}`,
        item.balance < 0 ? 'Payable' : item.balance > 0 ? 'Receivable' : 'Settled',
      ]),
      startY: 20,
    });
    doc.save(`outstanding_${datePreset}_${todayISO()}.pdf`);
  };

  return (
    <div className="pt-04 pb-12 max-w-8xl mx-auto px-4">
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

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <SummaryCard title="Total Receivable" value={`₹${totals.totalReceivable.toLocaleString('en-IN')}`} icon={TrendingUpRoundedIcon} variant="success" />
        <SummaryCard title="Total Payable" value={`₹${totals.totalPayable.toLocaleString('en-IN')}`} icon={TrendingDownRoundedIcon} variant="danger" />
        <SummaryCard title="Net Outstanding" value={`₹${totals.netOutstanding.toLocaleString('en-IN')}`} icon={AccountBalanceWalletRoundedIcon} variant="primary" />
        <SummaryCard title="Parties" value={totals.partyCount} icon={GroupsRoundedIcon} variant="warning" trend={rangeLabel} />
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            onClick={() => setDatePreset(preset.key)}
            className={`px-3 py-1.5 rounded text-sm transition ${
              datePreset === preset.key ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {preset.label}
          </button>
        ))}
        {loading ? <span className="text-xs text-gray-500">Loading…</span> : null}
      </div>

      {datePreset === 'custom' ? (
        <div className="flex flex-col md:flex-row gap-3 mb-4 items-center">
          <TextField
            size="small"
            label="From"
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            label="To"
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </div>
      ) : null}

      {/* Party + type filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-4 items-center">
        <div className="flex-1 min-w-[220px]">
          <Autocomplete
            size="small"
            options={partyOptions}
            value={partyFilter || null}
            onChange={(_, value) => setPartyFilter(value || '')}
            renderInput={(params) => <TextField {...params} label="Filter by party" placeholder="All parties" />}
          />
        </div>

        <div className="flex-1 min-w-[220px]">
          <Autocomplete
            size="small"
            options={groupOptions}
            value={groupFilter || null}
            onChange={(_, value) => setGroupFilter(value || '')}
            renderInput={(params) => <TextField {...params} label="Filter by customer group" placeholder="All groups" />}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {['receivable', 'payable', 'all'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded transition ${
                filterType === type
                  ? type === 'receivable'
                    ? 'bg-blue-600 text-white'
                    : type === 'payable'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-white'
                  : type === 'receivable'
                  ? 'bg-blue-100 text-blue-700'
                  : type === 'payable'
                  ? 'bg-red-100 text-red-700'
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
                Outstanding {sortConfig.key === 'balance' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
              </th>
              <th className="border px-3 py-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedReport.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-6 text-gray-500">
                  No outstanding balances found for this filter.
                </td>
              </tr>
            ) : (
              sortedReport.map((item, index) => (
                <tr key={item.uuid || index} className="border-t hover:bg-gray-50 transition">
                  <td onClick={() => viewTransactions(item)} className="px-3 py-2 text-blue-700 cursor-pointer">
                    {item.name}
                  </td>
                  <td className="px-3 py-2">{item.group}</td>
                  <td className="px-3 py-2">{item.mobile}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${item.balance < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                    ₹{Math.abs(item.balance).toLocaleString('en-IN')}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.mobile !== 'No phone number' ? (
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
          {sortedReport.length > 0 ? (
            <tfoot>
              <tr className="bg-gray-100 font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  NET OUTSTANDING
                </td>
                <td className={`px-3 py-2 text-right ${totals.netOutstanding < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                  ₹{Math.abs(totals.netOutstanding).toLocaleString('en-IN')}
                </td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
};

export default OutstandingReport;
