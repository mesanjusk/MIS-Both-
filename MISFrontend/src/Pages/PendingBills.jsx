import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, LinearProgress, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useAuth } from '../context/AuthContext';
import { fetchPendingBills } from '../services/orderService';
import axios from '../apiClient';
import { applyArchiveConfirmation, normalizeArchiveScan, readArchiveCache, writeArchiveCache } from '../Components/dashboard/archiveBrowserCache';
import { pendingArchiveFiles, filterPendingArchiveFiles } from './pendingArchiveQueue';
import UpdateDelivery from './updateDelivery';

// Lazy-load the existing Archive confirmation popup only when someone needs it.
const ArchiveConfirmDialog = lazy(() => import('../Components/dashboard/DesignFilesWidget')
  .then((module) => ({ default: module.ConfirmFinalDialog })));

const CACHE_PREFIX = 'mis.pendingBills.v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 100;
const ARCHIVE_PAGE_SIZE = 60;
const EMPTY = { rows: [], total: 0, hasMore: false, savedAt: 0 };
const orderKey = (order) => String(order?.Order_uuid || order?._id || '');

export function hasInvoiceLines(items) {
  return Array.isArray(items) && items.some((item) => Number(item?.Amount) > 0);
}

export function removeBilledOrder(rows, id) {
  const key = String(id || '');
  return rows.filter((row) => String(row?.Order_uuid || '') !== key && String(row?._id || '') !== key);
}

function readCache(key) {
  try {
    const data = JSON.parse(sessionStorage.getItem(key) || 'null');
    return data && Array.isArray(data.rows) && Number.isFinite(data.savedAt) ? data : null;
  } catch { return null; }
}

function saveCache(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { /* Browser storage is optional. */ }
}

function displayDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function deliveryDate(order) {
  const statuses = Array.isArray(order.Status) ? order.Status : [];
  const delivered = [...statuses].reverse().find((entry) => /delivered/i.test(entry?.Task || ''));
  return delivered?.Delivery_Date || delivered?.CreatedAt || order.createdAt;
}

