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
  Chip,
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
  TextField,
  Tooltip,
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
import axios from '../../apiClient';

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
  {
    key: 'pending',
    label: 'Pending',
    icon: PendingActionsRoundedIcon,
    stageFilter: (s) => s >= 1 && s <= 4,
    viewOnly: true,
    color: 'warning',
    info: 'Files currently being worked on by the designer. No action needed until moved to Final.',
  },
  {
    key: 'review',
    label: 'Review',
    icon: RateReviewRoundedIcon,
    stageFilter: (s) => s >= 5 && s <= 7,
    viewOnly: true,
    color: 'info',
    info: 'Design approved internally. Waiting for office to move to Final and create an order.',
  },
  {
    key: 'final',
    label: 'Final',
    icon: DoneAllRoundedIcon,
    stageFilter: (s) => s === 8,
    viewOnly: false,
    color: 'success',
  },
  {
    key: 'printing',
    label: 'Printing',
    icon: LocalPrintshopRoundedIcon,
    stageFilter: (s) => s === 9,
    viewOnly: false,
    color: 'error',
  },
  {
    key: 'all',
    label: 'All Files',
    icon: FolderOpenRoundedIcon,
    stageFilter: () => true,
    viewOnly: false,
    color: 'default',
  },
  {
    key: 'archive',
    label: 'Archive',
    icon: ArchiveRoundedIcon,
    stageFilter: null,
    viewOnly: true,
    color: 'default',
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

// ─── StageChip ────────────────────────────────────────────────────────────────
function StageChip({ stageLabel: label, stageColor }) {
  const theme = stageColor || { bg: '#F5F5F5', color: '#424242' };
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        bgcolor: theme.bg, color: theme.color,
        fontWeight: 600, fontSize: 10, height: 18, borderRadius: 1,
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  );
}

// ─── Status badges row ────────────────────────────────────────────────────────
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
          label={`#${file.orderNumber}`}
          size="small"
          icon={<CheckCircleRoundedIcon sx={{ fontSize: '10px !important' }} />}
          sx={{ fontSize: 9, height: 16, bgcolor: 'success.50', color: 'success.700', fontWeight: 600, '& .MuiChip-label': { px: 0.5 } }}
        />
      )}
    </Stack>
  );
}

