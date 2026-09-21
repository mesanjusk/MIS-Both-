import toast from 'react-hot-toast';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient.js';
import { FaWhatsapp, FaSortUp, FaSortDown } from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Paper,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import ExportGuard from '../Components/ExportGuard';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import DeliveryDateSidebar from '../Components/reports/DeliveryDateSidebar';

const todayISO = () => new Date().toISOString().slice(0, 10);
const toISODate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};
const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

const OutstandingReport = () => {
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerGroups, setCustomerGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(todayISO());

  const [partyFilter, setPartyFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [filterType, setFilterType] = useState('all'); // receivable | payable | all
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

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
        const res = await axios.get('/api/transaction');
        if (res.data?.success) setTransactions(res.data.result || []);
      } catch (error) {
        console.error('Error fetching transactions:', error);
        toast.error('Unable to load transactions.');
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, []);

  const availableDates = useMemo(() => {
    const set = new Set((transactions || []).map((tx) => toISODate(tx?.Transaction_date)).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const dateCountMap = useMemo(() => {
    const map = {};
    (transactions || []).forEach((tx) => {
      const date = toISODate(tx?.Transaction_date);
      if (date) map[date] = (map[date] || 0) + 1;
    });
    return map;
  }, [transactions]);

  const effectiveTransactions = useMemo(() => {
    if (!selectedDate) return transactions || [];
    return (transactions || []).filter((tx) => toISODate(tx?.Transaction_date) === selectedDate);
  }, [transactions, selectedDate]);

  // Party-wise outstanding balance for the selected date range.
  const outstandingReport = useMemo(() => {
    return customers.map((cust) => {
      let debit = 0;
      let credit = 0;
      (effectiveTransactions || []).forEach((tx) => {
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
  }, [effectiveTransactions, customers]);

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
    // Open the account's full statement — now the Statement tab on the Ledger
    // page. The customer must ride along as router state, which the Statement
    // screen reads to load that account's transactions.
    navigate('/accounts/ledger?tab=statement', { state: { customer } });
  };

  const rangeLabel = selectedDate ? fmtDate(selectedDate) : 'All Dates';

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
    XLSX.writeFile(wb, `outstanding_${selectedDate || 'all'}_${todayISO()}.xlsx`);
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
    doc.save(`outstanding_${selectedDate || 'all'}_${todayISO()}.pdf`);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>
      <DeliveryDateSidebar
        title="Outstanding"
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        availableDates={availableDates}
        dateCountMap={dateCountMap}
        allCount={transactions.length}
        loading={loading}
        countLabel="transactions"
        formatDate={fmtDate}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ mb: 1.5 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={900} noWrap>Outstanding</Typography>
            <Typography variant="body2" color="text.secondary">
              {rangeLabel} · {totals.partyCount} part{totals.partyCount === 1 ? 'y' : 'ies'}
            </Typography>
          </Box>

          <TextField
            select
            size="small"
            label="Type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            sx={{ width: { xs: '100%', sm: 125 } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="receivable">Receivable</MenuItem>
            <MenuItem value="payable">Payable</MenuItem>
          </TextField>

          <Autocomplete
            size="small"
            options={groupOptions}
            value={groupFilter || null}
            onChange={(_, value) => setGroupFilter(value || '')}
            sx={{ width: { xs: '100%', sm: 170 } }}
            renderInput={(params) => <TextField {...params} label="Group" placeholder="All groups" />}
          />

          <Autocomplete
            size="small"
            options={partyOptions}
            value={partyFilter || null}
            onChange={(_, value) => setPartyFilter(value || '')}
            sx={{ width: { xs: '100%', sm: 180 } }}
            renderInput={(params) => <TextField {...params} label="Party" placeholder="All parties" />}
          />

          <ExportGuard>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Export as PDF">
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<PictureAsPdfRoundedIcon />}
                  onClick={exportToPDF}
                  disabled={!sortedReport.length}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}
                >
                  PDF
                </Button>
              </Tooltip>
              <Tooltip title="Export as Excel">
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<FileDownloadRoundedIcon />}
                  onClick={exportToExcel}
                  disabled={!sortedReport.length}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}
                >
                  Excel
                </Button>
              </Tooltip>
            </Stack>
          </ExportGuard>
        </Stack>

        <TextField
          type="date"
          size="small"
          value={selectedDate || ''}
          onChange={(e) => setSelectedDate(e.target.value || null)}
          sx={{ display: { xs: 'block', md: 'none' }, mb: 1, width: '100%' }}
          InputLabelProps={{ shrink: true }}
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
          {[
            { label: 'Total Receivable', value: `₹${totals.totalReceivable.toLocaleString('en-IN')}`, color: 'success.dark', Icon: TrendingUpRoundedIcon },
            { label: 'Total Payable', value: `₹${totals.totalPayable.toLocaleString('en-IN')}`, color: 'error.dark', Icon: TrendingDownRoundedIcon },
            { label: 'Net Outstanding', value: `₹${totals.netOutstanding.toLocaleString('en-IN')}`, color: 'primary.main', Icon: AccountBalanceWalletRoundedIcon },
            { label: 'Parties', value: totals.partyCount, color: 'warning.dark', Icon: GroupsRoundedIcon },
          ].map(({ label, value, color, Icon }) => (
            <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="h6" fontWeight={900} color={color}>{value}</Typography>
                  </Box>
                  <Icon sx={{ fontSize: 20, color }} />
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {loading ? (
          <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, maxHeight: '68vh' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell onClick={() => handleSort('name')} sx={{ fontWeight: 700, cursor: 'pointer' }}>
                    Customer {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
                  </TableCell>
                  <TableCell onClick={() => handleSort('group')} sx={{ fontWeight: 700, cursor: 'pointer' }}>
                    Group {sortConfig.key === 'group' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
                  </TableCell>
                  <TableCell onClick={() => handleSort('mobile')} sx={{ fontWeight: 700, cursor: 'pointer' }}>
                    Mobile {sortConfig.key === 'mobile' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
                  </TableCell>
                  <TableCell onClick={() => handleSort('balance')} align="right" sx={{ fontWeight: 700, cursor: 'pointer' }}>
                    Outstanding {sortConfig.key === 'balance' && (sortConfig.direction === 'asc' ? <FaSortUp className="inline ml-1" /> : <FaSortDown className="inline ml-1" />)}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, width: 80 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedReport.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No outstanding balances found{selectedDate ? ` for ${fmtDate(selectedDate)}` : ''}.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedReport.map((item, index) => (
                    <TableRow key={item.uuid || index} hover>
                      <TableCell onClick={() => viewTransactions(item)} sx={{ cursor: 'pointer' }}>
                        <Typography variant="body2" fontWeight={700} color="primary.main">{item.name}</Typography>
                      </TableCell>
                      <TableCell>{item.group}</TableCell>
                      <TableCell>{item.mobile}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={900} color={item.balance < 0 ? 'error.main' : 'success.dark'}>
                          ₹{Math.abs(item.balance).toLocaleString('en-IN')}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {item.mobile !== 'No phone number' ? (
                          <Tooltip title="Send outstanding reminder">
                            <Button
                              size="small"
                              variant="outlined"
                              color="success"
                              onClick={() => sendWhatsApp(item)}
                              sx={{ minWidth: 32, px: 0.7, borderRadius: 1.5 }}
                            >
                              <FaWhatsapp />
                            </Button>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
};

export default OutstandingReport;
