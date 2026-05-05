import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import axios from '../../apiClient';

// ─── Stage chip ───────────────────────────────────────────────────────────────
function StageChip({ stageLabel: label, stageColor }) {
  const theme = stageColor || { bg: '#F5F5F5', color: '#424242' };
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        bgcolor: theme.bg,
        color: theme.color,
        fontWeight: 600,
        fontSize: 10,
        height: 20,
        borderRadius: 1,
        '& .MuiChip-label': { px: 1 },
      }}
    />
  );
}

// ─── Summary bar showing count per stage ─────────────────────────────────────
function StageSummaryBar({ summary }) {
  if (!summary?.byStage) return null;
  const stages = Object.entries(summary.byStage)
    .filter(([, v]) => v.count > 0)
    .sort(([a], [b]) => Number(a) - Number(b));
  if (!stages.length) return null;
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ px: 2, pb: 1.5 }}>
      {stages.map(([num, info]) => (
        <Chip
          key={num}
          label={`${info.label} (${info.count})`}
          size="small"
          sx={{
            fontSize: 10,
            height: 20,
            bgcolor: 'action.hover',
            color: 'text.secondary',
            fontWeight: 500,
            '& .MuiChip-label': { px: 1 },
          }}
        />
      ))}
    </Stack>
  );
}