// ─── Action buttons for a single file ────────────────────────────────────────
function FileActions({ file, onRename, onConfirm, onEditPrintJob, viewOnly }) {
  const [renaming, setRenaming] = useState(false);
  if (viewOnly) return null;

  const isPrinting = file.stageNumber === 9;
  const isFinal = file.stageNumber === 8;
  const needsRename = file.matched && file.orderNumber != null && !alreadyPrefixedWithOrder(file.fileName, file.orderNumber);

  const handleRename = async (e) => {
    e.stopPropagation();
    if (!onRename || renaming) return;
    setRenaming(true);
    try { await onRename(file); } finally { setRenaming(false); }
  };

  return (
    <Stack direction="row" spacing={0.25} alignItems="center">
      {isFinal && onConfirm && (
        <Tooltip title="Confirm as real MIS order">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onConfirm(file); }} sx={{ color: 'success.600' }}>
            <AssignmentTurnedInRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
      {isPrinting && file.printJobNumber != null && onEditPrintJob && (
        <Tooltip title="Update print job vendor & amount">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEditPrintJob(file); }} sx={{ color: 'text.secondary' }}>
            <EditNoteRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
      {isPrinting && file.printJobNumber == null && (
        <Tooltip title="Print job pending creation">
          <ReceiptLongRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
        </Tooltip>
      )}
      {needsRename && onRename && (
        <Tooltip title={`Rename to start with #${file.orderNumber}`}>
          <IconButton size="small" onClick={handleRename} disabled={renaming} sx={{ color: 'text.secondary' }}>
            {renaming ? <CircularProgress size={12} /> : <DriveFileRenameOutlineRoundedIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

// ─── List row view ────────────────────────────────────────────────────────────
function FileListRow({ file, onRename, onConfirm, onEditPrintJob, viewOnly }) {
  const isUnmatched = !file.matched && !file.isDraft;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        py: 0.6, px: 1,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: isUnmatched ? 'warning.200' : 'divider',
        bgcolor: isUnmatched ? 'warning.50' : 'transparent',
        '&:hover': { bgcolor: isUnmatched ? 'warning.100' : 'action.hover' },
        transition: 'background 0.12s',
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        {file.stageNumber === 9
          ? <LocalPrintshopRoundedIcon sx={{ fontSize: 14, color: 'error.400' }} />
          : file.stageNumber === 8
          ? <DoneAllRoundedIcon sx={{ fontSize: 14, color: 'success.500' }} />
          : isUnmatched
          ? <ErrorOutlineRoundedIcon sx={{ fontSize: 14, color: 'warning.600' }} />
          : <DesignServicesRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          fontWeight={500}
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
            Order #{file.extractedOrderNumber || '?'} not found in MIS
          </Typography>
        )}
        {file.matched && !file.isDraft && file.orderStage && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
            MIS: {file.orderStage}
          </Typography>
        )}
      </Box>

      <Stack direction="row" spacing={0.4} alignItems="center" sx={{ flexShrink: 0 }}>
        {file.stageLabel && <StageChip stageLabel={file.stageLabel} stageColor={file.stageColor} />}
        <StatusBadges file={file} />
        <FileActions file={file} onRename={onRename} onConfirm={onConfirm} onEditPrintJob={onEditPrintJob} viewOnly={viewOnly} />
      </Stack>
    </Stack>
  );
}

// ─── Card view ────────────────────────────────────────────────────────────────
function FileCard({ file, onRename, onConfirm, onEditPrintJob, viewOnly }) {
  const isUnmatched = !file.matched && !file.isDraft;

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%', display: 'flex', flexDirection: 'column',
        borderColor: isUnmatched ? 'warning.300' : 'divider',
        bgcolor: isUnmatched ? 'warning.50' : 'background.paper',
        '&:hover': { boxShadow: 1 },
        transition: 'box-shadow 0.15s',
      }}
    >
      <CardContent sx={{ flex: 1, pb: 0.5, pt: 1.25, px: 1.5 }}>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 0.75 }}>
          {file.stageLabel && <StageChip stageLabel={file.stageLabel} stageColor={file.stageColor} />}
        </Stack>

        <Stack direction="row" spacing={0.75} alignItems="flex-start">
          <Box sx={{ flexShrink: 0, mt: 0.1 }}>
            {file.stageNumber === 9
              ? <LocalPrintshopRoundedIcon sx={{ fontSize: 15, color: 'error.400' }} />
              : file.stageNumber === 8
              ? <DoneAllRoundedIcon sx={{ fontSize: 15, color: 'success.500' }} />
              : isUnmatched
              ? <ErrorOutlineRoundedIcon sx={{ fontSize: 15, color: 'warning.600' }} />
              : <DesignServicesRoundedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />}
          </Box>
          <Typography
            variant="body2"
            fontWeight={500}
            sx={{ fontSize: 12, wordBreak: 'break-word', lineHeight: 1.4 }}
            title={file.fileName}
          >
            {file.fileName}
          </Typography>
        </Stack>

        <Box sx={{ mt: 0.75 }}>
          <StatusBadges file={file} />
        </Box>

        {file.isDraft && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5, fontSize: 10 }}>
            Tracking — no order yet
          </Typography>
        )}
        {isUnmatched && (
          <Typography variant="caption" color="warning.700" sx={{ display: 'block', mt: 0.5, fontSize: 10 }}>
            Order #{file.extractedOrderNumber || '?'} not found
          </Typography>
        )}
        {file.matched && !file.isDraft && file.orderStage && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5, fontSize: 10 }}>
            MIS: {file.orderStage}
          </Typography>
        )}
      </CardContent>

      {!viewOnly && (
        <CardActions sx={{ pt: 0, pb: 0.75, px: 1, justifyContent: 'flex-end', borderTop: '1px solid', borderColor: 'divider' }}>
          <FileActions file={file} onRename={onRename} onConfirm={onConfirm} onEditPrintJob={onEditPrintJob} viewOnly={viewOnly} />
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
    <Alert
      severity="warning"
      icon={<WarningAmberRoundedIcon fontSize="small" />}
      onClose={() => setOpen(false)}
      sx={{ mx: 1.5, mt: 1, fontSize: 12 }}
    >
      <AlertTitle sx={{ fontSize: 12, fontWeight: 700 }}>
        {staleLinks.length} draft file{staleLinks.length !== 1 ? 's' : ''} disappeared from Drive
      </AlertTitle>
      {staleLinks.map((l) => (
        <Typography key={l.driveFileId} variant="caption" sx={{ display: 'block', color: 'warning.900' }}>
          • {l.fileName || l.driveFileId}
        </Typography>
      ))}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        These files were tracked as drafts but are no longer visible in Drive — possibly deleted or moved to an unexpected folder.
      </Typography>
    </Alert>
  );
}

