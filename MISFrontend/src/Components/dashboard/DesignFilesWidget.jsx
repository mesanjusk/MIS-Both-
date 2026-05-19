import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import DesignServicesRoundedIcon from '@mui/icons-material/DesignServicesRounded';
import LocalPrintshopRoundedIcon from '@mui/icons-material/LocalPrintshopRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import DriveFileRenameOutlineRoundedIcon from '@mui/icons-material/DriveFileRenameOutlineRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded';
import ViewModuleRoundedIcon from '@mui/icons-material/ViewModuleRounded';
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import RateReviewRoundedIcon from '@mui/icons-material/RateReviewRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import axios from '../../apiClient';

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
  {
    key: 'pending', label: 'Pending', icon: PendingActionsRoundedIcon,
    stageFilter: (s) => s >= 1 && s <= 4, viewOnly: true, color: 'warning',
    info: 'Files currently being worked on by the designer. No action needed until moved to Final.',
  },
  {
    key: 'review', label: 'Review', icon: RateReviewRoundedIcon,
    stageFilter: (s) => s >= 5 && s <= 7, viewOnly: true, color: 'info',
    info: 'Design approved internally. Waiting for office to move to Final and create an order.',
  },
  {
    key: 'final', label: 'Final', icon: DoneAllRoundedIcon,
    stageFilter: (s) => s === 8, viewOnly: false, color: 'success',
  },
  {
    key: 'printing', label: 'Printing', icon: LocalPrintshopRoundedIcon,
    stageFilter: (s) => s === 9, viewOnly: false, color: 'error',
  },
  {
    key: 'all', label: 'All Files', icon: FolderOpenRoundedIcon,
    stageFilter: () => true, viewOnly: false, color: 'default',
  },
  {
    key: 'archive', label: 'Archive', icon: ArchiveRoundedIcon,
    stageFilter: null, viewOnly: true, color: 'default',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function alreadyPrefixedWithOrder(fileName, orderNumber) {
  if (!fileName || orderNumber == null) return false;
  return new RegExp(`^${orderNumber}[\\s\\-_]`).test(String(fileName));
}

function pjLabel(num) {
  return `PJ-${String(num).padStart(3, '0')}`;
}

function buildCSV(files) {
  const header = ['File Name', 'Stage', 'Order #', 'Status', 'Print Job'];
  const rows = files.map((f) => [
    f.fileName || '',
    f.stageLabel || '',
    f.orderNumber || '',
    f.matched ? 'Matched' : f.isDraft ? 'Draft' : 'Unmatched',
    f.printJobNumber != null ? pjLabel(f.printJobNumber) : '',
  ]);
  return [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function openPrintWindow(files, tabLabel) {
  const rows = files.map((f) => `
    <tr>
      <td>${(f.fileName || '').replace(/</g, '&lt;')}</td>
      <td>${f.stageLabel || ''}</td>
      <td>${f.orderNumber || ''}</td>
      <td style="color:${f.matched ? '#2e7d32' : '#e65100'}">${f.matched ? 'Matched' : f.isDraft ? 'Draft' : 'Unmatched'}</td>
      <td>${f.printJobNumber != null ? pjLabel(f.printJobNumber) : ''}</td>
    </tr>`).join('');
  const html = `<!DOCTYPE html><html><head><title>Design Files — ${tabLabel}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
      h2{font-size:14px;margin-bottom:8px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:bold}
      tr:nth-child(even){background:#fafafa}
    </style></head><body>
    <h2>Design Files — ${tabLabel} &nbsp;&nbsp; <small style="font-weight:normal;color:#888">${new Date().toLocaleString()}</small></h2>
    <table><thead><tr><th>File Name</th><th>Stage</th><th>Order #</th><th>Status</th><th>Print Job</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
}

// ─── StageChip ────────────────────────────────────────────────────────────────
function StageChip({ stageLabel: label, stageColor }) {
  const theme = stageColor || { bg: '#F5F5F5', color: '#424242' };
  return (
    <Chip
      label={label} size="small"
      sx={{ bgcolor: theme.bg, color: theme.color, fontWeight: 600, fontSize: 10, height: 18, borderRadius: 1, '& .MuiChip-label': { px: 0.75 } }}
    />
  );
}

// ─── Status badges ────────────────────────────────────────────────────────────
function StatusBadges({ file }) {
  return (
    <Stack direction="row" spacing={0.4} flexWrap="wrap">
      {file.isDraft && (
        <Chip label="DRAFT" size="small" sx={{ fontSize: 9, height: 16, bgcolor: 'grey.200', color: 'grey.700', fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }} />
      )}
      {file.isTemporaryOrder && (
        <Chip label="TEMP" size="small" sx={{ fontSize: 9, height: 16, bgcolor: 'warning.100', color: 'warning.800', fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }} />
      )}
      {file.printJobNumber != null && (
        <Chip label={pjLabel(file.printJobNumber)} size="small" sx={{ fontSize: 9, height: 16, bgcolor: 'success.100', color: 'success.800', fontWeight: 700, '& .MuiChip-label': { px: 0.6 } }} />
      )}
      {file.matched && !file.isDraft && (
        <Chip
          label={`#${file.orderNumber}`} size="small"
          icon={<CheckCircleRoundedIcon sx={{ fontSize: '10px !important' }} />}
          sx={{ fontSize: 9, height: 16, bgcolor: 'success.50', color: 'success.700', fontWeight: 600, '& .MuiChip-label': { px: 0.5 } }}
        />
      )}
    </Stack>
  );
}

