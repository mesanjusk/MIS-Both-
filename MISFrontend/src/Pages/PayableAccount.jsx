import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
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
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient';
import DeliveryDateSidebar from '../Components/reports/DeliveryDateSidebar';
import ExportGuard from '../Components/ExportGuard';

const todayISO = new Date().toISOString().slice(0, 10);
const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const toIndiaISO = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const partyKind = (party) => {
  const tags = (party?.Tags || []).map((tag) => String(tag || '').trim().toLowerCase());
  if (tags.includes('freelancer') || tags.includes('freelance')) return 'freelancer';
  if (tags.includes('contractor')) return 'contractor';
  return 'vendor';
};

const kindLabel = (kind) => {
  if (kind === 'freelancer') return 'Freelancer';
  if (kind === 'contractor') return 'Contractor';
  return 'Vendor';
};

export default function PayableAccount() {
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [parties, setParties] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [partyFilter, setPartyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [partyRes, txRes] = await Promise.all([
        axios.get('/api/vendors/payable-parties'),
        axios.get('/api/transaction'),
      ]);

      setParties(partyRes.data?.success && Array.isArray(partyRes.data.result)
        ? partyRes.data.result
        : []);
      setTransactions(txRes.data?.success && Array.isArray(txRes.data.result)
        ? txRes.data.result
        : []);
    } catch (err) {
      setParties([]);
      setTransactions([]);
      setError(
        err?.response?.status === 403
          ? 'Payable Account requires ledger/account access for this login.'
          : (err?.response?.data?.message || err.message || 'Could not load payable accounts')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const partyById = useMemo(() => {
    const map = {};
    parties.forEach((party) => {
      if (party?.Vendor_uuid) {
        map[party.Vendor_uuid] = {
          ...party,
          kind: partyKind(party),
        };
      }
    });
    return map;
  }, [parties]);

  const allLedgerRows = useMemo(() => {
    const rows = [];

    transactions.forEach((tx) => {
      const date = toIndiaISO(tx?.Transaction_date);
      (tx?.Journal_entry || []).forEach((entry, index) => {
        const party = partyById[entry?.Account_id];
        if (!party) return;

        rows.push({
          key: `${tx.Transaction_uuid || tx._id || tx.Transaction_id}-${entry.Account_id}-${index}`,
          date,
          transactionId: tx.Transaction_id,
          transactionUuid: tx.Transaction_uuid,
          partyId: entry.Account_id,
          partyName: party.Vendor_name,
          partyKind: party.kind,
          mobile: party.Mobile_number || '',
          description: tx.Description || '—',
          paymentMode: tx.Payment_mode || '—',
          source: tx.Source || '',
          orderNumber: tx.Order_number || null,
          type: entry.Type || '',
          amount: Number(entry.Amount || 0),
        });
      });
    });

    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [transactions, partyById]);

  const currentBalanceByParty = useMemo(() => {
    const map = {};
    allLedgerRows.forEach((row) => {
      if (!map[row.partyId]) map[row.partyId] = { debit: 0, credit: 0 };
      if (row.type === 'Debit') map[row.partyId].debit += row.amount;
      if (row.type === 'Credit') map[row.partyId].credit += row.amount;
    });
    return map;
  }, [allLedgerRows]);

  const filteredParties = useMemo(() => {
    return parties
      .map((party) => ({ ...party, kind: partyKind(party) }))
      .filter((party) => (typeFilter === 'all' ? true : party.kind === typeFilter))
      .filter((party) => (partyFilter ? party.Vendor_uuid === partyFilter : true))
      .filter((party) => {
        if (balanceFilter === 'all') return true;
        const bal = currentBalanceByParty[party.Vendor_uuid] || { debit: 0, credit: 0 };
        const due = bal.credit - bal.debit;
        if (balanceFilter === 'due') return due > 0;
        if (balanceFilter === 'advance') return due < 0;
        if (balanceFilter === 'settled') return Math.abs(due) < 0.005;
        return true;
      });
  }, [parties, typeFilter, partyFilter, balanceFilter, currentBalanceByParty]);

  const filteredPartyIds = useMemo(
    () => new Set(filteredParties.map((party) => party.Vendor_uuid)),
    [filteredParties]
  );

  const relevantAllRows = useMemo(
    () => allLedgerRows.filter((row) => filteredPartyIds.has(row.partyId)),
    [allLedgerRows, filteredPartyIds]
  );

  const selectedRows = useMemo(() => {
    if (!selectedDate) return relevantAllRows;
    return relevantAllRows.filter((row) => row.date === selectedDate);
  }, [relevantAllRows, selectedDate]);

  const creditRows = useMemo(
    () => selectedRows.filter((row) => row.type === 'Credit'),
    [selectedRows]
  );

  const debitRows = useMemo(
    () => selectedRows.filter((row) => row.type === 'Debit'),
    [selectedRows]
  );

  const availableDates = useMemo(() => {
    const dates = new Set(allLedgerRows.map((row) => row.date).filter(Boolean));
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [allLedgerRows]);

  const dateCountMap = useMemo(() => {
    const map = {};
    allLedgerRows.forEach((row) => {
      if (row.date) map[row.date] = (map[row.date] || 0) + 1;
    });
    return map;
  }, [allLedgerRows]);

  const totals = useMemo(() => {
    const added = creditRows.reduce((sum, row) => sum + row.amount, 0);
    const paid = debitRows.reduce((sum, row) => sum + row.amount, 0);
    const currentDue = filteredParties.reduce((sum, party) => {
      const bal = currentBalanceByParty[party.Vendor_uuid] || { debit: 0, credit: 0 };
      return sum + Math.max(0, bal.credit - bal.debit);
    }, 0);

    return {
      parties: filteredParties.length,
      added,
      paid,
      movement: added - paid,
      currentDue,
    };
  }, [creditRows, debitRows, filteredParties, currentBalanceByParty]);

  const selectedParty = useMemo(
    () => parties.find((party) => party.Vendor_uuid === partyFilter) || null,
    [parties, partyFilter]
  );

  const selectedLabel = selectedDate ? fmtDate(selectedDate) : 'All Dates';

  const openStatement = (row) => {
    navigate('/accounts/ledger?tab=statement', {
      state: {
        customer: {
          uuid: row.partyId,
          name: row.partyName,
          Customer_uuid: row.partyId,
          Customer_name: row.partyName,
        },
      },
    });
  };

  const exportRows = useMemo(
    () => selectedRows.map((row) => ({
      Date: fmtDate(row.date),
      Party: row.partyName,
      Type: kindLabel(row.partyKind),
      Side: row.type === 'Credit' ? 'Payable Added' : 'Paid / Adjusted',
      Description: row.description,
      'Order No': row.orderNumber || '',
      Mode: row.paymentMode,
      Amount: row.amount,
    })),
    [selectedRows]
  );

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payable Account');
    XLSX.writeFile(wb, `payable-account-${selectedDate || 'all'}.xlsx`);
  };

  const exportPdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13);
    doc.text(`Payable Account — ${selectedLabel}`, 14, 14);
    autoTable(doc, {
      startY: 20,
      styles: { fontSize: 8 },
      head: [['Date', 'Party', 'Type', 'Side', 'Description', 'Order', 'Mode', 'Amount']],
      body: exportRows.map((row) => [
        row.Date,
        row.Party,
        row.Type,
        row.Side,
        row.Description,
        row['Order No'],
        row.Mode,
        money(row.Amount),
      ]),
    });
    doc.save(`payable-account-${selectedDate || 'all'}.pdf`);
  };

  const renderRows = (rows, emptyText) => (
    <TableContainer sx={{ maxHeight: '58vh' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {!selectedDate && <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>}
            <TableCell sx={{ fontWeight: 700 }}>Vendor / Freelancer</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Ref</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={selectedDate ? 4 : 5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.key} hover>
                {!selectedDate && <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</TableCell>}
                <TableCell onClick={() => openStatement(row)} sx={{ cursor: 'pointer' }}>
                  <Typography variant="body2" fontWeight={700} color="primary.main">
                    {row.partyName}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Chip
                      size="small"
                      label={kindLabel(row.partyKind)}
                      variant="outlined"
                      sx={{ height: 18, fontSize: 9.5 }}
                    />
                    {row.mobile ? (
                      <Typography variant="caption" color="text.secondary">{row.mobile}</Typography>
                    ) : null}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 190 }}>{row.description}</Typography>
                  <Typography variant="caption" color="text.secondary">{row.paymentMode}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {row.orderNumber ? `Order #${row.orderNumber}` : row.transactionId ? `Txn #${row.transactionId}` : '—'}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{money(row.amount)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '80vh', gap: 2, p: { xs: 1, md: 2 } }}>
      <DeliveryDateSidebar
        title="Payable Account"
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        availableDates={availableDates}
        dateCountMap={dateCountMap}
        allCount={allLedgerRows.length}
        loading={loading}
        countLabel="entries"
        formatDate={fmtDate}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', lg: 'center' }}
          sx={{ mb: 1.5 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={900} noWrap>Payable Account</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedLabel} · vendors, freelancers and contractors
            </Typography>
          </Box>

          <TextField
            select
            size="small"
            label="Party Type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            sx={{ width: { xs: '100%', lg: 130 } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="vendor">Vendor</MenuItem>
            <MenuItem value="freelancer">Freelancer</MenuItem>
            <MenuItem value="contractor">Contractor</MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            label="Balance"
            value={balanceFilter}
            onChange={(e) => setBalanceFilter(e.target.value)}
            sx={{ width: { xs: '100%', lg: 120 } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="due">Due</MenuItem>
            <MenuItem value="advance">Advance</MenuItem>
            <MenuItem value="settled">Settled</MenuItem>
          </TextField>

          <Autocomplete
            size="small"
            options={parties}
            value={selectedParty}
            onChange={(_event, value) => setPartyFilter(value?.Vendor_uuid || '')}
            getOptionLabel={(option) => option?.Vendor_name || ''}
            isOptionEqualToValue={(option, value) => option.Vendor_uuid === value.Vendor_uuid}
            sx={{ width: { xs: '100%', lg: 190 } }}
            renderOption={(props, option) => (
              <li {...props} key={option.Vendor_uuid}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">{option.Vendor_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {kindLabel(partyKind(option))}
                  </Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Vendor / Freelancer" placeholder="All parties" />
            )}
          />

          <Tooltip title="Refresh payable accounts">
            <IconButton size="small" onClick={load} disabled={loading}>
              {loading ? <CircularProgress size={17} /> : <RefreshRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          <ExportGuard>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                color="error"
                size="small"
                startIcon={<PictureAsPdfRoundedIcon />}
                onClick={exportPdf}
                disabled={!selectedRows.length}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}
              >
                PDF
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<FileDownloadRoundedIcon />}
                onClick={exportExcel}
                disabled={!selectedRows.length}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}
              >
                Excel
              </Button>
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
            { label: 'Parties', value: totals.parties, color: 'text.primary', Icon: GroupsRoundedIcon },
            { label: 'Payable Added', value: money(totals.added), color: 'error.dark', Icon: TrendingUpRoundedIcon },
            { label: 'Paid / Adjusted', value: money(totals.paid), color: 'success.dark', Icon: PaymentsRoundedIcon },
            { label: 'Current Due', value: money(totals.currentDue), color: 'warning.dark', Icon: AccountBalanceWalletRoundedIcon },
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

        {error ? (
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}>
            <Typography color="error.main">{error}</Typography>
          </Paper>
        ) : (
          <Stack direction={{ xs: 'column', xl: 'row' }} spacing={2} alignItems="flex-start">
            <Paper variant="outlined" sx={{ borderRadius: 3, flex: 1, minWidth: 0, width: '100%', overflow: 'hidden' }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  color="error.dark"
                  sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
                >
                  Payable Added (IN)
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} color="error.dark">
                  {money(totals.added)}
                </Typography>
              </Stack>
              {renderRows(creditRows, 'No payable entries found for this selection.')}
            </Paper>

            <Paper variant="outlined" sx={{ borderRadius: 3, flex: 1, minWidth: 0, width: '100%', overflow: 'hidden' }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  color="success.dark"
                  sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
                >
                  Payments / Adjustments (OUT)
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} color="success.dark">
                  {money(totals.paid)}
                </Typography>
              </Stack>
              {renderRows(debitRows, 'No payment or adjustment entries found for this selection.')}
            </Paper>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