// ─── Confirm Final Dialog ─────────────────────────────────────────────────────
function ConfirmFinalDialog({ open, file, onClose, onSuccess }) {
  const [customer, setCustomer] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerInput, setCustomerInput] = useState('');
  const [itemDetails, setItemDetails] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setCustomer(null); setCustomerInput(''); setItemDetails(''); setMobileNumber(''); setError('');
      return;
    }
    setLoadingCustomers(true);
    axios.get('/api/customers/GetCustomerList')
      .then((r) => setCustomers(r.data?.result || []))
      .catch(() => {})
      .finally(() => setLoadingCustomers(false));
  }, [open]);

  const handleSubmit = async () => {
    if (!customer || !itemDetails.trim()) return;
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/confirm-final', {
        fileId: file.fileId,
        fileName: file.fileName,
        customerUuid: customer.Customer_uuid,
        itemDetails: itemDetails.trim(),
        mobileNumber: mobileNumber.trim(),
      });
      onSuccess(`Order #${res.data.orderNumber} created — "${file.fileName}" confirmed`, 'success');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to confirm');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    if (!customerInput) return true;
    const q = customerInput.toLowerCase();
    return c.Customer_name?.toLowerCase().includes(q) || c.Mobile?.toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
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
          <Autocomplete
            options={filteredCustomers}
            value={customer}
            onChange={(_, v) => { setCustomer(v); if (v?.Mobile) setMobileNumber(v.Mobile); }}
            inputValue={customerInput}
            onInputChange={(_, v) => setCustomerInput(v)}
            getOptionLabel={(c) => `${c.Customer_name}${c.Mobile ? ` — ${c.Mobile}` : ''}`}
            isOptionEqualToValue={(a, b) => a.Customer_uuid === b.Customer_uuid}
            loading={loadingCustomers}
            disabled={submitting}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Customer *"
                placeholder="Search by name or mobile…"
                size="small"
                InputProps={{ ...params.InputProps, endAdornment: <>{loadingCustomers ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
              />
            )}
          />
          <TextField
            label="Item Details *"
            placeholder="e.g. Flex Banner 4x3, Visiting Card 100pcs"
            value={itemDetails}
            onChange={(e) => setItemDetails(e.target.value)}
            size="small" disabled={submitting} multiline minRows={2}
          />
          <TextField
            label="Mobile Number"
            placeholder="Auto-filled from customer"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            size="small" disabled={submitting}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained" color="success"
          onClick={handleSubmit}
          disabled={!customer || !itemDetails.trim() || submitting}
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
      setError(err?.response?.data?.message || err.message || 'Failed to update print job');
    } finally {
      setSubmitting(false);
    }
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>
          {file?.fileName}
        </Typography>
        <Stack spacing={2}>
          <Autocomplete
            options={vendors}
            value={vendor}
            onChange={(_, v) => setVendor(v)}
            getOptionLabel={(v) => v.Vendor_name}
            isOptionEqualToValue={(a, b) => a.Vendor_uuid === b.Vendor_uuid}
            loading={loadingVendors}
            disabled={submitting}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Printer / Vendor *"
                size="small"
                InputProps={{ ...params.InputProps, endAdornment: <>{loadingVendors ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
              />
            )}
          />
          <TextField
            label="Amount (₹)" type="number" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            size="small" disabled={submitting}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            inputProps={{ min: 0 }}
          />
          <TextField
            label="Notes" value={notes}
            onChange={(e) => setNotes(e.target.value)}
            size="small" disabled={submitting} multiline minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
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
        onSuccess(`${n} file${n !== 1 ? 's' : ''} linked to Order #${order.Order_Number} — ${failed.length} rename failed. Use the Rename button to retry.`, 'warning');
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
          getOptionLabel={(o) => `#${o.Order_Number}${o.isTemporary ? ' [TEMP]' : ''} — ${o.orderNote || '(no note)'}`}
          isOptionEqualToValue={(a, b) => a.Order_uuid === b.Order_uuid}
          loading={searching} disabled={submitting}
          renderInput={(params) => (
            <TextField
              {...params} label="Search Order" placeholder="Type order number or description…" size="small"
              InputProps={{ ...params.InputProps, endAdornment: <>{searching ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
            />
          )}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained" onClick={handleSubmit}
          disabled={!order || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <LinkRoundedIcon />}
        >
          Link to Order
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Archive panel ────────────────────────────────────────────────────────────
function ArchiveDateSection({ section }) {
  const [expanded, setExpanded] = useState(true);
  if (!section.files?.length) return null;
  return (
    <Box>
      <Stack
        direction="row" alignItems="center" spacing={0.75}
        onClick={() => setExpanded((v) => !v)}
        sx={{ py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1, px: 0.5 }}
      >
        {section.stageLabel && <StageChip stageLabel={section.stageLabel} stageColor={section.stageColor} />}
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, fontSize: 11 }}>
          {section.sectionName} — {section.files.length} file{section.files.length !== 1 ? 's' : ''}
        </Typography>
        {expanded ? <ExpandLessRoundedIcon sx={{ fontSize: 14 }} /> : <ExpandMoreRoundedIcon sx={{ fontSize: 14 }} />}
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={0.4} sx={{ pl: 1, mt: 0.4 }}>
          {section.files.map((file) => (
            <FileListRow key={file.fileId} file={file} viewOnly />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

function ArchiveDateGroup({ dateGroup }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <Box sx={{ mb: 1 }}>
      <Stack
        direction="row" alignItems="center" spacing={1}
        onClick={() => setExpanded((v) => !v)}
        sx={{
          py: 0.75, px: 1.5, cursor: 'pointer',
          bgcolor: 'action.hover', borderRadius: 1.5,
          '&:hover': { bgcolor: 'action.selected' },
        }}
      >
        {expanded ? <ExpandLessRoundedIcon sx={{ fontSize: 15, color: 'text.secondary' }} /> : <ExpandMoreRoundedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />}
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, fontSize: 12 }}>
          {dateGroup.dateName}
        </Typography>
        <Chip
          label={`${dateGroup.fileCount} file${dateGroup.fileCount !== 1 ? 's' : ''}`}
          size="small"
          sx={{ fontSize: 10, height: 18, bgcolor: 'background.paper', '& .MuiChip-label': { px: 0.75 } }}
        />
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={0.75} sx={{ px: 1, pt: 0.75 }}>
          {dateGroup.sections.map((section, i) => (
            <ArchiveDateSection key={i} section={section} />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

function ArchivePanel() {
  const [archiveData, setArchiveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadArchive = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get('/api/design-files/scan-archive');
      setArchiveData(res.data);
      setLoaded(true);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load archive.');
    } finally { setLoading(false); }
  }, []);

  if (!loaded && !loading) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Scan the month archive to find historical files.
        </Typography>
        <Button size="small" variant="outlined" startIcon={<ArchiveRoundedIcon />} onClick={loadArchive}>
          Load Archive
        </Button>
      </Box>
    );
  }

  if (loading) return <Box sx={{ py: 2 }}><LinearProgress sx={{ height: 2 }} /></Box>;

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 1.5 }} action={<Button size="small" onClick={loadArchive}>Retry</Button>}>
        {error}
      </Alert>
    );
  }

  const { monthFolderName, dates = [], summary } = archiveData || {};

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ px: 1.5, pb: 1 }} spacing={1}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          <strong>{monthFolderName || '—'}</strong>
          {summary && ` · ${summary.total} files · ${summary.unmatched} unmatched`}
        </Typography>
        <Tooltip title="Refresh archive">
          <IconButton size="small" onClick={loadArchive} disabled={loading}>
            <RefreshRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {dates.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">No files found in archive folder.</Typography>
        </Box>
      ) : (
        <Stack spacing={0.5} sx={{ px: 1, pb: 1 }}>
          {dates.map((dateGroup) => (
            <ArchiveDateGroup key={dateGroup.dateFolderId} dateGroup={dateGroup} />
          ))}
        </Stack>
      )}
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

      // Background: draft links for stage 1-7
      const stage1to7 = allFiles.filter((f) => f.stageNumber >= 1 && f.stageNumber <= 7);
      if (stage1to7.length) {
        axios.post('/api/design-files/auto-scan-link', {
          files: stage1to7.map((f) => ({ fileId: f.fileId, fileName: f.fileName, stageNumber: f.stageNumber, stageLabel: f.stageLabel })),
        }).catch(() => {});
      }

      // Background: suspense POs for printing files without jobs
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

  // ── Config / reconnect guards ─────────────────────────────────────────────
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

  const filteredFiles = activeTabDef.stageFilter
    ? files.filter((f) => activeTabDef.stageFilter(f.stageNumber))
    : [];

  const selectedFiles = files.filter((f) => selectedIds.has(f.fileId));

  const toggleSelect = (fileId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      return next;
    });
  };

  function tabCount(tab) {
    if (!tab.stageFilter || !files.length) return 0;
    return files.filter((f) => tab.stageFilter(f.stageNumber)).length;
  }

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
        display: 'flex',
        minHeight: 500,
        maxHeight: 640,
      }}
    >
      {/* ── Left sidebar ────────────────────────────────────────────────────── */}
      <Box
        sx={{
          width: 200,
          flexShrink: 0,
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'grey.50',
        }}
      >
        {/* Sidebar header */}
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
          <FolderOpenRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 12, flex: 1 }}>
            Design Files
          </Typography>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={loading} sx={{ p: 0.25 }}>
              {loading ? <CircularProgress size={12} /> : <RefreshRoundedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Tab list */}
        <Stack sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const count = tab.key !== 'archive' ? tabCount(tab) : null;
            const isActive = activeTab === tab.key;
            return (
              <Stack
                key={tab.key}
                direction="row"
                alignItems="center"
                spacing={1}
                onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()); }}
                sx={{
                  px: 1.5, py: 0.85,
                  cursor: 'pointer',
                  borderLeft: '3px solid',
                  borderLeftColor: isActive ? `${tab.color}.main` : 'transparent',
                  bgcolor: isActive ? `${tab.color}.50` : 'transparent',
                  '&:hover': { bgcolor: isActive ? `${tab.color}.50` : 'action.hover' },
                  transition: 'background 0.1s',
                }}
              >
                <Icon sx={{ fontSize: 15, color: isActive ? `${tab.color}.main` : 'text.secondary', flexShrink: 0 }} />
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: 12, flex: 1,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? `${tab.color}.main` : 'text.primary',
                  }}
                >
                  {tab.label}
                </Typography>
                {count != null && count > 0 && (
                  <Chip
                    label={count}
                    size="small"
                    sx={{
                      fontSize: 10, height: 18, minWidth: 22,
                      bgcolor: isActive ? `${tab.color}.main` : 'action.hover',
                      color: isActive ? 'white' : 'text.secondary',
                      fontWeight: 700,
                      '& .MuiChip-label': { px: 0.5 },
                    }}
                  />
                )}
              </Stack>
            );
          })}
        </Stack>

        {/* Summary */}
        {summary && (
          <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
              {summary.total} total · {summary.matched} matched · {summary.unmatched} pending
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── Right content panel ─────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Panel header */}
        <Stack
          direction="row" alignItems="center" spacing={1}
          sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
        >
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1, fontSize: 13 }}>
            {activeTabDef.label}
            {activeTab !== 'archive' && filteredFiles.length > 0 && (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}
              </Typography>
            )}
          </Typography>

          {/* View toggle — only for non-archive tabs */}
          {activeTab !== 'archive' && (
            <Stack direction="row" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
              <Tooltip title="List view">
                <IconButton
                  size="small"
                  onClick={() => setView('list')}
                  sx={{ borderRadius: 0, bgcolor: viewMode === 'list' ? 'primary.main' : 'transparent', color: viewMode === 'list' ? 'white' : 'text.secondary', p: 0.5 }}
                >
                  <ViewListRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Grid view">
                <IconButton
                  size="small"
                  onClick={() => setView('grid')}
                  sx={{ borderRadius: 0, bgcolor: viewMode === 'grid' ? 'primary.main' : 'transparent', color: viewMode === 'grid' ? 'white' : 'text.secondary', p: 0.5 }}
                >
                  <ViewModuleRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Stack>

        {loading && <LinearProgress sx={{ height: 2 }} />}

        {/* Stale draft alert */}
        <StaleDraftAlert staleLinks={staleLinks} />

        {/* View-only info banner */}
        {activeTabDef.viewOnly && activeTabDef.info && filteredFiles.length > 0 && (
          <Alert severity={activeTabDef.color === 'warning' ? 'warning' : 'info'} sx={{ mx: 1.5, mt: 1, py: 0.5, fontSize: 11 }}>
            {activeTabDef.info}
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mx: 1.5, mt: 1 }} action={<Button size="small" onClick={load}>Retry</Button>}>
            {error}
          </Alert>
        )}

        {/* ── Archive panel ── */}
        {activeTab === 'archive' ? (
          <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
            <ArchivePanel />
          </Box>
        ) : (
          /* ── File list / grid ── */
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
                {activeTab === 'pending' && (
                  <Typography variant="caption" color="success.700" sx={{ display: 'block', mt: 0.5 }}>
                    All design work is complete or in review.
                  </Typography>
                )}
              </Box>
            )}

            {viewMode === 'grid' ? (
              <Grid container spacing={1}>
                {filteredFiles.map((file) => (
                  <Grid item xs={12} sm={6} key={file.fileId}>
                    <FileCard
                      file={file}
                      viewOnly={activeTabDef.viewOnly}
                      onRename={handleRename}
                      onConfirm={file.stageNumber === 8 ? setConfirmFile : undefined}
                      onEditPrintJob={file.stageNumber === 9 && file.printJobId ? setEditPrintJobFile : undefined}
                    />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Stack spacing={0.5}>
                {filteredFiles.map((file) => (
                  <FileListRow
                    key={file.fileId}
                    file={file}
                    viewOnly={activeTabDef.viewOnly}
                    onRename={handleRename}
                    onConfirm={file.stageNumber === 8 ? setConfirmFile : undefined}
                    onEditPrintJob={file.stageNumber === 9 && file.printJobId ? setEditPrintJobFile : undefined}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}

        {/* ── Selection bar (All tab only) ── */}
        {activeTab === 'all' && selectedIds.size > 0 && (
          <>
            <Divider />
            <Stack
              direction="row" alignItems="center" spacing={1}
              sx={{ px: 1.5, py: 0.75, bgcolor: 'primary.50', flexWrap: 'wrap', gap: 0.75, flexShrink: 0 }}
            >
              <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ flex: 1, fontSize: 12 }}>
                {selectedIds.size} selected
              </Typography>
              <Button
                size="small" variant="outlined"
                startIcon={<LinkRoundedIcon sx={{ fontSize: '13px !important' }} />}
                onClick={() => setLinkDialogOpen(true)}
                sx={{ fontSize: '0.72rem', py: 0.35, px: 0.9, minHeight: 26 }}
              >
                Link to Order
              </Button>
              <IconButton size="small" onClick={() => setSelectedIds(new Set())} sx={{ ml: 0.25 }}>
                <CloseRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Stack>
          </>
        )}
      </Box>

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      <ConfirmFinalDialog
        open={!!confirmFile}
        file={confirmFile}
        onClose={() => setConfirmFile(null)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setConfirmFile(null); load(); }}
      />
      <EditPrintJobDialog
        open={!!editPrintJobFile}
        file={editPrintJobFile}
        onClose={() => setEditPrintJobFile(null)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setEditPrintJobFile(null); load(); }}
      />
      <LinkOrderDialog
        open={linkDialogOpen}
        selectedFiles={selectedFiles}
        onClose={() => setLinkDialogOpen(false)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setSelectedIds(new Set()); load(); }}
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