// ─── Inline action buttons ────────────────────────────────────────────────────
function FileActions({ file, onRename, onConfirm, onCreatePrintJob, onEditPrintJob, onRelink, viewOnly }) {
  const [renaming, setRenaming] = useState(false);
  const [creatingPJ, setCreatingPJ] = useState(false);
  if (viewOnly) return null;

  const needsRename = file.matched && file.orderNumber != null && !alreadyPrefixedWithOrder(file.fileName, file.orderNumber);

  const handleRename = async (e) => {
    e.stopPropagation();
    if (!onRename || renaming) return;
    setRenaming(true);
    try { await onRename(file); } finally { setRenaming(false); }
  };

  const handleCreatePJ = async (e) => {
    e.stopPropagation();
    if (!onCreatePrintJob || creatingPJ) return;
    setCreatingPJ(true);
    try { await onCreatePrintJob(file); } finally { setCreatingPJ(false); }
  };

  return (
    <Stack direction="row" spacing={0.25} alignItems="center">
      {file.stageNumber === 8 && onConfirm && (
        <Tooltip title="Confirm as real MIS order">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onConfirm(file); }} sx={{ color: 'success.600' }}>
            <AssignmentTurnedInRoundedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      )}
      {file.stageNumber === 9 && file.printJobNumber != null && onEditPrintJob && (
        <Tooltip title="Update print job vendor & amount">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEditPrintJob(file); }} sx={{ color: 'text.secondary' }}>
            <EditNoteRoundedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      )}
      {file.stageNumber === 9 && file.printJobNumber == null && onCreatePrintJob && (
        <Tooltip title="Create print job">
          <IconButton size="small" onClick={handleCreatePJ} disabled={creatingPJ} sx={{ color: 'warning.600' }}>
            {creatingPJ ? <CircularProgress size={11} /> : <ReceiptLongRoundedIcon sx={{ fontSize: 15 }} />}
          </IconButton>
        </Tooltip>
      )}
      {file.orderUuid && onRelink && (
        <Tooltip title={`Change order (currently #${file.orderNumber})`}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onRelink(file); }} sx={{ color: 'info.main' }}>
            <SwapHorizRoundedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      )}
      {needsRename && onRename && (
        <Tooltip title={`Rename to start with #${file.orderNumber}`}>
          <IconButton size="small" onClick={handleRename} disabled={renaming} sx={{ color: 'text.secondary' }}>
            {renaming ? <CircularProgress size={11} /> : <DriveFileRenameOutlineRoundedIcon sx={{ fontSize: 15 }} />}
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────
function rowColors(file, checked) {
  const hasPrintJob = file.printJobNumber != null;
  const hasRealOrder = file.matched && !file.isDraft && !file.isTemporaryOrder;
  const isTempOrder = file.isTemporaryOrder;
  const isUnmatched = !file.matched && !file.isDraft;
  if (checked)      return { bg: 'primary.50',   bgHover: 'primary.100',   border: 'primary.main'  };
  if (hasPrintJob)  return { bg: '#f3e5f5',       bgHover: '#e1bee7',       border: '#ce93d8'       };
  if (hasRealOrder) return { bg: 'success.50',    bgHover: 'success.100',   border: 'success.200'   };
  if (isTempOrder)  return { bg: 'warning.50',    bgHover: 'warning.100',   border: 'warning.200'   };
  if (isUnmatched)  return { bg: 'warning.50',    bgHover: 'warning.100',   border: 'warning.200'   };
  return              { bg: 'transparent',        bgHover: 'action.hover',  border: 'divider'       };
}

function FileListRow({ file, checked, onToggle, onRename, onConfirm, onCreatePrintJob, onEditPrintJob, onRelink, viewOnly }) {
  const isUnmatched = !file.matched && !file.isDraft;
  const { bg, bgHover, border } = rowColors(file, checked);

  return (
    <Stack
      direction="row" alignItems="center" spacing={0.75}
      onClick={() => onToggle && onToggle(file.fileId)}
      sx={{
        py: 0.5, px: 0.75, borderRadius: 1.5,
        border: '1px solid',
        borderColor: border,
        bgcolor: bg,
        '&:hover': { bgcolor: bgHover },
        transition: 'background 0.12s',
        cursor: onToggle ? 'pointer' : 'default',
      }}
    >
      {onToggle && (
        <Checkbox
          size="small" checked={!!checked}
          onChange={() => onToggle(file.fileId)}
          onClick={(e) => e.stopPropagation()}
          sx={{ p: 0.2, flexShrink: 0 }}
        />
      )}

      <Box sx={{ flexShrink: 0 }}>
        {file.stageNumber === 9
          ? <LocalPrintshopRoundedIcon sx={{ fontSize: 13, color: 'error.400' }} />
          : file.stageNumber === 8
          ? <DoneAllRoundedIcon sx={{ fontSize: 13, color: 'success.500' }} />
          : isUnmatched
          ? <ErrorOutlineRoundedIcon sx={{ fontSize: 13, color: 'warning.600' }} />
          : <DesignServicesRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2" fontWeight={500}
          sx={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={file.fileName}
        >
          {file.fileName}
        </Typography>
        {file.isDraft && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>Tracking — no order yet</Typography>
        )}
        {isUnmatched && (
          <Typography variant="caption" color="warning.700" sx={{ fontSize: 10 }}>
            Order #{file.extractedOrderNumber || '?'} not found
          </Typography>
        )}
        {file.matched && !file.isDraft && file.orderStage && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>MIS: {file.orderStage}</Typography>
        )}
      </Box>

      <Stack direction="row" spacing={0.4} alignItems="center" sx={{ flexShrink: 0 }}>
        {file.stageLabel && <StageChip stageLabel={file.stageLabel} stageColor={file.stageColor} />}
        <StatusBadges file={file} />
        <FileActions file={file} onRename={onRename} onConfirm={onConfirm} onCreatePrintJob={onCreatePrintJob} onEditPrintJob={onEditPrintJob} onRelink={onRelink} viewOnly={viewOnly} />
      </Stack>
    </Stack>
  );
}

// ─── Card view ────────────────────────────────────────────────────────────────
function FileCard({ file, checked, onToggle, onRename, onConfirm, onCreatePrintJob, onEditPrintJob, onRelink, viewOnly }) {
  const isUnmatched = !file.matched && !file.isDraft;
  const { bg, border } = rowColors(file, checked);

  return (
    <Card
      variant="outlined"
      onClick={() => onToggle && onToggle(file.fileId)}
      sx={{
        height: '100%', display: 'flex', flexDirection: 'column',
        borderColor: border,
        bgcolor: bg === 'transparent' ? 'background.paper' : bg,
        '&:hover': { boxShadow: 1 },
        transition: 'box-shadow 0.15s, border-color 0.12s',
        cursor: onToggle ? 'pointer' : 'default',
      }}
    >
      <CardContent sx={{ flex: 1, pb: 0, pt: 0.75, px: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
          {onToggle && (
            <Checkbox
              size="small" checked={!!checked}
              onChange={() => onToggle(file.fileId)}
              onClick={(e) => e.stopPropagation()}
              sx={{ p: 0.2, flexShrink: 0, ml: -0.5 }}
            />
          )}
          {file.stageLabel && <StageChip stageLabel={file.stageLabel} stageColor={file.stageColor} />}
        </Stack>

        <Stack direction="row" spacing={0.5} alignItems="flex-start">
          <Box sx={{ flexShrink: 0, mt: 0.1 }}>
            {file.stageNumber === 9
              ? <LocalPrintshopRoundedIcon sx={{ fontSize: 13, color: 'error.400' }} />
              : file.stageNumber === 8
              ? <DoneAllRoundedIcon sx={{ fontSize: 13, color: 'success.500' }} />
              : isUnmatched
              ? <ErrorOutlineRoundedIcon sx={{ fontSize: 13, color: 'warning.600' }} />
              : <DesignServicesRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />}
          </Box>
          <Typography
            variant="body2" fontWeight={500}
            sx={{ fontSize: 11, wordBreak: 'break-word', lineHeight: 1.35 }}
            title={file.fileName}
          >
            {file.fileName}
          </Typography>
        </Stack>

        <Box sx={{ mt: 0.5 }}><StatusBadges file={file} /></Box>

        {file.isDraft && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25, fontSize: 10 }}>
            Tracking — no order yet
          </Typography>
        )}
        {isUnmatched && (
          <Typography variant="caption" color="warning.700" sx={{ display: 'block', mt: 0.25, fontSize: 10 }}>
            Order #{file.extractedOrderNumber || '?'} not found
          </Typography>
        )}
        {file.matched && !file.isDraft && file.orderStage && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25, fontSize: 10 }}>
            MIS: {file.orderStage}
          </Typography>
        )}
      </CardContent>

      {!viewOnly && (
        <CardActions sx={{ pt: 0, pb: 0.5, px: 0.75, justifyContent: 'flex-end', borderTop: '1px solid', borderColor: 'divider' }}>
          <FileActions file={file} onRename={onRename} onConfirm={onConfirm} onCreatePrintJob={onCreatePrintJob} onEditPrintJob={onEditPrintJob} onRelink={onRelink} viewOnly={viewOnly} />
        </CardActions>
      )}
    </Card>
  );
}

// ─── Stale draft alert ────────────────────────────────────────────────────────
function StaleDraftAlert({ staleLinks }) {
  const [open, setOpen] = useState(true);
  if (!staleLinks?.length || !open) return null;
  return (
    <Alert severity="warning" icon={<WarningAmberRoundedIcon fontSize="small" />} onClose={() => setOpen(false)} sx={{ mx: 1.5, mt: 1, fontSize: 12 }}>
      <AlertTitle sx={{ fontSize: 12, fontWeight: 700 }}>
        {staleLinks.length} draft file{staleLinks.length !== 1 ? 's' : ''} disappeared from Drive
      </AlertTitle>
      {staleLinks.map((l) => (
        <Typography key={l.driveFileId} variant="caption" sx={{ display: 'block', color: 'warning.900' }}>
          • {l.fileName || l.driveFileId}
        </Typography>
      ))}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        These files were tracked as drafts but are no longer visible in Drive — possibly deleted or moved unexpectedly.
      </Typography>
    </Alert>
  );
}

