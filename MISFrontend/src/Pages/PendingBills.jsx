import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useAuth } from '../context/AuthContext';
import { fetchPendingBills } from '../services/orderService';
import UpdateDelivery from './updateDelivery';

const CACHE_PREFIX = 'mis.pendingBills.v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 100;
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

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" fontWeight={800}>Pending Bills</Typography>
            <Chip label={snapshot.total} size="small" color="warning" />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Delivered orders without an invoice. Create a bill to remove an order from this list.
          </Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={busy ? <CircularProgress size={16} /> : <RefreshRoundedIcon />}
          onClick={() => load(false)} disabled={busy} sx={{ textTransform: 'none', alignSelf: { xs: 'flex-start', sm: 'auto' } }}>
          Refresh
        </Button>
      </Stack>

      <TextField size="small" fullWidth value={search} onChange={(event) => setSearch(event.target.value)}
        placeholder="Search loaded orders by number, customer or remark"
        InputProps={{ startAdornment: <SearchRoundedIcon sx={{ mr: 1, color: 'text.disabled' }} /> }} />

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
    </Stack>
  );
}