export default function PendingBills() {
  const { userName } = useAuth();
  const cacheKey = CACHE_PREFIX + ':' + (userName || 'current');
  const [snapshot, setSnapshot] = useState(EMPTY);
  const snapshotRef = useRef(EMPTY);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [queueTab, setQueueTab] = useState('archive');
  const [archiveSnapshot, setArchiveSnapshot] = useState(() => readArchiveCache(userName));
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [archivePageSize, setArchivePageSize] = useState(ARCHIVE_PAGE_SIZE);
  const [confirmArchiveFile, setConfirmArchiveFile] = useState(null);
  const [archiveNotice, setArchiveNotice] = useState(null);
  const archiveInFlight = useRef(false);
  const localConfirmations = useRef(new Map());

  const commit = useCallback((next) => {
    snapshotRef.current = next;
    setSnapshot(next);
    saveCache(cacheKey, next);
  }, [cacheKey]);

  const load = useCallback(async (append = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const offset = append ? snapshotRef.current.rows.length : 0;
      const { data } = await fetchPendingBills(offset, PAGE_SIZE);
      if (!data?.success || !Array.isArray(data.result)) throw new Error(data?.message || 'Invalid response');
      const current = snapshotRef.current;
      const incoming = data.result;
      const seen = new Set(append ? current.rows.map(orderKey) : []);
      const rows = append
        ? [...current.rows, ...incoming.filter((order) => !seen.has(orderKey(order)))]
        : incoming;
      commit({
        rows,
        total: Number(data.total) || 0,
        hasMore: Boolean(data.hasMore),
        savedAt: Date.now(),
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not load pending bills');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [commit]);

  const loadArchive = useCallback(async () => {
    if (archiveInFlight.current) return;
    archiveInFlight.current = true;
    setArchiveBusy(true);
    setArchiveError('');
    try {
      const response = await axios.get('/api/design-files/scan-archive', { cache: false });
      if (!response.data?.success || !Array.isArray(response.data?.dates)) {
        throw new Error(response.data?.message || 'Archive scan returned no files');
      }
      let next = normalizeArchiveScan(response.data);
      for (const confirmation of localConfirmations.current.values()) {
        next = applyArchiveConfirmation(next, confirmation);
      }
      writeArchiveCache(userName, next);
      setArchiveSnapshot(next);
    } catch (err) {
      setArchiveError(err?.response?.data?.message || err.message || 'Unable to load Archive pending confirmations.');
    } finally {
      archiveInFlight.current = false;
      setArchiveBusy(false);
    }
  }, [userName]);

  // Share the Archive tab's browser-session snapshot; only scan Drive if this
  // user has never loaded it in the current session, or presses Refresh.
  useEffect(() => {
    const cached = readArchiveCache(userName);
    setArchiveSnapshot(cached);
    setArchivePageSize(ARCHIVE_PAGE_SIZE);
    if (!cached && userName) loadArchive();
  }, [userName, loadArchive]);

  useEffect(() => {
    const cached = readCache(cacheKey);
    if (cached) {
      commit(cached);
      if (Date.now() - cached.savedAt < CACHE_TTL_MS) return;
    } else {
      commit(EMPTY);
    }
    load(false);
  }, [cacheKey, commit, load]);

  const markBilled = useCallback((id) => {
    if (!id) return;
    const current = snapshotRef.current;
    const rows = removeBilledOrder(current.rows, id);
    if (rows.length === current.rows.length) return;
    commit({
      ...current,
      rows,
      total: Math.max(0, current.total - (current.rows.length - rows.length)),
      savedAt: Date.now(),
    });
  }, [commit]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return snapshot.rows;
    return snapshot.rows.filter((order) => [
      order.Order_Number, order.Customer_name, order.orderNote, order.Order_uuid,
      ...(Array.isArray(order.Items) ? order.Items.map((item) => item.Item || item.Item_name) : []),
    ].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [search, snapshot.rows]);

  const archivePending = useMemo(() => pendingArchiveFiles(archiveSnapshot), [archiveSnapshot]);
  const archiveFiltered = useMemo(
    () => filterPendingArchiveFiles(archivePending, search),
    [archivePending, search]
  );
  const archiveVisible = archiveFiltered.slice(0, archivePageSize);

  const handleArchiveConfirmed = useCallback((message, severity = 'success', confirmed) => {
    if (confirmed?.fileId) {
      localConfirmations.current.set(confirmed.fileId, confirmed);
      const current = readArchiveCache(userName) || archiveSnapshot;
      const next = applyArchiveConfirmation(current, confirmed);
      if (next !== current) {
        writeArchiveCache(userName, next);
        setArchiveSnapshot(next);
      }
    } else {
      // Never hide a file without confirmation from the server.
      loadArchive();
    }
    setArchiveNotice({ severity, message });
    setConfirmArchiveFile(null);
  }, [userName, archiveSnapshot, loadArchive]);

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" fontWeight={800}>Pending Bills</Typography>
            <Chip label={queueTab === 'archive' ? archivePending.length : snapshot.total} size="small" color="warning" />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {queueTab === 'archive'
              ? 'Files marked Pending confirmation in Workflow → Archive. Confirm a file as an MIS order before billing.'
              : 'Delivered orders without an invoice. Create a bill to remove an order from this list.'}
          </Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={(queueTab === 'archive' ? archiveBusy : busy) ? <CircularProgress size={16} /> : <RefreshRoundedIcon />}
          onClick={() => queueTab === 'archive' ? loadArchive() : load(false)} disabled={queueTab === 'archive' ? archiveBusy : busy} sx={{ textTransform: 'none', alignSelf: { xs: 'flex-start', sm: 'auto' } }}>
          Refresh
        </Button>
      </Stack>

      <ToggleButtonGroup size="small" exclusive value={queueTab}
        onChange={(_, next) => {
          if (!next) return;
          setQueueTab(next);
          setSearch('');
          setArchivePageSize(ARCHIVE_PAGE_SIZE);
        }}
        sx={{ alignSelf: 'flex-start', '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 650 } }}>
        <ToggleButton value="archive">Archive Pending Confirmation ({archivePending.length})</ToggleButton>
        <ToggleButton value="delivered">Delivered, Not Invoiced ({snapshot.total})</ToggleButton>
      </ToggleButtonGroup>

      <TextField size="small" fullWidth value={search} onChange={(event) => setSearch(event.target.value)}
        placeholder={queueTab === 'archive' ? "Search pending files by name, month, date or customer" : "Search loaded orders by number, customer or remark"}
        InputProps={{ startAdornment: <SearchRoundedIcon sx={{ mr: 1, color: 'text.disabled' }} /> }} />

      {queueTab === 'archive' ? (
        <>
          {archiveBusy && <LinearProgress sx={{ height: 2 }} />}
          {archiveError && (
            <Alert severity="warning" action={<Button size="small" onClick={loadArchive}>Retry</Button>}>
              {archiveError}{archiveSnapshot ? ' — showing saved archive.' : ''}
            </Alert>
          )}
          {archiveNotice && (
            <Alert severity={archiveNotice.severity} onClose={() => setArchiveNotice(null)}>
              {archiveNotice.message}
            </Alert>
          )}
          {!archiveSnapshot && archiveBusy && (
            <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
              <CircularProgress size={25} />
              <Typography variant="body2" color="text.secondary">
                Loading the archive once. Saved folders will be reused on your next visit.
              </Typography>
            </Stack>
          )}
          {archiveSnapshot && archivePending.length === 0 && (
            <Alert severity="success">All archived files are confirmed as MIS orders.</Alert>
          )}
          {archiveSnapshot && archivePending.length > 0 && archiveFiltered.length === 0 && (
            <Alert severity="info">No pending archive files match this search.</Alert>
          )}
          <Stack spacing={0.75}>
            {archiveVisible.map((file) => (
              <Paper key={file.fileId} variant="outlined"
                sx={{ p: { xs: 1.25, md: 1.5 }, borderRadius: 2, borderColor: 'warning.light' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
                  <Box sx={{ minWidth: { md: 170 } }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {file.archiveMonth} · {file.archiveDate}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {file.archiveSection || 'Archive file'}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography fontWeight={700} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      {file.fileName}
                    </Typography>
                    {(file.customerName || file.orderNumber) && (
                      <Typography variant="caption" color="text.secondary">
                        {file.customerName || 'Order'}{file.orderNumber ? ' #' + file.orderNumber : ''}
                      </Typography>
                    )}
                  </Box>
                  <Chip label={file.isTemporaryOrder ? 'Temp · Pending' : file.isDraft ? 'Draft · Pending' : 'Pending confirmation'}
                    size="small" color="warning" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
                  {file.canConfirmOrder ? (
                    <Button size="small" variant="contained" color="warning" startIcon={<ReceiptLongRoundedIcon />}
                      onClick={() => setConfirmArchiveFile(file)} sx={{ textTransform: 'none', flexShrink: 0 }}>
                      Confirm MIS Order
                    </Button>
                  ) : (
                    <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 140 }}>
                      Review in Workflow → Archive
                    </Typography>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
          {archiveSnapshot && archiveFiltered.length > 0 && (
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="center" spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Showing {archiveVisible.length} of {archiveFiltered.length} matching · {archivePending.length} pending in Archive
              </Typography>
              {archiveVisible.length < archiveFiltered.length && (
                <Button size="small" variant="outlined" onClick={() => setArchivePageSize((n) => n + ARCHIVE_PAGE_SIZE)}>
                  Show more
                </Button>
              )}
            </Stack>
          )}
        </>
      ) : (
        <>

      {error && <Alert severity="error" action={<Button size="small" onClick={() => load(false)}>Retry</Button>}>{error}</Alert>}
      {busy && snapshot.rows.length === 0 && <CircularProgress size={26} sx={{ alignSelf: 'center', my: 3 }} />}

      {!busy && !error && snapshot.rows.length === 0 && (
        <Alert severity="success">No pending bills. All delivered orders found are already billed.</Alert>
      )}

      <Stack spacing={0.75}>
        {filtered.map((order) => (
          <Paper key={orderKey(order)} variant="outlined" sx={{ p: { xs: 1.25, md: 1.5 }, borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
              <Box sx={{ minWidth: { md: 110 } }}>
                <Typography fontWeight={800} variant="body2">#{order.Order_Number || '—'}</Typography>
                <Typography color="text.secondary" variant="caption">{displayDate(deliveryDate(order))}</Typography>
              </Box>
              <Box sx={{ minWidth: { md: 150 }, flex: 1 }}>
                <Typography fontWeight={700} variant="body2">{order.Customer_name || 'Customer not assigned'}</Typography>
                <Typography color="text.secondary" variant="caption" sx={{ wordBreak: 'break-word' }}>
                  {order.orderNote || 'No order remark'}
                </Typography>
              </Box>
              <Chip label="Not billed" size="small" color="warning" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
              <Button size="small" variant="contained" startIcon={<ReceiptLongRoundedIcon />}
                onClick={() => setSelectedOrder(order)} sx={{ textTransform: 'none', flexShrink: 0 }}>
                Create Bill
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {snapshot.rows.length > 0 && (
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="center" spacing={1}>
          <Typography variant="caption" color="text.secondary">
            Showing {snapshot.rows.length} of {snapshot.total} pending orders
          </Typography>
          {snapshot.hasMore && (
            <Button size="small" variant="outlined" onClick={() => load(true)} disabled={busy}>
              {busy ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </Stack>
      )}


        </>
      )}

      {selectedOrder && (
        <UpdateDelivery
          mode="edit"
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onOrderPatched={(id, patch) => { if (hasInvoiceLines(patch?.Items)) markBilled(id); }}
          onOrderReplaced={(order) => { if (hasInvoiceLines(order?.Items)) markBilled(orderKey(order)); }}
          onSaved={(saved) => {
            markBilled(saved?.Order_uuid || orderKey(selectedOrder));
            setSelectedOrder(null);
          }}
        />
      )}
      {confirmArchiveFile && (
        <Suspense fallback={<CircularProgress size={20} sx={{ alignSelf: 'center' }} />}>
          <ArchiveConfirmDialog
            open
            file={confirmArchiveFile}
            fromArchive
            cacheScope={userName}
            onClose={() => setConfirmArchiveFile(null)}
            onSuccess={handleArchiveConfirmed}
          />
        </Suspense>
      )}
    </Stack>
  );
}
