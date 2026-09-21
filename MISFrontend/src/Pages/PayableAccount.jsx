import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
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
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import { useNavigate } from 'react-router-dom';
import axios from '../apiClient';
import DeliveryDateSidebar from '../Components/reports/DeliveryDateSidebar';
import ExportGuard from '../Components/ExportGuard';
import PurchaseInvoiceEditor from '../Components/PurchaseInvoiceEditor';
import PostPressJobsPanel from '../Components/PostPressJobsPanel';
import {
  copyPathToClipboard,
  joinWindowsPath,
  launchMisFileUrl,
  normalizeWindowsPath,
} from '../utils/localFileLauncher';

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
  const [printingRows, setPrintingRows] = useState([]);
  const [printingDates, setPrintingDates] = useState([]);
  const [partyFilter, setPartyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [printingLoading, setPrintingLoading] = useState(false);
  const [error, setError] = useState('');
  const [printingError, setPrintingError] = useState('');
  const [invoiceDrafts, setInvoiceDrafts] = useState({});
  const [vendorDrafts, setVendorDrafts] = useState({});
  const [savingFolderId, setSavingFolderId] = useState('');
  const [localShareRoot, setLocalShareRoot] = useState('');
  const [invoiceEditorRow, setInvoiceEditorRow] = useState(null);
  const [expandedPostPress, setExpandedPostPress] = useState({});

  const loadCore = useCallback(async () => {
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

  const loadNetworkFileSettings = useCallback(async () => {
    const res = await axios.get('/api/network-files/settings');
    const root = normalizeWindowsPath(res?.data?.result?.networkShareRoot || '');
    setLocalShareRoot(root);
    return root;
  }, []);

  useEffect(() => {
    let alive = true;
    loadNetworkFileSettings().catch(() => {
      if (alive) setLocalShareRoot('');
    });

    const handleSettingsUpdate = (event) => {
      if (!alive) return;
      setLocalShareRoot(normalizeWindowsPath(event?.detail?.networkShareRoot || ''));
    };
    window.addEventListener('network-file-settings-updated', handleSettingsUpdate);
    return () => {
      alive = false;
      window.removeEventListener('network-file-settings-updated', handleSettingsUpdate);
    };
  }, [loadNetworkFileSettings]);

  const loadPrinting = useCallback(async (refresh = false) => {
    setPrintingLoading(true);
    setPrintingError('');
    try {
      const res = await axios.get('/api/vendors/printing-payables', {
        params: {
          ...(selectedDate ? { date: selectedDate } : {}),
          ...(refresh ? { refresh: true } : {}),
        },
      });

      const rows = res.data?.success && Array.isArray(res.data.result) ? res.data.result : [];
      const dates = res.data?.success && Array.isArray(res.data.dates) ? res.data.dates : [];
      setPrintingRows(rows);
      setPrintingDates(dates);

      const nextInvoiceDrafts = {};
      const nextVendorDrafts = {};
      rows.forEach((row) => {
        nextInvoiceDrafts[row.folderId] = Number(row.invoiceValue || 0) > 0
          ? String(Number(row.invoiceValue || 0))
          : '';
        nextVendorDrafts[row.folderId] = row.vendorUuid || '';
      });
      setInvoiceDrafts(nextInvoiceDrafts);
      setVendorDrafts(nextVendorDrafts);
    } catch (err) {
      setPrintingRows([]);
      setPrintingDates([]);
      setPrintingError(
        err?.response?.data?.message
        || err.message
        || 'Could not load Daily Work Printing folders'
      );
    } finally {
      setPrintingLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    loadPrinting(false);
  }, [loadPrinting]);

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

  const selectedLedgerRows = useMemo(() => {
    if (!selectedDate) return relevantAllRows;
    return relevantAllRows.filter((row) => row.date === selectedDate);
  }, [relevantAllRows, selectedDate]);

  const debitRows = useMemo(
    () => selectedLedgerRows.filter((row) => row.type === 'Debit'),
    [selectedLedgerRows]
  );

  const visiblePrintingRows = useMemo(() => {
    return printingRows.filter((row) => {
      const printingVendorId = vendorDrafts[row.folderId] || row.vendorUuid || '';
      const participantIds = [
        printingVendorId,
        ...(Array.isArray(row.postPressJobs)
          ? row.postPressJobs.map((job) => job.payableVendorUuid || job.vendor_uuid).filter(Boolean)
          : []),
      ].filter(Boolean);
      const uniqueParticipantIds = [...new Set(participantIds)];

      if (partyFilter && !uniqueParticipantIds.includes(partyFilter)) return false;

      if (typeFilter !== 'all') {
        const hasType = uniqueParticipantIds.some(
          (id) => partyById[id]?.kind === typeFilter
        );
        if (!hasType) return false;
      }

      if (balanceFilter !== 'all') {
        const hasBalanceMatch = uniqueParticipantIds.some((id) => {
          const bal = currentBalanceByParty[id] || { debit: 0, credit: 0 };
          const due = bal.credit - bal.debit;
          if (balanceFilter === 'due') return due > 0;
          if (balanceFilter === 'advance') return due < 0;
          if (balanceFilter === 'settled') return Math.abs(due) < 0.005;
          return true;
        });
        if (!hasBalanceMatch) return false;
      }

      return true;
    });
  }, [
    printingRows,
    vendorDrafts,
    partyById,
    partyFilter,
    typeFilter,
    balanceFilter,
    currentBalanceByParty,
  ]);

  const availableDates = useMemo(
    () => printingDates.map((item) => item.date).filter(Boolean),
    [printingDates]
  );

  const dateCountMap = useMemo(() => {
    const map = {};
    printingDates.forEach((item) => {
      if (item?.date) map[item.date] = Number(item.count || 0);
    });
    return map;
  }, [printingDates]);

  const totalPrintingFolders = useMemo(
    () => printingDates.reduce((sum, item) => sum + Number(item.count || 0), 0),
    [printingDates]
  );

  const totals = useMemo(() => {
    const added = visiblePrintingRows.reduce(
      (sum, row) => sum + Number(row.invoiceValue || 0) + Number(row.postPressTotal || 0),
      0
    );
    const paid = debitRows.reduce((sum, row) => sum + row.amount, 0);
    const currentDue = filteredParties.reduce((sum, party) => {
      const bal = currentBalanceByParty[party.Vendor_uuid] || { debit: 0, credit: 0 };
      return sum + Math.max(0, bal.credit - bal.debit);
    }, 0);

    return {
      parties: filteredParties.length,
      printingJobs: visiblePrintingRows.length,
      added,
      paid,
      currentDue,
    };
  }, [visiblePrintingRows, debitRows, filteredParties, currentBalanceByParty]);

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

  const openPrintingLocalFolder = async (row) => {
    let shareRoot = localShareRoot;
    let relativePath = '';
    let anchorFound = true;

    try {
      const resolved = await axios.get('/api/network-files/resolve', {
        params: { fileId: row.folderId },
      });
      shareRoot = normalizeWindowsPath(resolved?.data?.result?.networkShareRoot || shareRoot);
      relativePath = String(resolved?.data?.result?.relativePath || '').trim();
      anchorFound = resolved?.data?.result?.anchorFound !== false;
      if (shareRoot) setLocalShareRoot(shareRoot);
    } catch {
      // Fall back to the known archive structure below.
    }

    if (!shareRoot) {
      try {
        shareRoot = await loadNetworkFileSettings();
      } catch {
        // A clear message is shown below.
      }
    }

    if (!shareRoot) {
      toast.error('Network folder is not configured. Ask Admin to set Admin → Network Files.');
      return;
    }

    const target = relativePath && anchorFound
      ? joinWindowsPath(shareRoot, relativePath)
      : joinWindowsPath(
          shareRoot,
          row.monthFolderName,
          row.dateFolderName,
          'Printing',
          row.folderName
        );

    if (!target) {
      toast.error('Could not resolve the local Printing folder path.');
      return;
    }

    await copyPathToClipboard(target);
    toast.success('Opening local Printing folder…');
    launchMisFileUrl(target, { select: false });
  };

  const openPurchaseInvoiceEditor = (row) => {
    setInvoiceEditorRow({
      ...row,
      vendorUuid: vendorDrafts[row.folderId] || row.vendorUuid || '',
      invoiceValue: Number(invoiceDrafts[row.folderId] || row.invoiceValue || 0),
    });
  };

  const savePrintingInvoice = async (row) => {
    const vendorUuid = vendorDrafts[row.folderId] || row.vendorUuid || '';
    const amount = Number(invoiceDrafts[row.folderId] || 0);

    if (!vendorUuid) {
      toast.error('Select the vendor / freelancer first.');
      return;
    }
    if (!(amount > 0)) {
      toast.error('Enter an invoice value greater than zero.');
      return;
    }

    setSavingFolderId(row.folderId);
    try {
      const res = await axios.post('/api/purchaseorder/printing-invoice', {
        sourceDriveFolderId: row.folderId,
        sourceDriveFolderName: row.folderName,
        poUuid: row.poUuid || '',
        Vendor_uuid: vendorUuid,
        amount,
        orderNumber: row.orderNumber || null,
        poDate: row.date || selectedDate || todayISO,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Could not save invoice value');
      }

      toast.success(row.poUuid ? 'Printing invoice updated.' : 'Printing invoice added to payable ledger.');

      setPrintingRows((prev) => prev.map((item) => (
        item.folderId === row.folderId
          ? {
              ...item,
              vendorUuid,
              vendorName: partyById[vendorUuid]?.Vendor_name || item.vendorName,
              vendorMatched: true,
              invoiceValue: amount,
              poUuid: res.data?.result?.PO_uuid || item.poUuid,
              poNumber: res.data?.result?.PO_Number || item.poNumber,
              poStatus: res.data?.result?.status || item.poStatus,
            }
          : item
      )));

      await loadCore();
      // Refresh Drive + PO enrichment so a page reload within the cache window
      // still sees the newly saved invoice immediately.
      await loadPrinting(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Could not save printing invoice');
    } finally {
      setSavingFolderId('');
    }
  };

  const refreshAll = () => {
    loadCore();
    loadPrinting(true);
  };

  const exportRows = useMemo(() => {
    const printing = visiblePrintingRows.map((row) => ({
      Date: fmtDate(row.date),
      Party: partyById[vendorDrafts[row.folderId] || row.vendorUuid]?.Vendor_name || row.vendorName || row.parsedVendorName || 'Unmapped',
      Type: kindLabel(partyKind(partyById[vendorDrafts[row.folderId] || row.vendorUuid] || {})),
      Side: 'Payable Added / Printing',
      Description: row.folderName,
      'Order No': row.orderNumber || '',
      Customer: row.customerName || '',
      Amount: Number(row.invoiceValue || 0),
    }));

    const postPress = visiblePrintingRows.flatMap((row) =>
      (Array.isArray(row.postPressJobs) ? row.postPressJobs : []).map((job) => ({
        Date: fmtDate(row.date),
        Party: job.vendor_name || 'Unmapped',
        Type: 'Post Press',
        Side: 'Payable Added / Post Press',
        Description: job.job_type || 'post_printing',
        'Order No': row.orderNumber || '',
        Customer: row.customerName || '',
        Amount: Number(job.jobValue || 0),
      }))
    );

    const payments = debitRows.map((row) => ({
      Date: fmtDate(row.date),
      Party: row.partyName,
      Type: kindLabel(row.partyKind),
      Side: 'Paid / Adjusted',
      Description: row.description,
      'Order No': row.orderNumber || '',
      Customer: '',
      Amount: row.amount,
    }));

    return [...printing, ...postPress, ...payments];
  }, [visiblePrintingRows, debitRows, partyById, vendorDrafts]);

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
      head: [['Date', 'Party', 'Type', 'Side', 'Description', 'Order', 'Customer', 'Amount']],
      body: exportRows.map((row) => [
        row.Date,
        row.Party,
        row.Type,
        row.Side,
        row.Description,
        row['Order No'],
        row.Customer,
        money(row.Amount),
      ]),
    });
    doc.save(`payable-account-${selectedDate || 'all'}.pdf`);
  };

  const renderPaymentRows = (rows) => (
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
                No payment or adjustment entries found for this selection.
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
                  <Chip
                    size="small"
                    label={kindLabel(row.partyKind)}
                    variant="outlined"
                    sx={{ height: 18, fontSize: 9.5 }}
                  />
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
        allCount={totalPrintingFolders}
        loading={printingLoading}
        countLabel="printing jobs"
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
              {selectedLabel} · Daily Work / Printing folders + payable ledger
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
            renderInput={(params) => (
              <TextField {...params} label="Vendor / Freelancer" placeholder="All parties" />
            )}
          />

          <Tooltip title="Refresh Drive Printing folders and ledger">
            <IconButton size="small" onClick={refreshAll} disabled={loading || printingLoading}>
              {loading || printingLoading ? <CircularProgress size={17} /> : <RefreshRoundedIcon fontSize="small" />}
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
                disabled={!exportRows.length}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800 }}
              >
                PDF
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<FileDownloadRoundedIcon />}
                onClick={exportExcel}
                disabled={!exportRows.length}
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
            { label: 'Printing Jobs', value: totals.printingJobs, color: 'text.primary', Icon: GroupsRoundedIcon },
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
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center', mb: 1 }}>
            <Typography color="error.main">{error}</Typography>
          </Paper>
        ) : null}

        {printingError ? (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 1 }}>
            <Typography color="error.main">{printingError}</Typography>
          </Paper>
        ) : null}

        <Stack direction={{ xs: 'column', xl: 'row' }} spacing={2} alignItems="flex-start">
          <Paper variant="outlined" sx={{ borderRadius: 3, flex: 1.15, minWidth: 0, width: '100%', overflow: 'hidden' }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Box>
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  color="error.dark"
                  sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
                >
                  Payable Added (IN)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Printing + linked Post Press vendor costs
                </Typography>
              </Box>
              <Typography variant="subtitle2" fontWeight={700} color="error.dark">
                {money(totals.added)}
              </Typography>
            </Stack>

            <TableContainer sx={{ maxHeight: '58vh' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {!selectedDate && <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>}
                    <TableCell sx={{ fontWeight: 700, width: 70 }}>Order</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Vendor / Freelancer</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 135 }}>Post Press</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 58 }}>Folder</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: 135 }}>Printing Invoice</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, width: 112 }}>Invoice</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {printingLoading ? (
                    <TableRow>
                      <TableCell colSpan={selectedDate ? 7 : 8} align="center" sx={{ py: 5 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : visiblePrintingRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={selectedDate ? 7 : 8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No Printing folders found{selectedDate ? ` for ${fmtDate(selectedDate)}` : ''}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visiblePrintingRows.map((row) => {
                      const selectedVendorId = vendorDrafts[row.folderId] || row.vendorUuid || '';
                      const selectedVendor = parties.find((party) => party.Vendor_uuid === selectedVendorId) || null;
                      const draftAmount = invoiceDrafts[row.folderId] ?? '';
                      const changed = Number(draftAmount || 0) !== Number(row.invoiceValue || 0)
                        || selectedVendorId !== (row.vendorUuid || '');

                      const isPostPressOpen = Boolean(expandedPostPress[row.folderId]);
                      const postPressCount = Number(row.postPressCount || 0);
                      const postPressCompleted = Number(row.postPressCompleted || 0);
                      const postPressTotal = Number(row.postPressTotal || 0);

                      return (
                        <Fragment key={row.folderId}>
                        <TableRow hover>
                          {!selectedDate && <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</TableCell>}
                          <TableCell>
                            <Typography variant="body2" fontWeight={800}>
                              {row.orderNumber ? `#${row.orderNumber}` : '—'}
                            </Typography>
                            {!row.orderUuid ? (
                              <Typography variant="caption" color="warning.dark">No MIS order</Typography>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Autocomplete
                              size="small"
                              options={parties}
                              value={selectedVendor}
                              onChange={(_event, value) => {
                                setVendorDrafts((prev) => ({
                                  ...prev,
                                  [row.folderId]: value?.Vendor_uuid || '',
                                }));
                              }}
                              getOptionLabel={(option) => option?.Vendor_name || ''}
                              isOptionEqualToValue={(option, value) => option.Vendor_uuid === value.Vendor_uuid}
                              sx={{ minWidth: 155 }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  placeholder={row.parsedVendorName || 'Select party'}
                                  error={!selectedVendorId}
                                  helperText={
                                    !row.vendorMatched && row.parsedVendorName
                                      ? `Folder: ${row.parsedVendorName}`
                                      : ''
                                  }
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <Tooltip title={row.folderName}>
                              <Box>
                                <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                                  {row.customerName || '—'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 150, display: 'block' }}>
                                  {row.folderName}
                                </Typography>
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              variant={postPressCount ? 'outlined' : 'text'}
                              onClick={() => setExpandedPostPress((prev) => ({
                                ...prev,
                                [row.folderId]: !prev[row.folderId],
                              }))}
                              disabled={!row.orderUuid}
                              endIcon={
                                isPostPressOpen
                                  ? <KeyboardArrowUpRoundedIcon />
                                  : <KeyboardArrowDownRoundedIcon />
                              }
                              sx={{ textTransform: 'none', fontWeight: 800, whiteSpace: 'nowrap' }}
                            >
                              {postPressCount
                                ? `Post Press ${postPressCompleted}/${postPressCount}`
                                : '+ Post Press'}
                            </Button>
                            {postPressTotal > 0 ? (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {money(postPressTotal)}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Tooltip
                              title={
                                localShareRoot
                                  ? 'Open synced/local Printing folder'
                                  : 'Open local folder (Admin → Network Files must be configured)'
                              }
                            >
                              <IconButton
                                size="small"
                                onClick={() => openPrintingLocalFolder(row)}
                                sx={{ border: '1px solid', borderColor: 'divider' }}
                                aria-label="open local Printing folder"
                              >
                                <FolderOpenRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                              <TextField
                                size="small"
                                type="number"
                                value={draftAmount}
                                onChange={(e) => {
                                  setInvoiceDrafts((prev) => ({
                                    ...prev,
                                    [row.folderId]: e.target.value,
                                  }));
                                }}
                                inputProps={{ min: 0, step: '0.01' }}
                                placeholder="₹0"
                                sx={{ width: 95 }}
                              />
                              <Tooltip title={row.poUuid ? 'Quick update invoice value' : 'Quick add invoice value'}>
                                <span>
                                  <IconButton
                                    size="small"
                                    color={row.poUuid ? 'primary' : 'success'}
                                    disabled={
                                      savingFolderId === row.folderId
                                      || !selectedVendorId
                                      || !(Number(draftAmount || 0) > 0)
                                      || (!changed && Boolean(row.poUuid))
                                    }
                                    onClick={() => savePrintingInvoice(row)}
                                  >
                                    {savingFolderId === row.folderId
                                      ? <CircularProgress size={18} />
                                      : <SaveRoundedIcon fontSize="small" />}
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Stack>
                            {row.poNumber ? (
                              <Typography variant="caption" color="text.secondary" display="block">
                                PO #{row.poNumber}
                              </Typography>
                            ) : null}
                            {postPressTotal > 0 ? (
                              <Typography variant="caption" color="secondary.main" display="block">
                                + Post Press {money(postPressTotal)}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              size="small"
                              variant={row.poUuid ? 'outlined' : 'contained'}
                              color={row.poUuid ? 'primary' : 'success'}
                              startIcon={row.poUuid ? <EditRoundedIcon /> : <ReceiptLongRoundedIcon />}
                              onClick={() => openPurchaseInvoiceEditor(row)}
                              disabled={!selectedVendorId}
                              sx={{ textTransform: 'none', whiteSpace: 'nowrap', fontWeight: 800 }}
                            >
                              {row.poUuid ? 'Edit Invoice' : 'Create Invoice'}
                            </Button>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell
                            colSpan={selectedDate ? 7 : 8}
                            sx={{ p: 0, borderBottom: isPostPressOpen ? undefined : 0 }}
                          >
                            <Collapse in={isPostPressOpen} timeout="auto" unmountOnExit>
                              <PostPressJobsPanel
                                row={row}
                                parties={parties}
                                onOpenFolder={openPrintingLocalFolder}
                                onRefresh={async () => {
                                  await Promise.all([loadCore(), loadPrinting(true)]);
                                }}
                              />
                            </Collapse>
                          </TableCell>
                        </TableRow>
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper variant="outlined" sx={{ borderRadius: 3, flex: 0.85, minWidth: 0, width: '100%', overflow: 'hidden' }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Box>
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  color="success.dark"
                  sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
                >
                  Payments / Adjustments (OUT)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Actual payable-account ledger debits
                </Typography>
              </Box>
              <Typography variant="subtitle2" fontWeight={700} color="success.dark">
                {money(totals.paid)}
              </Typography>
            </Stack>
            {renderPaymentRows(debitRows)}
          </Paper>
        </Stack>
      </Box>

      <PurchaseInvoiceEditor
        open={Boolean(invoiceEditorRow)}
        onClose={() => setInvoiceEditorRow(null)}
        row={invoiceEditorRow}
        parties={parties}
        initialVendorId={
          invoiceEditorRow
            ? (vendorDrafts[invoiceEditorRow.folderId] || invoiceEditorRow.vendorUuid || '')
            : ''
        }
        onSaved={async () => {
          await Promise.all([loadCore(), loadPrinting(true)]);
        }}
      />
    </Box>
  );
}