// ─── Single file row ──────────────────────────────────────────────────────────
function FileRow({ file, checked, onToggle }) {
  const isUnmatched = !file.matched;
  const isPrinting = file.stageNumber === 9;
  const isFinal = file.stageNumber === 8;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        py: 0.7,
        px: 1,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: checked ? 'primary.main' : isUnmatched ? 'warning.200' : 'divider',
        bgcolor: checked
          ? 'primary.50'
          : isUnmatched
          ? 'warning.50'
          : isPrinting
          ? 'success.50'
          : 'transparent',
        transition: 'background 0.15s, border-color 0.15s',
        cursor: 'pointer',
      }}
      onClick={() => onToggle(file.fileId)}
    >
      <Checkbox
        size="small"
        checked={checked}
        onChange={() => onToggle(file.fileId)}
        onClick={(e) => e.stopPropagation()}
        sx={{ p: 0.25, flexShrink: 0 }}
      />

      <Box sx={{ flexShrink: 0 }}>
        {isPrinting
          ? <LocalPrintshopRoundedIcon sx={{ fontSize: 15, color: 'success.600' }} />
          : isFinal
          ? <DoneAllRoundedIcon sx={{ fontSize: 15, color: 'info.600' }} />
          : isUnmatched
          ? <ErrorOutlineRoundedIcon sx={{ fontSize: 15, color: 'warning.600' }} />
          : <DesignServicesRoundedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography
            variant="body2"
            fontWeight={500}
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}
            title={file.fileName}
          >
            {file.fileName}
          </Typography>
          {file.isTemporaryOrder && (
            <Chip label="TEMP" size="small" sx={{ fontSize: 9, height: 16, bgcolor: 'warning.100', color: 'warning.800', fontWeight: 700, '& .MuiChip-label': { px: 0.75 } }} />
          )}
        </Stack>
        {isUnmatched && (
          <Typography variant="caption" color="warning.700" sx={{ fontSize: 10 }}>
            Order #{file.extractedOrderNumber || '?'} not found in MIS
          </Typography>
        )}
        {file.matched && file.orderStage && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
            MIS stage: {file.orderStage}
            {file.linkedViaManual ? ' (manually linked)' : ''}
          </Typography>
        )}
      </Box>

      {file.stageLabel && (
        <StageChip stageLabel={file.stageLabel} stageColor={file.stageColor} />
      )}

      {file.matched && (
        <Tooltip title={`Matched to Order #${file.orderNumber}`}>
          <CheckCircleRoundedIcon sx={{ fontSize: 14, color: 'success.500', flexShrink: 0 }} />
        </Tooltip>
      )}
    </Stack>
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

  useEffect(() => {
    if (!open) { setOrder(null); setOptions([]); setInputValue(''); setError(''); }
  }, [open]);

  const search = useCallback((q) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get('/api/design-files/orders/search', { params: { q } });
        setOptions(res.data?.result || []);
      } catch {
        setOptions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  useEffect(() => { search(inputValue); }, [inputValue, search]);

  const handleSubmit = async () => {
    if (!order) return;
    setSubmitting(true);
    setError('');
    try {
      await axios.post('/api/design-files/link-order', {
        fileIds: selectedFiles.map((f) => f.fileId),
        orderUuid: order.Order_uuid,
        files: selectedFiles.map((f) => ({
          fileId: f.fileId,
          fileName: f.fileName,
          stageNumber: f.stageNumber,
          stageLabel: f.stageLabel,
        })),
      });
      onSuccess(`${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''} linked to Order #${order.Order_Number}`);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to link files');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Link Files to Order</Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Autocomplete
          options={options}
          value={order}
          onChange={(_, v) => setOrder(v)}
          inputValue={inputValue}
          onInputChange={(_, v) => setInputValue(v)}
          getOptionLabel={(o) => `#${o.Order_Number}${o.isTemporary ? ' [TEMP]' : ''} — ${o.orderNote || '(no note)'}`}
          isOptionEqualToValue={(a, b) => a.Order_uuid === b.Order_uuid}
          loading={searching}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search Order"
              placeholder="Type order number or description…"
              size="small"
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {searching ? <CircularProgress size={14} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
        <Button
          size="small"
          variant="text"
          href="/orders/new"
          target="_blank"
          sx={{ mt: 1, fontSize: '0.75rem' }}
        >
          + Create New Order instead
        </Button>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!order || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <LinkRoundedIcon />}
        >
          Link Files
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Auto Temp Orders Confirm Dialog ─────────────────────────────────────────
function AutoTempDialog({ open, files, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!open) setError(''); }, [open]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post('/api/design-files/auto-temp-orders', { files });
      onSuccess(`Created ${res.data.created} temporary order${res.data.created !== 1 ? 's' : ''} — update them with actual customer details`);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create temp orders');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Create Temp Orders</Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          This will create <strong>{files.length}</strong> temporary placeholder order{files.length !== 1 ? 's' : ''} — one for each unmatched file. Each order is marked <strong>[TEMP]</strong> and linked to the file immediately so nothing is lost.
        </Typography>
        <Alert severity="info" sx={{ fontSize: 12 }}>
          Open each temp order later to fill in the real customer name and amount.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleConfirm}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <AutoFixHighRoundedIcon />}
        >
          Create {files.length} Temp Order{files.length !== 1 ? 's' : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Print Job Dialog ─────────────────────────────────────────────────────────
function PrintJobDialog({ open, selectedFiles, onClose, onSuccess }) {
  const [order, setOrder] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [orderOptions, setOrderOptions] = useState([]);
  const [vendorOptions, setVendorOptions] = useState([]);
  const [orderInput, setOrderInput] = useState('');
  const [searchingOrders, setSearchingOrders] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [items, setItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const orderDebounceRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setOrder(null); setVendor(null); setOrderInput(''); setError('');
      return;
    }
    setItems(selectedFiles.map((f) => ({ ...f, qty: 1, rate: '', amount: 0 })));
    setLoadingVendors(true);
    axios.get('/api/vendors/masters', { params: { activeOnly: 'true' } })
      .then((r) => setVendorOptions(r.data?.result || []))
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, [open, selectedFiles]);

  useEffect(() => {
    clearTimeout(orderDebounceRef.current);
    orderDebounceRef.current = setTimeout(async () => {
      setSearchingOrders(true);
      try {
        const res = await axios.get('/api/design-files/orders/search', { params: { q: orderInput } });
        setOrderOptions(res.data?.result || []);
      } catch {
        setOrderOptions([]);
      } finally {
        setSearchingOrders(false);
      }
    }, 300);
  }, [orderInput]);

  const updateItem = (fileId, field, value) => {
    setItems((prev) => prev.map((item) => {
      if (item.fileId !== fileId) return item;
      const updated = { ...item, [field]: value };
      updated.amount = Number(updated.qty || 0) * Number(updated.rate || 0);
      return updated;
    }));
  };

  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const handleSubmit = async () => {
    if (!order || !vendor) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post('/api/design-files/create-print-job', {
        orderUuid: order.Order_uuid,
        vendorUuid: vendor.Vendor_uuid,
        vendorName: vendor.Vendor_name,
        items: items.map((i) => ({
          fileId: i.fileId,
          fileName: i.fileName,
          qty: Number(i.qty) || 1,
          rate: Number(i.rate) || 0,
          amount: Number(i.amount) || 0,
        })),
        totalAmount: total,
      });
      onSuccess(`Print bill ₹${total.toLocaleString('en-IN')} created for Order #${res.data.orderNumber}`);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create print job');
    } finally {
      setSubmitting(false);
    }
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

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2.5 }}>
          <Autocomplete
            sx={{ flex: 1 }}
            options={orderOptions}
            value={order}
            onChange={(_, v) => setOrder(v)}
            inputValue={orderInput}
            onInputChange={(_, v) => setOrderInput(v)}
            getOptionLabel={(o) => `#${o.Order_Number}${o.isTemporary ? ' [TEMP]' : ''} — ${o.orderNote || '(no note)'}`}
            isOptionEqualToValue={(a, b) => a.Order_uuid === b.Order_uuid}
            loading={searchingOrders}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Order *"
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {searchingOrders ? <CircularProgress size={14} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          <Autocomplete
            sx={{ flex: 1 }}
            options={vendorOptions}
            value={vendor}
            onChange={(_, v) => setVendor(v)}
            getOptionLabel={(v) => v.Vendor_name}
            isOptionEqualToValue={(a, b) => a.Vendor_uuid === b.Vendor_uuid}
            loading={loadingVendors}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Vendor (Printer) *"
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingVendors ? <CircularProgress size={14} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
        </Stack>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>File</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12, width: 90 }}>Qty</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12, width: 110 }}>Rate (₹)</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: 12, width: 110 }}>Amount (₹)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.fileId}>
                <TableCell sx={{ fontSize: 12 }}>
                  <Tooltip title={item.fileName}>
                    <Typography
                      variant="body2"
                      sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}
                    >
                      {item.fileName}
                    </Typography>
                  </Tooltip>
                  {item.stageLabel && <StageChip stageLabel={item.stageLabel} stageColor={item.stageColor} />}
                </TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateItem(item.fileId, 'qty', e.target.value)}
                    inputProps={{ min: 1, style: { textAlign: 'right', fontSize: 12, padding: '4px 6px' } }}
                    sx={{ width: 72 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    type="number"
                    value={item.rate}
                    onChange={(e) => updateItem(item.fileId, 'rate', e.target.value)}
                    placeholder="0"
                    InputProps={{
                      startAdornment: <InputAdornment position="start" sx={{ fontSize: 11 }}>₹</InputAdornment>,
                    }}
                    inputProps={{ min: 0, style: { textAlign: 'right', fontSize: 12, padding: '4px 4px' } }}
                    sx={{ width: 100 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: 12 }}>
                    ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={3} align="right" sx={{ fontWeight: 700, fontSize: 13, borderTop: '2px solid', borderColor: 'divider' }}>
                Total
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: 13, borderTop: '2px solid', borderColor: 'divider' }}>
                ₹{total.toLocaleString('en-IN')}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={!order || !vendor || total === 0 || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <PrintRoundedIcon />}
        >
          Create Print Bill
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Archive panel ────────────────────────────────────────────────────────────
function ArchivePanel() {
  const [archiveData, setArchiveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/design-files/scan-archive');
      setArchiveData(res.data);
      setLoaded(true);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load archive.');
    } finally {
      setLoading(false);
    }
  }, []);

  if (!loaded && !loading) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Scan the month archive folder to find files moved out of Today.
        </Typography>
        <Button size="small" variant="outlined" startIcon={<ArchiveRoundedIcon />} onClick={loadArchive}>
          Scan Archive
        </Button>
      </Box>
    );
  }

  if (loading) {
    return <Box sx={{ py: 2 }}><LinearProgress sx={{ height: 2 }} /></Box>;
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 1.5 }} action={<Button size="small" onClick={loadArchive}>Retry</Button>}>
        {error}
      </Alert>
    );
  }

  const files = archiveData?.files || [];
  const summary = archiveData?.summary;
  const folderName = archiveData?.folderName;
  const unmatched = files.filter((f) => !f.matched);

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ px: 2, pb: 1 }} spacing={1}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          Archive: <strong>{folderName || '—'}</strong> · {summary?.total || 0} files
        </Typography>
        {summary?.unmatched > 0 && (
          <Chip label={`${summary.unmatched} unmatched`} size="small"
            sx={{ fontSize: 10, height: 18, bgcolor: 'error.100', color: 'error.800', fontWeight: 600 }} />
        )}
        <Tooltip title="Refresh archive scan">
          <IconButton size="small" onClick={loadArchive} disabled={loading}>
            <RefreshRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {files.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">No files found in archive folder.</Typography>
        </Box>
      ) : (
        <Stack spacing={0.5} sx={{ px: 1.5, pb: 1, maxHeight: 280, overflowY: 'auto' }}>
          {unmatched.length > 0 && (
            <Alert severity="warning" sx={{ fontSize: 11, py: 0.5, mb: 0.5 }}>
              {unmatched.length} archived file{unmatched.length !== 1 ? 's' : ''} have no MIS order — they may have been missed today.
            </Alert>
          )}
          {files.map((file) => (
            <FileRow key={file.fileId} file={file} checked={false} onToggle={() => {}} />
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
  // Fix 2: default to 'unmatched' instead of 'all'
  const [filter, setFilter] = useState('unmatched');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [autoTempOpen, setAutoTempOpen] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cfgRes = await axios.get('/api/design-files/config-check');
      if (!cfgRes.data?.configured) { setConfigMissing(true); return; }
      setArchiveConfigured(!!cfgRes.data?.archiveConfigured);
      const res = await axios.get('/api/design-files/scan');
      setData(res.data);
      setSelectedIds(new Set());
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '';
      if (err?.response?.data?.reconnectRequired) { setReconnectRequired(true); return; }
      if (err?.response?.status === 400) { setConfigMissing(true); return; }
      setError(msg || 'Could not load Drive files.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = useCallback((fileId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  // ── Config missing ────────────────────────────────────────────────────────
  if (configMissing) {
    return (
      <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <FolderOpenRoundedIcon color="action" sx={{ mt: 0.2 }} />
          <Box>
            <Typography variant="subtitle2" fontWeight={600}>Design Files Tracker</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Add <code>DRIVE_DAILY_FOLDER_ID</code> to your Render environment variables.
              Open your <strong>0 Today</strong> folder in Google Drive → copy the ID from the URL.
            </Typography>
          </Box>
        </Stack>
      </Box>
    );
  }

  // ── Drive disconnected ────────────────────────────────────────────────────
  if (reconnectRequired) {
    return (
      <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'warning.300', p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ErrorOutlineRoundedIcon color="warning" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>Google Drive disconnected</Typography>
            <Typography variant="body2" color="text.secondary">Reconnect to track design files.</Typography>
          </Box>
          <Button size="small" variant="outlined" color="warning"
            onClick={() => window.open('/api/google-drive/connect', '_blank')}>
            Reconnect
          </Button>
        </Stack>
      </Box>
    );
  }

  const files = data?.files || [];
  const summary = data?.summary;

  const filtered = files.filter((f) => {
    if (filter === 'unmatched') return !f.matched;
    if (filter === 'printing') return f.stageNumber === 9;
    if (filter === 'final') return f.stageNumber === 8;
    if (filter === 'archive') return false; // archive rendered separately
    return true;
  });

  const unmatchedCount = summary?.unmatched || 0;
  const printingCount = summary?.byStage?.[9]?.count || 0;
  const finalCount = summary?.byStage?.[8]?.count || 0;

  const selectedFiles = files.filter((f) => selectedIds.has(f.fileId));
  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => selectedIds.has(f.fileId));
  const someFilteredSelected = filtered.some((f) => selectedIds.has(f.fileId));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((f) => next.delete(f.fileId));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((f) => next.add(f.fileId));
        return next;
      });
    }
  };

  // All unmatched files (across all stages) for the auto-temp dialog
  const allUnmatched = files.filter((f) => !f.matched);

  const tabs = [
    { key: 'unmatched', label: `Pending${unmatchedCount ? ` (${unmatchedCount})` : ''}` },
    { key: 'all', label: 'All' },
    { key: 'printing', label: `Printing${printingCount ? ` (${printingCount})` : ''}` },
    { key: 'final', label: `Final${finalCount ? ` (${finalCount})` : ''}` },
    ...(archiveConfigured ? [{ key: 'archive', label: 'Archive', icon: true }] : []),
  ];

  return (
    <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>

      {/* Header */}
      <Stack
        direction="row" alignItems="center" spacing={1}
        sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <FolderOpenRoundedIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
          Design Files — Today
        </Typography>

        {!loading && summary && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            {unmatchedCount > 0 && (
              <Chip label={`${unmatchedCount} unmatched`} size="small"
                sx={{ bgcolor: 'warning.100', color: 'warning.800', fontWeight: 600, fontSize: 10, height: 20 }} />
            )}
            {printingCount > 0 && (
              <Chip label={`${printingCount} printing`} size="small"
                sx={{ bgcolor: 'success.100', color: 'success.800', fontWeight: 600, fontSize: 10, height: 20 }} />
            )}
            <Chip label={`${summary.total} total`} size="small"
              sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 500, fontSize: 10, height: 20 }} />
          </Stack>
        )}

        <Tooltip title="Refresh from Drive">
          <IconButton size="small" onClick={load} disabled={loading}>
            {loading ? <CircularProgress size={14} /> : <RefreshRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      {loading && <LinearProgress sx={{ height: 2 }} />}

      {/* Stage summary pills */}
      {!loading && summary && filter !== 'archive' && (
        <Box sx={{ pt: 1.5 }}>
          <StageSummaryBar summary={summary} />
        </Box>
      )}

      {/* Filter tabs + select-all */}
      <Stack direction="row" alignItems="center" spacing={0.5}
        sx={{ px: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
        {filter !== 'archive' && (
          <Checkbox
            size="small"
            checked={allFilteredSelected}
            indeterminate={someFilteredSelected && !allFilteredSelected}
            onChange={toggleSelectAll}
            disabled={filtered.length === 0}
            sx={{ p: 0.25, mr: 0.5 }}
          />
        )}
        {tabs.map((tab) => (
          <Button key={tab.key} size="small"
            variant={filter === tab.key ? 'contained' : 'text'}
            onClick={() => { setFilter(tab.key); setSelectedIds(new Set()); }}
            startIcon={tab.icon ? <ArchiveRoundedIcon sx={{ fontSize: '13px !important' }} /> : undefined}
            sx={{
              fontSize: 11, py: 0.4, px: 1.2, minWidth: 0,
              borderRadius: 5, boxShadow: 'none', textTransform: 'none',
              fontWeight: filter === tab.key ? 600 : 400,
            }}>
            {tab.label}
          </Button>
        ))}

        {/* Auto-create temp orders button — only shown in Pending/unmatched tab */}
        {filter === 'unmatched' && allUnmatched.length > 0 && !loading && (
          <Tooltip title="Auto-create a placeholder order for every unmatched file so nothing gets lost">
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<AutoFixHighRoundedIcon sx={{ fontSize: '13px !important' }} />}
              onClick={() => setAutoTempOpen(true)}
              sx={{ fontSize: 11, py: 0.4, px: 1.2, minWidth: 0, borderRadius: 5, textTransform: 'none', ml: 'auto' }}
            >
              Create Temp Orders ({allUnmatched.length})
            </Button>
          </Tooltip>
        )}
      </Stack>

      {/* Archive panel */}
      {filter === 'archive' ? (
        <ArchivePanel />
      ) : (
        /* File list */
        <Box sx={{ px: 1.5, py: 1, maxHeight: 360, overflowY: 'auto' }}>
          {error && (
            <Alert severity="error" sx={{ mb: 1, py: 0.5 }}
              action={<Button size="small" onClick={load}>Retry</Button>}>
              {error}
            </Alert>
          )}

          {!loading && !error && filtered.length === 0 && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {filter === 'unmatched'
                  ? 'All files matched to orders. '
                  : filter === 'printing'
                  ? 'No files in Printing folder.'
                  : filter === 'final'
                  ? 'No files in Final folder.'
                  : 'No files found in Drive folder.'}
              </Typography>
              {filter === 'unmatched' && (
                <Typography variant="caption" color="success.700">No pending files — great!</Typography>
              )}
            </Box>
          )}

          <Stack spacing={0.6}>
            {filtered.map((file) => (
              <FileRow
                key={file.fileId}
                file={file}
                checked={selectedIds.has(file.fileId)}
                onToggle={toggleSelect}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Selection action bar */}
      {selectedIds.size > 0 && filter !== 'archive' && (
        <>
          <Divider />
          <Stack
            direction="row" alignItems="center" spacing={1}
            sx={{ px: 2, py: 1, bgcolor: 'primary.50', flexWrap: 'wrap', gap: 1 }}
          >
            <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ flex: 1, minWidth: 100 }}>
              {selectedIds.size} file{selectedIds.size !== 1 ? 's' : ''} selected
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<LinkRoundedIcon sx={{ fontSize: '14px !important' }} />}
              onClick={() => setLinkDialogOpen(true)}
              sx={{ fontSize: '0.72rem', py: 0.4, px: 1, minHeight: 28 }}
            >
              Link to Order
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<PrintRoundedIcon sx={{ fontSize: '14px !important' }} />}
              onClick={() => setPrintDialogOpen(true)}
              sx={{ fontSize: '0.72rem', py: 0.4, px: 1, minHeight: 28, boxShadow: 'none' }}
            >
              Create Print Bill
            </Button>
            <IconButton size="small" onClick={() => setSelectedIds(new Set())} sx={{ ml: 0.5 }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </>
      )}

      {/* Footer */}
      {!loading && files.length > 0 && selectedIds.size === 0 && filter !== 'archive' && (
        <>
          <Divider />
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Backup files skipped automatically. Auto-matched by order number in filename. Select files to link or create a print bill.
            </Typography>
          </Box>
        </>
      )}

      <LinkOrderDialog
        open={linkDialogOpen}
        selectedFiles={selectedFiles}
        onClose={() => setLinkDialogOpen(false)}
        onSuccess={(msg) => { setToast(msg); setSelectedIds(new Set()); load(); }}
      />
      <PrintJobDialog
        open={printDialogOpen}
        selectedFiles={selectedFiles}
        onClose={() => setPrintDialogOpen(false)}
        onSuccess={(msg) => { setToast(msg); setSelectedIds(new Set()); load(); }}
      />
      <AutoTempDialog
        open={autoTempOpen}
        files={allUnmatched}
        onClose={() => setAutoTempOpen(false)}
        onSuccess={(msg) => { setToast(msg); setAutoTempOpen(false); load(); }}
      />
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