// ─── Confirm Final Dialog ─────────────────────────────────────────────────────
function ConfirmFinalDialog({ open, file, onClose, onSuccess }) {
  const [customer, setCustomer] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerInput, setCustomerInput] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [orderMode, setOrderMode] = useState('note');
  const [noteText, setNoteText] = useState('');
  const [items, setItems] = useState([{ itemName: '', qty: 1, rate: '', amount: '' }]);
  const [itemOptions, setItemOptions] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setCustomer(null); setCustomerInput(''); setMobileNumber('');
      setOrderMode('note'); setError('');
      setItems([{ itemName: '', qty: 1, rate: '', amount: '' }]);
      return;
    }
    setNoteText((file?.fileName || '').replace(/\.[^.]+$/, ''));
    setLoadingData(true);
    Promise.all([
      axios.get('/api/customers/GetCustomerList'),
      axios.get('/api/items/GetItemList'),
    ])
      .then(([custRes, itemRes]) => {
        setCustomers(custRes.data?.result || []);
        setItemOptions(itemRes.data?.result || []);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItemRow = () => setItems((prev) => [...prev, { itemName: '', qty: 1, rate: '', amount: '' }]);
  const removeItemRow = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, field, value) => {
    setItems((prev) => prev.map((row, idx) => {
      if (idx !== i) return row;
      const updated = { ...row, [field]: value };
      if (field === 'qty' || field === 'rate') {
        const qty = parseFloat(field === 'qty' ? value : row.qty) || 0;
        const rate = parseFloat(field === 'rate' ? value : row.rate) || 0;
        updated.amount = qty && rate ? String(qty * rate) : '';
      }
      return updated;
    }));
  };

  const total = items.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const handleSubmit = async () => {
    if (!customer) return;
    const isDetailed = orderMode === 'items';
    if (!isDetailed && !noteText.trim()) return;
    if (isDetailed && !items.some((r) => r.itemName.trim())) return;
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/confirm-final', {
        fileId: file.fileId, fileName: file.fileName,
        customerUuid: customer.Customer_uuid,
        itemDetails: isDetailed ? '' : noteText.trim(),
        mobileNumber: mobileNumber.trim(),
        orderMode: isDetailed ? 'items' : 'note',
        items: isDetailed
          ? items.map((r) => ({ itemName: r.itemName, qty: parseFloat(r.qty) || 1, rate: parseFloat(r.rate) || 0, amount: parseFloat(r.amount) || 0 }))
          : [],
      });
      onSuccess(`Order #${res.data.orderNumber} created — "${file.fileName}" confirmed`, 'success');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to confirm');
    } finally { setSubmitting(false); }
  };

  const filteredCustomers = customers.filter((c) => {
    if (!customerInput) return true;
    const q = customerInput.toLowerCase();
    return c.Customer_name?.toLowerCase().includes(q) || c.Mobile?.toLowerCase().includes(q);
  });

  const canSubmit = customer && !submitting && (
    orderMode === 'note' ? noteText.trim() : items.some((r) => r.itemName.trim())
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Confirm Final File → Create Order</Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>
          File: <strong>{file?.fileName}</strong>
        </Typography>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <Autocomplete
              sx={{ flex: 1 }}
              options={filteredCustomers} value={customer}
              onChange={(_, v) => { setCustomer(v); if (v?.Mobile) setMobileNumber(v.Mobile); }}
              inputValue={customerInput} onInputChange={(_, v) => setCustomerInput(v)}
              getOptionLabel={(c) => `${c.Customer_name}${c.Mobile ? ` — ${c.Mobile}` : ''}`}
              isOptionEqualToValue={(a, b) => a.Customer_uuid === b.Customer_uuid}
              loading={loadingData} disabled={submitting}
              renderInput={(params) => (
                <TextField {...params} label="Customer *" placeholder="Search by name or mobile…" size="small"
                  InputProps={{ ...params.InputProps, endAdornment: <>{loadingData ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
                />
              )}
            />
            <TextField label="Mobile Number" value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              size="small" disabled={submitting} sx={{ width: 160 }}
            />
          </Stack>

          {/* Order type toggle */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>Order type:</Typography>
            <Button size="small" variant={orderMode === 'note' ? 'contained' : 'outlined'}
              onClick={() => setOrderMode('note')} disabled={submitting}
              sx={{ fontSize: 11, py: 0.3, px: 1, minHeight: 26 }}
            >Simple Note</Button>
            <Button size="small" variant={orderMode === 'items' ? 'contained' : 'outlined'}
              onClick={() => setOrderMode('items')} disabled={submitting}
              sx={{ fontSize: 11, py: 0.3, px: 1, minHeight: 26 }}
            >Detailed Items</Button>
          </Stack>

          {orderMode === 'note' ? (
            <TextField label="Description / Item Details *"
              value={noteText} onChange={(e) => setNoteText(e.target.value)}
              size="small" disabled={submitting} multiline minRows={2}
              placeholder="e.g. Flex Banner 4x3, Visiting Card 100pcs"
            />
          ) : (
            <Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Item Name *</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 70 }}>Qty</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 90 }}>Rate (₹)</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 90 }}>Amount (₹)</TableCell>
                    <TableCell sx={{ width: 32 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          options={itemOptions}
                          value={row.itemName}
                          onChange={(_, v) => updateItem(i, 'itemName', typeof v === 'string' ? v : v?.Item_name || '')}
                          onInputChange={(_, v) => updateItem(i, 'itemName', v)}
                          getOptionLabel={(o) => (typeof o === 'string' ? o : o?.Item_name || '')}
                          disabled={submitting}
                          renderInput={(params) => (
                            <TextField {...params} size="small" placeholder="Item name…"
                              inputProps={{ ...params.inputProps, style: { fontSize: 11, padding: '3px 6px' } }}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={row.qty}
                          onChange={(e) => updateItem(i, 'qty', e.target.value)}
                          disabled={submitting} inputProps={{ min: 1, style: { fontSize: 11, padding: '3px 6px' } }}
                          sx={{ width: 60 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={row.rate}
                          onChange={(e) => updateItem(i, 'rate', e.target.value)}
                          disabled={submitting} inputProps={{ min: 0, style: { fontSize: 11, padding: '3px 6px' } }}
                          sx={{ width: 80 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={row.amount}
                          onChange={(e) => updateItem(i, 'amount', e.target.value)}
                          disabled={submitting} inputProps={{ min: 0, style: { fontSize: 11, padding: '3px 6px' } }}
                          sx={{ width: 80 }}
                        />
                      </TableCell>
                      <TableCell sx={{ p: 0.25 }}>
                        {items.length > 1 && (
                          <IconButton size="small" onClick={() => removeItemRow(i)} disabled={submitting} sx={{ color: 'error.main', p: 0.25 }}>
                            <DeleteRoundedIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} sx={{ fontSize: 12, fontWeight: 700, textAlign: 'right', borderBottom: 'none' }}>Total</TableCell>
                    <TableCell sx={{ fontSize: 12, fontWeight: 700, borderBottom: 'none' }}>₹{total.toFixed(2)}</TableCell>
                    <TableCell sx={{ borderBottom: 'none' }} />
                  </TableRow>
                </TableBody>
              </Table>
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={addItemRow} disabled={submitting}
                sx={{ mt: 0.5, fontSize: 11 }}>
                Add Item
              </Button>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" color="success" onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={14} /> : <AssignmentTurnedInRoundedIcon />}
        >
          Confirm & Create Order
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Edit Print Job Dialog ────────────────────────────────────────────────────
function EditPrintJobDialog({ open, file, onClose, onSuccess }) {
  const [vendor, setVendor] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) { setVendor(null); setAmount(''); setNotes(''); setError(''); return; }
    setLoadingVendors(true);
    axios.get('/api/vendors/masters', { params: { activeOnly: 'true' } })
      .then((r) => setVendors(r.data?.result || []))
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, [open]);

  const handleSubmit = async () => {
    if (!vendor || !file?.printJobId) return;
    setSubmitting(true); setError('');
    try {
      await axios.post('/api/design-files/update-print-job', {
        printJobId: file.printJobId,
        vendorUuid: vendor.Vendor_uuid,
        amount: Number(amount) || 0,
        notes,
      });
      onSuccess(`${pjLabel(file.printJobNumber)} updated`, 'success');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to update');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>
            Update {file?.printJobNumber != null ? pjLabel(file.printJobNumber) : 'Print Job'}
          </Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>{file?.fileName}</Typography>
        <Stack spacing={2}>
          <Autocomplete
            options={vendors} value={vendor} onChange={(_, v) => setVendor(v)}
            getOptionLabel={(v) => v.Vendor_name}
            isOptionEqualToValue={(a, b) => a.Vendor_uuid === b.Vendor_uuid}
            loading={loadingVendors} disabled={submitting}
            renderInput={(params) => (
              <TextField {...params} label="Printer / Vendor *" size="small"
                InputProps={{ ...params.InputProps, endAdornment: <>{loadingVendors ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
              />
            )}
          />
          <TextField label="Amount (₹)" type="number" value={amount}
            onChange={(e) => setAmount(e.target.value)} size="small" disabled={submitting}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            inputProps={{ min: 0 }}
          />
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}
            size="small" disabled={submitting} multiline minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit}
          disabled={!vendor || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <ReceiptLongRoundedIcon />}
        >
          Update Print Job
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Link Order Dialog ────────────────────────────────────────────────────────
function LinkOrderDialog({ open, selectedFiles, onClose, onSuccess }) {
  const [order, setOrder] = useState(null);
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => { if (!open) { setOrder(null); setOptions([]); setInputValue(''); setError(''); } }, [open]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get('/api/design-files/orders/search', { params: { q: inputValue } });
        setOptions(res.data?.result || []);
      } catch { setOptions([]); } finally { setSearching(false); }
    }, 300);
  }, [inputValue]);

  const handleQuickCreate = async () => {
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/auto-temp-orders', {
        files: selectedFiles.map((f) => ({ fileId: f.fileId, fileName: f.fileName, stageNumber: f.stageNumber, stageLabel: f.stageLabel })),
      });
      const { created = 0, renamed = 0, failed = 0 } = res.data || {};
      if (failed > 0) {
        onSuccess(`${created} TEMP order${created !== 1 ? 's' : ''} created, ${renamed} renamed, ${failed} failed`, 'warning');
      } else {
        onSuccess(`${created} TEMP order${created !== 1 ? 's' : ''} created and renamed in Drive`, 'success');
      }
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create temp orders');
    } finally { setSubmitting(false); }
  };

  const handleSubmit = async () => {
    if (!order) return;
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/link-order', {
        fileIds: selectedFiles.map((f) => f.fileId),
        orderUuid: order.Order_uuid,
        files: selectedFiles.map((f) => ({ fileId: f.fileId, fileName: f.fileName, stageNumber: f.stageNumber, stageLabel: f.stageLabel })),
      });
      const renameResults = res.data?.renameResults || {};
      const renamed = Object.values(renameResults).filter((r) => r.status === 'renamed').length;
      const failed = Object.values(renameResults).filter((r) => r.status === 'failed');
      const n = selectedFiles.length;
      if (failed.length > 0) {
        onSuccess(`${n} file${n !== 1 ? 's' : ''} linked to Order #${order.Order_Number} — ${failed.length} rename failed.`, 'warning');
      } else if (renamed > 0) {
        onSuccess(`${n} file${n !== 1 ? 's' : ''} linked and renamed to Order #${order.Order_Number}`, 'success');
      } else {
        onSuccess(`${n} file${n !== 1 ? 's' : ''} linked to Order #${order.Order_Number}`, 'success');
      }
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to link');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Link to Order</Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
        </Typography>
        <Autocomplete
          options={options} value={order} onChange={(_, v) => setOrder(v)}
          inputValue={inputValue} onInputChange={(_, v) => setInputValue(v)}
          getOptionLabel={(o) => `#${o.Order_Number}${o.isTemporary ? ' [TEMP]' : ''}${o.customerName ? ` — ${o.customerName}` : ''} — ${o.orderNote || '(no note)'}`}
          isOptionEqualToValue={(a, b) => a.Order_uuid === b.Order_uuid}
          loading={searching} disabled={submitting}
          renderInput={(params) => (
            <TextField {...params} label="Search Order" placeholder="Type order number or description…" size="small"
              InputProps={{ ...params.InputProps, endAdornment: <>{searching ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
            />
          )}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="outlined" color="warning" onClick={handleQuickCreate}
          disabled={selectedFiles.length === 0 || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <AutoFixHighRoundedIcon />}
          sx={{ mr: 'auto', order: -1 }}
        >
          Quick Create {selectedFiles.length > 0 ? selectedFiles.length : ''} & Rename
        </Button>
        <Button variant="contained" onClick={handleSubmit}
          disabled={!order || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <LinkRoundedIcon />}
        >
          Link to Order
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Auto Temp Dialog ─────────────────────────────────────────────────────────
function AutoTempDialog({ open, files, onClose, onSuccess }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { if (!open) { setResult(null); setError(''); } }, [open]);

  const handleRun = async () => {
    setRunning(true); setError('');
    try {
      const res = await axios.post('/api/design-files/auto-temp-orders', {
        files: files.map((f) => ({ fileId: f.fileId, fileName: f.fileName, stageNumber: f.stageNumber, stageLabel: f.stageLabel })),
      });
      setResult(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed');
    } finally { setRunning(false); }
  };

  const handleDone = () => {
    if (result?.created > 0) onSuccess(`Created ${result.created} TEMP order${result.created !== 1 ? 's' : ''} and renamed Drive files`, 'success');
    onClose();
  };

  return (
    <Dialog open={open} onClose={result ? handleDone : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Create Temp Orders</Typography>
          <IconButton size="small" onClick={result ? handleDone : onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!result ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              This will create a TEMP placeholder order for each of the <strong>{files.length}</strong> unmatched file{files.length !== 1 ? 's' : ''} and rename them in Drive.
            </Typography>
            <Stack spacing={0.4}>
              {files.map((f) => (
                <Typography key={f.fileId} variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>• {f.fileName}</Typography>
              ))}
            </Stack>
          </>
        ) : (
          <>
            <Alert severity={result.failed > 0 ? 'warning' : 'success'} sx={{ mb: 1.5 }}>
              {result.created} order{result.created !== 1 ? 's' : ''} created
              {result.renamed != null ? `, ${result.renamed} file${result.renamed !== 1 ? 's' : ''} renamed` : ''}
              {result.failed > 0 ? `, ${result.failed} failed` : ''}.
            </Alert>
            {result.results?.map((r, i) => (
              <Typography key={i} variant="caption" sx={{ display: 'block', color: r.status === 'created' ? 'success.main' : 'error.main' }}>
                {r.status === 'created' ? '✓' : '✗'} {r.fileName}{r.status === 'created' ? ` → Order #${r.orderNumber}` : ` — ${r.error || 'failed'}`}
              </Typography>
            ))}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {!result ? (
          <>
            <Button onClick={onClose} disabled={running}>Cancel</Button>
            <Button variant="contained" color="warning" onClick={handleRun} disabled={running || files.length === 0}
              startIcon={running ? <CircularProgress size={14} /> : <AutoFixHighRoundedIcon />}
            >
              Create {files.length} Temp Order{files.length !== 1 ? 's' : ''}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={handleDone}>Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ─── Print Job Dialog ─────────────────────────────────────────────────────────
function PrintJobDialog({ open, selectedFiles, onClose, onSuccess, validateFinal = false }) {
  const [order, setOrder] = useState(null);
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [vendor, setVendor] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [rows, setRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hasPostPrint, setHasPostPrint] = useState(false);
  const [validation, setValidation] = useState({});
  const [validating, setValidating] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!open) { setOrder(null); setOptions([]); setInputValue(''); setVendor(null); setRows([]); setError(''); setHasPostPrint(false); setValidation({}); setValidating(false); return; }
    setRows(selectedFiles.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      itemName: (f.fileName || '').replace(/\.[^.]+$/, ''),
      qty: 1, rate: '', amount: '',
    })));
    setLoadingVendors(true);
    Promise.all([
      axios.get('/api/vendors/masters', { params: { activeOnly: 'true' } }),
      axios.get('/api/items/GetItemList'),
    ])
      .then(([vRes, iRes]) => {
        setVendors(vRes.data?.result || []);
        setItemOptions(iRes.data?.result || []);
      })
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get('/api/design-files/orders/search', { params: { q: inputValue } });
        setOptions(res.data?.result || []);
      } catch { setOptions([]); } finally { setSearching(false); }
    }, 300);
  }, [inputValue]);

  useEffect(() => {
    if (!open || !validateFinal) return;
    const toCheck = selectedFiles.filter((f) => f.orderUuid);
    if (!toCheck.length) return;
    setValidating(true);
    axios.post('/api/design-files/validate-print-jobs', {
      files: toCheck.map((f) => ({ fileId: f.fileId, orderUuid: f.orderUuid, orderNumber: f.orderNumber })),
    }).then((res) => {
      const map = {};
      (res.data?.results || []).forEach((r) => { map[r.fileId] = r; });
      setValidation(map);
    }).catch(() => {}).finally(() => setValidating(false));
  }, [open, validateFinal, selectedFiles]);

  const updateRow = (fileId, field, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.fileId !== fileId) return r;
      const updated = { ...r, [field]: value };
      if (field === 'qty' || field === 'rate') {
        const qty = parseFloat(field === 'qty' ? value : r.qty) || 0;
        const rate = parseFloat(field === 'rate' ? value : r.rate) || 0;
        updated.amount = qty && rate ? String(qty * rate) : '';
      }
      return updated;
    }));
  };

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const handleSubmit = async () => {
    if (!vendor) return;
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/create-print-job', {
        orderUuid: order?.Order_uuid || undefined,
        vendorUuid: vendor.Vendor_uuid,
        items: rows.map((r) => ({
          fileId: r.fileId, fileName: r.fileName, itemName: r.itemName || r.fileName,
          qty: parseFloat(r.qty) || 1,
          rate: parseFloat(r.rate) || 0,
          amount: parseFloat(r.amount) || 0,
        })),
        totalAmount: total,
        hasPostPrint,
      });
      const pjNum = res.data?.printJobNumber;
      onSuccess(`Print job ${pjNum != null ? pjLabel(pjNum) : ''} created for ${rows.length} file${rows.length !== 1 ? 's' : ''}`, 'success');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create print job');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Create Print Bill</Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {validateFinal && Object.keys(validation).length > 0 && (
          (() => {
            const invalid = selectedFiles.filter((f) => validation[f.fileId] && !validation[f.fileId].valid);
            if (!invalid.length) return null;
            return (
              <Alert severity="warning" sx={{ mb: 2, fontSize: 12 }}>
                <strong>Missing confirmed Final design:</strong>
                {invalid.map((f) => (
                  <Typography key={f.fileId} variant="caption" sx={{ display: 'block', mt: 0.3 }}>
                    • {validation[f.fileId]?.reason}
                  </Typography>
                ))}
              </Alert>
            );
          })()
        )}
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <Autocomplete
              sx={{ flex: 1 }}
              options={options} value={order} onChange={(_, v) => setOrder(v)}
              inputValue={inputValue} onInputChange={(_, v) => setInputValue(v)}
              getOptionLabel={(o) => `#${o.Order_Number}${o.isTemporary ? ' [TEMP]' : ''}${o.customerName ? ` — ${o.customerName}` : ''} — ${o.orderNote || '(no note)'}`}
              isOptionEqualToValue={(a, b) => a.Order_uuid === b.Order_uuid}
              loading={searching} disabled={submitting}
              renderInput={(params) => (
                <TextField {...params} label="Link to Order (optional)" placeholder="Search order…" size="small"
                  InputProps={{ ...params.InputProps, endAdornment: <>{searching ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
                />
              )}
            />
            <Autocomplete
              sx={{ flex: 1 }}
              options={vendors} value={vendor} onChange={(_, v) => setVendor(v)}
              getOptionLabel={(v) => v.Vendor_name}
              isOptionEqualToValue={(a, b) => a.Vendor_uuid === b.Vendor_uuid}
              loading={loadingVendors} disabled={submitting}
              renderInput={(params) => (
                <TextField {...params} label="Printer / Vendor *" size="small"
                  InputProps={{ ...params.InputProps, endAdornment: <>{loadingVendors ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
                />
              )}
            />
          </Stack>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 130 }}>File</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Item Name</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 65 }}>Qty</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 85 }}>Rate (₹)</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 85 }}>Amount (₹)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.fileId}>
                  <TableCell sx={{ fontSize: 10, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary' }} title={r.fileName}>
                    {r.fileName}
                  </TableCell>
                  <TableCell>
                    <Autocomplete
                      freeSolo
                      options={itemOptions}
                      value={r.itemName}
                      onChange={(_, v) => updateRow(r.fileId, 'itemName', typeof v === 'string' ? v : v?.Item_name || '')}
                      onInputChange={(_, v) => updateRow(r.fileId, 'itemName', v)}
                      getOptionLabel={(o) => (typeof o === 'string' ? o : o?.Item_name || '')}
                      disabled={submitting}
                      renderInput={(params) => (
                        <TextField {...params} size="small" placeholder="Item name…"
                          inputProps={{ ...params.inputProps, style: { fontSize: 11, padding: '3px 6px' } }}
                          sx={{ minWidth: 120 }}
                        />
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={r.qty}
                      onChange={(e) => updateRow(r.fileId, 'qty', e.target.value)}
                      disabled={submitting} inputProps={{ min: 1, style: { fontSize: 11, padding: '3px 6px' } }}
                      sx={{ width: 55 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={r.rate}
                      onChange={(e) => updateRow(r.fileId, 'rate', e.target.value)}
                      disabled={submitting} inputProps={{ min: 0, style: { fontSize: 11, padding: '3px 6px' } }}
                      sx={{ width: 75 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={r.amount}
                      onChange={(e) => updateRow(r.fileId, 'amount', e.target.value)}
                      disabled={submitting} inputProps={{ min: 0, style: { fontSize: 11, padding: '3px 6px' } }}
                      sx={{ width: 75 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} sx={{ fontSize: 12, fontWeight: 700, textAlign: 'right', borderBottom: 'none' }}>Total</TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 700, borderBottom: 'none' }}>₹{total.toFixed(2)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={hasPostPrint}
              onChange={(e) => setHasPostPrint(e.target.checked)}
              disabled={submitting}
              size="small"
            />
          }
          label={<Typography variant="body2">Requires Post-Print Task (lamination / cutting / packing)</Typography>}
        />
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleSubmit}
            disabled={!vendor || submitting || validating || (validateFinal && Object.values(validation).some((v) => !v.valid))}
            startIcon={submitting || validating ? <CircularProgress size={14} /> : <ReceiptLongRoundedIcon />}
          >
            Create Print Bill
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

// ─── Archive panel ────────────────────────────────────────────────────────────
function ArchiveDateSection({ section, onConfirm, onCreatePrintJob, onEditPrintJob, selectedIds, onToggle, onRelink }) {
  const [expanded, setExpanded] = useState(true);
  if (!section.files?.length) return null;
  const isActionable = section.stageNumber === 8 || section.stageNumber === 9;

  return (
    <Box>
      <Stack
        direction="row" alignItems="center" spacing={0.75}
        onClick={() => setExpanded((v) => !v)}
        sx={{ py: 0.4, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1, px: 0.5 }}
      >
        {section.stageLabel && <StageChip stageLabel={section.stageLabel} stageColor={section.stageColor} />}
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, fontSize: 11 }}>
          {section.sectionName} — {section.files.length} file{section.files.length !== 1 ? 's' : ''}
        </Typography>
        {expanded ? <ExpandLessRoundedIcon sx={{ fontSize: 13 }} /> : <ExpandMoreRoundedIcon sx={{ fontSize: 13 }} />}
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={0.35} sx={{ pl: 1, mt: 0.35 }}>
          {section.files.map((file) => (
            <FileListRow
              key={file.fileId}
              file={file}
              viewOnly={!isActionable}
              checked={isActionable && selectedIds?.has(file.fileId)}
              onToggle={isActionable && onToggle ? () => onToggle(file) : undefined}
              onConfirm={section.stageNumber === 8 ? onConfirm : undefined}
              onCreatePrintJob={section.stageNumber === 9 && file.printJobNumber == null ? onCreatePrintJob : undefined}
              onEditPrintJob={section.stageNumber === 9 && file.printJobId ? onEditPrintJob : undefined}
              onRelink={isActionable ? onRelink : undefined}
            />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

function ArchiveDateGroup({ dateGroup, onConfirm, onCreatePrintJob, onEditPrintJob, selectedIds, onToggle, onRelink }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <Box sx={{ mb: 0.75 }}>
      <Stack
        direction="row" alignItems="center" spacing={1}
        onClick={() => setExpanded((v) => !v)}
        sx={{ py: 0.6, px: 1.5, cursor: 'pointer', bgcolor: 'action.hover', borderRadius: 1.5, '&:hover': { bgcolor: 'action.selected' } }}
      >
        {expanded ? <ExpandLessRoundedIcon sx={{ fontSize: 14, color: 'text.secondary' }} /> : <ExpandMoreRoundedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, fontSize: 12 }}>{dateGroup.dateName}</Typography>
        <Chip label={`${dateGroup.fileCount} file${dateGroup.fileCount !== 1 ? 's' : ''}`} size="small"
          sx={{ fontSize: 10, height: 18, bgcolor: 'background.paper', '& .MuiChip-label': { px: 0.75 } }} />
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={0.6} sx={{ px: 1, pt: 0.6 }}>
          {dateGroup.sections.map((section, i) => (
            <ArchiveDateSection key={i} section={section}
              onConfirm={onConfirm} onCreatePrintJob={onCreatePrintJob} onEditPrintJob={onEditPrintJob}
              selectedIds={selectedIds} onToggle={onToggle} onRelink={onRelink}
            />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

function ArchivePanel({ onConfirm, onCreatePrintJob, onEditPrintJob }) {
  const [archiveData, setArchiveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Selection state — map of fileId → full file object
  const [selectedMap, setSelectedMap] = useState({});
  // Archive-internal dialogs
  const [relinkFile, setRelinkFile] = useState(null);
  const [archiveLinkOpen, setArchiveLinkOpen] = useState(false);
  const [archivePrintJobOpen, setArchivePrintJobOpen] = useState(false);
  const [archiveTempOpen, setArchiveTempOpen] = useState(false);
  const [archiveToast, setArchiveToast] = useState(null);

  const loadArchive = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get('/api/design-files/scan-archive');
      setArchiveData(res.data);
      setLoaded(true);
      setSelectedMap({});
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load archive.');
    } finally { setLoading(false); }
  }, []);

  const toggleSelect = useCallback((file) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[file.fileId]) delete next[file.fileId];
      else next[file.fileId] = file;
      return next;
    });
  }, []);

  const selectedFiles = Object.values(selectedMap);
  const selectedIds = new Set(Object.keys(selectedMap));

  const allFiles = archiveData?.dates?.flatMap((d) => d.sections.flatMap((s) => s.files)) || [];
  const unmatchedFiles = allFiles.filter((f) => !f.matched && !f.isDraft);

  const exportArchiveCSV = (selectedOnly = false) => {
    const rows = selectedOnly ? selectedFiles : allFiles;
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(buildCSV(rows), `archive-${dateStr}.csv`, 'text/csv');
  };

  if (!loaded && !loading) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Scan the month archive to find historical files.</Typography>
        <Button size="small" variant="outlined" startIcon={<ArchiveRoundedIcon />} onClick={loadArchive}>Load Archive</Button>
      </Box>
    );
  }

  if (loading) return <Box sx={{ py: 2 }}><LinearProgress sx={{ height: 2 }} /></Box>;

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 1.5 }} action={<Button size="small" onClick={loadArchive}>Retry</Button>}>{error}</Alert>
    );
  }

  const { monthFolderName, dates = [], summary } = archiveData || {};

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Archive header */}
      <Stack direction="row" alignItems="center" sx={{ px: 1.5, pb: 0.75, flexShrink: 0 }} spacing={1} flexWrap="wrap">
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          <strong>{monthFolderName || '—'}</strong>
          {summary && ` · ${summary.total} files · ${summary.unmatched} unmatched`}
        </Typography>
        {unmatchedFiles.length > 0 && (
          <Button size="small" variant="outlined" color="warning"
            startIcon={<AutoFixHighRoundedIcon sx={{ fontSize: '13px !important' }} />}
            onClick={() => setArchiveTempOpen(true)}
            sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
          >
            Create Temp ({unmatchedFiles.length})
          </Button>
        )}
        {allFiles.length > 0 && (
          <>
            <Tooltip title="Export all to CSV">
              <IconButton size="small" onClick={() => exportArchiveCSV(false)} sx={{ p: 0.4, color: 'text.secondary' }}>
                <FileDownloadRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Print archive list">
              <IconButton size="small" onClick={() => openPrintWindow(allFiles, 'Archive')} sx={{ p: 0.4, color: 'text.secondary' }}>
                <PrintRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title="Refresh archive">
          <IconButton size="small" onClick={loadArchive} disabled={loading} sx={{ p: 0.4 }}>
            <RefreshRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Date groups */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {dates.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No files found in archive folder.</Typography>
          </Box>
        ) : (
          <Stack spacing={0.5} sx={{ px: 1, pb: 1 }}>
            {dates.map((dateGroup) => (
              <ArchiveDateGroup
                key={dateGroup.dateFolderId}
                dateGroup={dateGroup}
                onConfirm={onConfirm}
                onCreatePrintJob={onCreatePrintJob}
                onEditPrintJob={onEditPrintJob}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                onRelink={(file) => setRelinkFile(file)}
              />
            ))}
          </Stack>
        )}
      </Box>

      {/* Selection action bar */}
      {selectedFiles.length > 0 && (
        <>
          <Divider />
          <Stack
            direction="row" alignItems="center" spacing={0.75}
            sx={{ px: 1.5, py: 0.65, bgcolor: 'primary.50', flexWrap: 'wrap', gap: 0.75, flexShrink: 0 }}
          >
            <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ flex: 1, fontSize: 12 }}>
              {selectedFiles.length} selected
            </Typography>
            <Button size="small" variant="outlined"
              startIcon={<LinkRoundedIcon sx={{ fontSize: '13px !important' }} />}
              onClick={() => setArchiveLinkOpen(true)}
              sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
            >Link to Order</Button>
            {selectedFiles.some((f) => f.stageNumber === 9) && (
              <Button size="small" variant="outlined" color="error"
                startIcon={<ReceiptLongRoundedIcon sx={{ fontSize: '13px !important' }} />}
                onClick={() => setArchivePrintJobOpen(true)}
                sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
              >Create Print Bill</Button>
            )}
            <Tooltip title="Export selected to CSV">
              <IconButton size="small" onClick={() => exportArchiveCSV(true)} sx={{ p: 0.35, color: 'primary.main' }}>
                <FileDownloadRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Print selected">
              <IconButton size="small" onClick={() => openPrintWindow(selectedFiles, 'Archive')} sx={{ p: 0.35, color: 'primary.main' }}>
                <PrintRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => setSelectedMap({})} sx={{ p: 0.35 }}>
              <CloseRoundedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Stack>
        </>
      )}

      {/* Archive-internal dialogs */}
      <LinkOrderDialog
        open={archiveLinkOpen || !!relinkFile}
        selectedFiles={relinkFile ? [relinkFile] : selectedFiles}
        onClose={() => { setArchiveLinkOpen(false); setRelinkFile(null); }}
        onSuccess={(msg, severity = 'success') => {
          setArchiveToast({ message: msg, severity });
          setArchiveLinkOpen(false); setRelinkFile(null); setSelectedMap({});
          loadArchive();
        }}
      />
      <AutoTempDialog
        open={archiveTempOpen} files={unmatchedFiles}
        onClose={() => setArchiveTempOpen(false)}
        onSuccess={(msg, severity = 'success') => {
          setArchiveToast({ message: msg, severity });
          setArchiveTempOpen(false); loadArchive();
        }}
      />
      <PrintJobDialog
        open={archivePrintJobOpen}
        selectedFiles={selectedFiles.filter((f) => f.stageNumber === 9)}
        onClose={() => setArchivePrintJobOpen(false)}
        onSuccess={(msg, severity = 'success') => {
          setArchiveToast({ message: msg, severity });
          setArchivePrintJobOpen(false); setSelectedMap({}); loadArchive();
        }}
      />
      <Snackbar
        open={!!archiveToast} autoHideDuration={archiveToast?.severity === 'error' ? 7000 : 4000}
        onClose={() => setArchiveToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setArchiveToast(null)} severity={archiveToast?.severity || 'success'} variant="filled" sx={{ width: '100%', fontSize: 13 }}>
          {archiveToast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────
export default function DesignFilesWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [configMissing, setConfigMissing] = useState(false);
  const [archiveConfigured, setArchiveConfigured] = useState(false);
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('df_view') || 'list'; } catch { return 'list'; }
  });
  const [confirmFile, setConfirmFile] = useState(null);
  const [editPrintJobFile, setEditPrintJobFile] = useState(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [relinkFile, setRelinkFile] = useState(null);
  const [autoTempOpen, setAutoTempOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [toast, setToast] = useState(null);

  const setView = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem('df_view', mode); } catch {}
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const cfgRes = await axios.get('/api/design-files/config-check');
      if (!cfgRes.data?.configured) { setConfigMissing(true); return; }
      setArchiveConfigured(!!cfgRes.data?.archiveConfigured);
      const res = await axios.get('/api/design-files/scan');
      setData(res.data);
      setSelectedIds(new Set());

      const allFiles = res.data?.files || [];
      const stage1to7 = allFiles.filter((f) => f.stageNumber >= 1 && f.stageNumber <= 7);
      if (stage1to7.length) {
        axios.post('/api/design-files/auto-scan-link', {
          files: stage1to7.map((f) => ({ fileId: f.fileId, fileName: f.fileName, stageNumber: f.stageNumber, stageLabel: f.stageLabel })),
        }).catch(() => {});
      }
      const printingWithoutJob = allFiles.filter((f) => f.stageNumber === 9 && !f.printJobId);
      if (printingWithoutJob.length) {
        axios.post('/api/design-files/auto-print-job', {
          files: printingWithoutJob.map((f) => ({ fileId: f.fileId, fileName: f.fileName, orderUuid: f.orderUuid || null, orderNumber: f.orderNumber || null, stageNumber: f.stageNumber })),
        }).catch(() => {});
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '';
      if (err?.response?.data?.reconnectRequired) { setReconnectRequired(true); return; }
      if (err?.response?.status === 400) { setConfigMissing(true); return; }
      setError(msg || 'Could not load Drive files.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreatePrintJob = useCallback(async (file) => {
    try {
      const res = await axios.post('/api/design-files/auto-print-job', {
        files: [{
          fileId: file.fileId,
          fileName: file.fileName,
          orderUuid: file.orderUuid || null,
          orderNumber: file.orderNumber || null,
          stageNumber: file.stageNumber,
        }],
      });
      const job = res.data?.jobs?.[0];
      if (job) {
        setToast({ message: `Print job ${pjLabel(job.printJobNumber)} created`, severity: 'success' });
        load();
      } else {
        setToast({ message: 'Print job already exists for this file', severity: 'info' });
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.message || err.message || 'Failed to create print job', severity: 'error' });
    }
  }, [load]);

  const handleRename = useCallback(async (file) => {
    try {
      const res = await axios.post('/api/design-files/rename-file', {
        fileId: file.fileId, fileName: file.fileName, orderNumber: file.orderNumber,
      });
      if (res.data?.status === 'renamed') {
        setToast({ message: `Renamed to "${res.data.newName}"`, severity: 'success' });
        load();
      } else if (res.data?.status === 'skipped') {
        setToast({ message: res.data.message || 'Filename already correct', severity: 'info' });
      } else {
        setToast({ message: res.data?.message || 'Rename failed — close the file in CorelDraw and retry', severity: 'warning' });
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.message || err.message || 'Rename failed', severity: 'error' });
    }
  }, [load]);

  if (configMissing) {
    return (
      <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <FolderOpenRoundedIcon color="action" sx={{ mt: 0.2 }} />
          <Box>
            <Typography variant="subtitle2" fontWeight={600}>Design Files Tracker</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Add <code>DRIVE_DAILY_FOLDER_ID</code> to your Render environment variables.
            </Typography>
          </Box>
        </Stack>
      </Box>
    );
  }

  if (reconnectRequired) {
    return (
      <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'warning.300', p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ErrorOutlineRoundedIcon color="warning" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>Google Drive disconnected</Typography>
            <Typography variant="body2" color="text.secondary">Reconnect to track design files.</Typography>
          </Box>
          <Button size="small" variant="outlined" color="warning" onClick={() => window.open('/api/google-drive/connect', '_blank')}>
            Reconnect
          </Button>
        </Stack>
      </Box>
    );
  }

  const files = data?.files || [];
  const staleLinks = data?.staleLinks || [];
  const summary = data?.summary;

  const visibleTabs = TABS.filter((t) => t.key !== 'archive' || archiveConfigured);
  const activeTabDef = TABS.find((t) => t.key === activeTab) || TABS[0];
  const filteredFiles = activeTabDef.stageFilter ? files.filter((f) => activeTabDef.stageFilter(f.stageNumber)) : [];
  const selectedFiles = filteredFiles.filter((f) => selectedIds.has(f.fileId));
  const canSelect = !activeTabDef.viewOnly && activeTab !== 'archive';
  const unmatchedInView = filteredFiles.filter((f) => !f.matched && !f.isDraft);

  function tabCount(tab) {
    if (!tab.stageFilter || !files.length) return 0;
    return files.filter((f) => tab.stageFilter(f.stageNumber)).length;
  }

  const exportCSV = (selectedOnly = false) => {
    const rows = selectedOnly ? selectedFiles : filteredFiles;
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(buildCSV(rows), `design-files-${activeTab}-${dateStr}.csv`, 'text/csv');
  };

  const handlePrint = () => openPrintWindow(filteredFiles, activeTabDef.label);

  return (
    <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden', display: 'flex', minHeight: 500, maxHeight: 640 }}>

      {/* ── Left sidebar ── */}
      <Box sx={{ width: 200, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', bgcolor: 'grey.50' }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
          <FolderOpenRoundedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
          <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 12, flex: 1 }}>Design Files</Typography>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={loading} sx={{ p: 0.25 }}>
              {loading ? <CircularProgress size={12} /> : <RefreshRoundedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const count = tab.key !== 'archive' ? tabCount(tab) : null;
            const isActive = activeTab === tab.key;
            return (
              <Stack
                key={tab.key}
                direction="row" alignItems="center" spacing={1}
                onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()); }}
                sx={{
                  px: 1.5, py: 0.85, cursor: 'pointer',
                  borderLeft: '3px solid',
                  borderLeftColor: isActive ? `${tab.color}.main` : 'transparent',
                  bgcolor: isActive ? `${tab.color}.50` : 'transparent',
                  '&:hover': { bgcolor: isActive ? `${tab.color}.50` : 'action.hover' },
                  transition: 'background 0.1s',
                }}
              >
                <Icon sx={{ fontSize: 15, color: isActive ? `${tab.color}.main` : 'text.secondary', flexShrink: 0 }} />
                <Typography variant="body2" sx={{ fontSize: 12, flex: 1, fontWeight: isActive ? 700 : 400, color: isActive ? `${tab.color}.main` : 'text.primary' }}>
                  {tab.label}
                </Typography>
                {count != null && count > 0 && (
                  <Chip label={count} size="small"
                    sx={{ fontSize: 10, height: 18, minWidth: 22, bgcolor: isActive ? `${tab.color}.main` : 'action.hover', color: isActive ? 'white' : 'text.secondary', fontWeight: 700, '& .MuiChip-label': { px: 0.5 } }}
                  />
                )}
              </Stack>
            );
          })}
        </Stack>

        {summary && (
          <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
              {summary.total} total · {summary.matched} matched · {summary.unmatched} pending
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── Right panel ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Panel header */}
        <Stack direction="row" alignItems="center" spacing={0.75}
          sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
        >
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1, fontSize: 13 }}>
            {activeTabDef.label}
            {activeTab !== 'archive' && filteredFiles.length > 0 && (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}
              </Typography>
            )}
          </Typography>

          {/* Create Temp Orders — Pending tab */}
          {activeTab === 'pending' && unmatchedInView.length > 0 && (
            <Button size="small" variant="outlined" color="warning"
              startIcon={<AutoFixHighRoundedIcon sx={{ fontSize: '13px !important' }} />}
              onClick={() => setAutoTempOpen(true)}
              sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
            >
              Create Temp ({unmatchedInView.length})
            </Button>
          )}

          {/* Export + print buttons */}
          {activeTab !== 'archive' && filteredFiles.length > 0 && (
            <>
              <Tooltip title="Export CSV / Excel">
                <IconButton size="small" onClick={() => exportCSV(false)} sx={{ p: 0.4, color: 'text.secondary' }}>
                  <FileDownloadRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Print / Save as PDF">
                <IconButton size="small" onClick={handlePrint} sx={{ p: 0.4, color: 'text.secondary' }}>
                  <PrintRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </>
          )}

          {/* List / grid toggle */}
          {activeTab !== 'archive' && (
            <Stack direction="row" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
              <Tooltip title="List view">
                <IconButton size="small" onClick={() => setView('list')}
                  sx={{ borderRadius: 0, bgcolor: viewMode === 'list' ? 'primary.main' : 'transparent', color: viewMode === 'list' ? 'white' : 'text.secondary', p: 0.4 }}
                >
                  <ViewListRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Grid view">
                <IconButton size="small" onClick={() => setView('grid')}
                  sx={{ borderRadius: 0, bgcolor: viewMode === 'grid' ? 'primary.main' : 'transparent', color: viewMode === 'grid' ? 'white' : 'text.secondary', p: 0.4 }}
                >
                  <ViewModuleRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Stack>

        {loading && <LinearProgress sx={{ height: 2 }} />}

        <StaleDraftAlert staleLinks={staleLinks} />

        {activeTabDef.viewOnly && activeTabDef.info && filteredFiles.length > 0 && (
          <Alert severity={activeTabDef.color === 'warning' ? 'warning' : 'info'} sx={{ mx: 1.5, mt: 1, py: 0.5, fontSize: 11 }}>
            {activeTabDef.info}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mx: 1.5, mt: 1 }} action={<Button size="small" onClick={load}>Retry</Button>}>
            {error}
          </Alert>
        )}

        {/* Archive */}
        {activeTab === 'archive' ? (
          <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
            <ArchivePanel onConfirm={setConfirmFile} onCreatePrintJob={handleCreatePrintJob} onEditPrintJob={setEditPrintJobFile} />
          </Box>
        ) : (
          /* File list / grid */
          <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
            {!loading && !error && filteredFiles.length === 0 && (
              <Box sx={{ py: 5, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {activeTab === 'pending' ? 'No files in stages 1–4.'
                    : activeTab === 'review' ? 'No files in stages 5–7.'
                    : activeTab === 'final' ? 'No files in Final folder.'
                    : activeTab === 'printing' ? 'No files in Printing folder.'
                    : 'No files found.'}
                </Typography>
              </Box>
            )}

            {viewMode === 'grid' ? (
              <Grid container spacing={0.75}>
                {filteredFiles.map((file) => (
                  <Grid item xs={6} sm={4} key={file.fileId}>
                    <FileCard
                      file={file}
                      checked={canSelect && selectedIds.has(file.fileId)}
                      onToggle={canSelect ? (id) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }) : undefined}
                      viewOnly={activeTabDef.viewOnly}
                      onRename={handleRename}
                      onConfirm={file.stageNumber === 8 ? setConfirmFile : undefined}
                      onCreatePrintJob={file.stageNumber === 9 && file.printJobNumber == null ? handleCreatePrintJob : undefined}
                      onEditPrintJob={file.stageNumber === 9 && file.printJobId ? setEditPrintJobFile : undefined}
                      onRelink={!activeTabDef.viewOnly ? setRelinkFile : undefined}
                    />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Stack spacing={0.4}>
                {filteredFiles.map((file) => (
                  <FileListRow
                    key={file.fileId}
                    file={file}
                    checked={canSelect && selectedIds.has(file.fileId)}
                    onToggle={canSelect ? (id) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }) : undefined}
                    viewOnly={activeTabDef.viewOnly}
                    onRename={handleRename}
                    onConfirm={file.stageNumber === 8 ? setConfirmFile : undefined}
                    onCreatePrintJob={file.stageNumber === 9 && file.printJobNumber == null ? handleCreatePrintJob : undefined}
                    onEditPrintJob={file.stageNumber === 9 && file.printJobId ? setEditPrintJobFile : undefined}
                    onRelink={!activeTabDef.viewOnly ? setRelinkFile : undefined}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}

        {/* Selection action bar — Final, Printing, All tabs */}
        {canSelect && selectedIds.size > 0 && (
          <>
            <Divider />
            <Stack
              direction="row" alignItems="center" spacing={0.75}
              sx={{ px: 1.5, py: 0.65, bgcolor: 'primary.50', flexWrap: 'wrap', gap: 0.75, flexShrink: 0 }}
            >
              <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ flex: 1, fontSize: 12 }}>
                {selectedIds.size} selected
              </Typography>

              {/* Link to Order — All tab only */}
              {activeTab === 'all' && (
                <Button size="small" variant="outlined"
                  startIcon={<LinkRoundedIcon sx={{ fontSize: '13px !important' }} />}
                  onClick={() => setLinkDialogOpen(true)}
                  sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
                >
                  Link to Order
                </Button>
              )}

              {/* Create Print Bill — Printing tab */}
              {activeTab === 'printing' && (
                <Button size="small" variant="outlined" color="error"
                  startIcon={<ReceiptLongRoundedIcon sx={{ fontSize: '13px !important' }} />}
                  onClick={() => setPrintDialogOpen(true)}
                  sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
                >
                  Create Print Bill
                </Button>
              )}

              {/* Export selected */}
              <Tooltip title="Export selected to CSV">
                <IconButton size="small" onClick={() => exportCSV(true)} sx={{ p: 0.35, color: 'primary.main' }}>
                  <FileDownloadRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>

              {/* Print selected */}
              <Tooltip title="Print selected">
                <IconButton size="small"
                  onClick={() => openPrintWindow(selectedFiles, activeTabDef.label)}
                  sx={{ p: 0.35, color: 'primary.main' }}
                >
                  <PrintRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>

              <IconButton size="small" onClick={() => setSelectedIds(new Set())} sx={{ p: 0.35 }}>
                <CloseRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Stack>
          </>
        )}
      </Box>

      {/* Dialogs */}
      <ConfirmFinalDialog
        open={!!confirmFile} file={confirmFile}
        onClose={() => setConfirmFile(null)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setConfirmFile(null); load(); }}
      />
      <EditPrintJobDialog
        open={!!editPrintJobFile} file={editPrintJobFile}
        onClose={() => setEditPrintJobFile(null)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setEditPrintJobFile(null); load(); }}
      />
      <LinkOrderDialog
        open={linkDialogOpen || !!relinkFile}
        selectedFiles={relinkFile ? [relinkFile] : selectedFiles}
        onClose={() => { setLinkDialogOpen(false); setRelinkFile(null); }}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setLinkDialogOpen(false); setRelinkFile(null); setSelectedIds(new Set()); load(); }}
      />
      <AutoTempDialog
        open={autoTempOpen} files={unmatchedInView}
        onClose={() => setAutoTempOpen(false)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setAutoTempOpen(false); load(); }}
      />
      <PrintJobDialog
        open={printDialogOpen} selectedFiles={selectedFiles}
        onClose={() => setPrintDialogOpen(false)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setPrintDialogOpen(false); setSelectedIds(new Set()); load(); }}
      />
      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.severity === 'warning' || toast?.severity === 'error' ? 7000 : 4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast(null)} severity={toast?.severity || 'success'} variant="filled" sx={{ width: '100%', fontSize: 13 }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
