import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { SearchRounded, VerifiedRounded, WarningAmberRounded } from '@mui/icons-material';
import toast from 'react-hot-toast';

import client from '../apiClient';

const API_BASE = '/api/api-usage/database-integrity';

function prettyDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function RecordSummary({ record, selected, onClick }) {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 1.5,
        cursor: 'pointer',
        borderColor: selected ? 'success.main' : 'divider',
        bgcolor: selected ? 'success.50' : 'background.paper',
        '&:hover': { borderColor: 'success.light' },
      }}
    >
      <Stack direction="row" justifyContent="space-between" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap>{record.label || record.key || record.id}</Typography>
          {record.description && <Typography variant="caption" color="text.secondary" display="block" noWrap>{record.description}</Typography>}
          {record.currentAccountId && <Typography variant="caption" color="text.secondary" display="block" noWrap>Current: {record.currentAccountId}</Typography>}
        </Box>
        <Chip size="small" label={record.affectedCount || 1} />
      </Stack>
    </Paper>
  );
}

function OptionSearch({ kind, value, onChange, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q = query) => {
    setLoading(true);
    try {
      const endpoint = kind === 'item' ? 'item-options' : 'ledger-options';
      const { data } = await client.get(`${API_BASE}/review/${endpoint}`, { params: { q, limit: 60 } });
      setOptions(Array.isArray(data?.options) ? data.options : []);
    } catch (err) {
      toast.error(err?.response?.data?.message || `Could not search ${kind === 'item' ? 'items' : 'ledgers'}.`);
    } finally {
      setLoading(false);
    }
  }, [kind, query]);

  useEffect(() => {
    setQuery(initialQuery || '');
    setOptions([]);
    onChange('');
    if (initialQuery) search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, kind]);

  return (
    <Stack spacing={1.2}>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          fullWidth
          label={kind === 'item' ? 'Search catalog item' : 'Search ledger/customer/account'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') search(); }}
        />
        <Button variant="outlined" onClick={() => search()} disabled={loading} startIcon={loading ? <CircularProgress size={15} /> : <SearchRounded />}>
          Search
        </Button>
      </Stack>
      <FormControl size="small" fullWidth>
        <InputLabel>{kind === 'item' ? 'Choose catalog item' : 'Choose correct ledger'}</InputLabel>
        <Select
          value={value || ''}
          label={kind === 'item' ? 'Choose catalog item' : 'Choose correct ledger'}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <MenuItem key={option.uuid} value={option.uuid}>
              {option.name} {option.code || option.group ? `— ${option.code || option.group}` : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {!loading && options.length === 0 && (
        <Typography variant="caption" color="text.secondary">Type a name and click Search to choose an existing record. Nothing new is created here.</Typography>
      )}
    </Stack>
  );
}

export default function DatabaseIntegrityReviewDialog({ open, issue, onClose, onResolved }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [newCode, setNewCode] = useState('');
  const [lineIndex, setLineIndex] = useState('');

  const category = issue?.key || '';

  const load = useCallback(async () => {
    if (!open || !category) return;
    setLoading(true);
    try {
      const { data } = await client.get(`${API_BASE}/review/${category}`, { params: { page, limit: 25, search } });
      setReview(data?.review || null);
      const records = data?.review?.records || [];
      setSelectedId((current) => records.some((row) => (row.id || row.key) === current) ? current : (records[0]?.id || records[0]?.key || ''));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not load manual review records.');
      setReview(null);
    } finally {
      setLoading(false);
    }
  }, [open, category, page, search]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setPage(1);
    setSelectedOption('');
    setSelectedAccountId('');
    setNewCode('');
    setLineIndex('');
  }, [open, category]);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(() => {
    const rows = review?.records || [];
    return rows.find((row) => (row.id || row.key) === selectedId) || rows[0] || null;
  }, [review, selectedId]);

  useEffect(() => {
    setSelectedOption('');
    setSelectedAccountId('');
    setNewCode('');
    setLineIndex(selected?.orphanLines?.[0]?.index ?? '');
  }, [selectedId, selected]);

  const totalPages = Math.max(1, Math.ceil(Number(review?.total || 0) / Number(review?.limit || 25)));

  async function resolve() {
    if (!selected || !review?.resolver) return;
    let payload = { confirm: true };

    if (review.resolver === 'account_code') {
      if (!selectedAccountId || !newCode.trim()) return toast.error('Choose an account and enter its new unique code.');
      payload = { ...payload, accountId: selectedAccountId, newCode: newCode.trim() };
    } else if (review.resolver === 'ledger') {
      if (!selectedOption) return toast.error('Choose the correct ledger.');
      payload = { ...payload, recordId: selected.id, ledgerUuid: selectedOption };
    } else if (review.resolver === 'ledger_group') {
      if (!selectedOption) return toast.error('Choose the correct ledger.');
      payload = { ...payload, groupKey: selected.key, ledgerUuid: selectedOption };
    } else if (review.resolver === 'item_group') {
      if (!selectedOption) return toast.error('Choose the correct catalog item.');
      payload = { ...payload, groupKey: selected.key, itemUuid: selectedOption };
    } else if (review.resolver === 'transaction_ledger') {
      const line = (selected.orphanLines || []).find((row) => Number(row.index) === Number(lineIndex));
      if (!line || !selectedOption) return toast.error('Choose the orphan journal line and its correct ledger.');
      payload = {
        ...payload,
        recordId: selected.id,
        lineIndex: Number(line.index),
        expectedAccountId: line.accountId || '',
        ledgerUuid: selectedOption,
      };
    }

    const ok = window.confirm(
      'Apply this reviewed correction?\n\nThe system will update only the selected unresolved mapping. It will not delete, merge or renumber records.'
    );
    if (!ok) return;

    setSaving(true);
    try {
      const { data } = await client.post(`${API_BASE}/review/${category}/resolve`, payload);
      toast.success(data?.result?.message || 'Reviewed correction saved.');
      if (data?.report) onResolved?.(data.report);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not apply the reviewed correction.');
    } finally {
      setSaving(false);
    }
  }

  const initialOptionQuery = selected?.label || selected?.currentAccountId || selected?.description || '';

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" gap={2} alignItems="center">
          <Box>
            <Typography variant="h6" fontWeight={700}>{review?.title || issue?.label || 'Manual review'}</Typography>
            <Typography variant="caption" color="text.secondary">Review live records and apply only a verified correction.</Typography>
          </Box>
          <Chip color="warning" variant="outlined" label={`${Number(issue?.count || 0).toLocaleString()} issue(s)`} />
        </Stack>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ p: 0 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} minHeight={560}>
          <Box sx={{ width: { xs: '100%', md: 390 }, borderRight: { md: 1 }, borderColor: 'divider', p: 2 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
              <TextField size="small" fullWidth label="Filter this category" value={search} onChange={(event) => setSearch(event.target.value)} />
              <Button variant="outlined" onClick={() => { setPage(1); load(); }} startIcon={<SearchRounded />}>Find</Button>
            </Stack>
            {loading ? (
              <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={28} /></Stack>
            ) : (
              <Stack spacing={1}>
                {(review?.records || []).map((record) => (
                  <RecordSummary
                    key={record.id || record.key}
                    record={record}
                    selected={(record.id || record.key) === (selected?.id || selected?.key)}
                    onClick={() => setSelectedId(record.id || record.key)}
                  />
                ))}
                {(review?.records || []).length === 0 && <Alert severity="success">No unresolved records remain in this category.</Alert>}
              </Stack>
            )}
            {Number(review?.total || 0) > Number(review?.limit || 25) && (
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
                <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <Typography variant="caption">Page {page} / {totalPages}</Typography>
                <Button size="small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </Stack>
            )}
          </Box>

          <Box sx={{ flex: 1, p: 2.5, minWidth: 0 }}>
            {!selected ? (
              <Alert severity="info">Choose a record or group from the left.</Alert>
            ) : (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>{selected.label || selected.key || selected.id}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Affects {Number(selected.affectedCount || 1).toLocaleString()} record(s).
                  </Typography>
                </Box>

                {selected.examples?.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary">EXAMPLES</Typography>
                    {selected.examples.map((row, index) => (
                      <Typography key={index} variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>• {JSON.stringify(row)}</Typography>
                    ))}
                  </Paper>
                )}

                {category === 'duplicate_account_code' && (
                  <>
                    <Alert severity="warning">Choose which account should receive a new unique code. No account is merged or deleted.</Alert>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Account to change</InputLabel>
                      <Select value={selectedAccountId} label="Account to change" onChange={(event) => setSelectedAccountId(event.target.value)}>
                        {(selected.accounts || []).map((account) => (
                          <MenuItem key={account.id} value={account.id}>{account.name} — current {account.code}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField size="small" label="New unique account code" value={newCode} onChange={(event) => setNewCode(event.target.value)} />
                  </>
                )}

                {category === 'staff_ledger_unresolved' && (
                  <>
                    <Alert severity="info">Current legacy AccountID: <strong>{selected.currentAccountId || '—'}</strong></Alert>
                    <OptionSearch kind="ledger" value={selectedOption} onChange={setSelectedOption} initialQuery={selected.label || selected.currentAccountId || ''} />
                  </>
                )}

                {(category === 'diary_assignment_unresolved' || category === 'bank_assignment_unresolved') && (
                  <>
                    <Alert severity="info">Map all {selected.affectedCount} unresolved entries named <strong>{selected.label}</strong> to one verified existing ledger.</Alert>
                    <OptionSearch kind="ledger" value={selectedOption} onChange={setSelectedOption} initialQuery={selected.label || ''} />
                  </>
                )}

                {category === 'po_item_unresolved' && (
                  <>
                    <Alert severity="info">Map all {selected.affectedCount} unresolved PO line(s) named <strong>{selected.label}</strong> to one catalog item.</Alert>
                    <OptionSearch kind="item" value={selectedOption} onChange={setSelectedOption} initialQuery={selected.label || ''} />
                  </>
                )}

                {category === 'attendance_duplicate_day' && (
                  <>
                    <Alert severity="warning" icon={<WarningAmberRounded />}>
                      Inspect only. These are two or more historical attendance rows for the same employee/day. This screen intentionally provides no merge or delete button.
                    </Alert>
                    <Stack spacing={1}>
                      {(selected.records || []).map((row) => (
                        <Paper key={row.id} variant="outlined" sx={{ p: 1.5 }}>
                          <Typography variant="body2" fontWeight={700}>Record {row.recordId || row.attendanceUuid || row.id}</Typography>
                          <Typography variant="caption" color="text.secondary">{prettyDate(row.date)} · Status: {row.status || '—'} · Source: {row.source || '—'}</Typography>
                          {(row.punches || []).map((punch, index) => (
                            <Typography key={index} variant="caption" display="block">• {punch.type || 'Punch'} {punch.time || ''} {punch.source ? `(${punch.source})` : ''}</Typography>
                          ))}
                        </Paper>
                      ))}
                    </Stack>
                  </>
                )}

                {category === 'transaction_integrity' && (
                  <>
                    <Alert severity="warning">Only the selected journal line's ledger identity can be repaired here. Amount, debit/credit type and transaction totals are not editable.</Alert>
                    <Typography variant="body2">{selected.description || 'No description'} · {prettyDate(selected.date)}</Typography>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Journal line to repair</InputLabel>
                      <Select value={lineIndex === '' ? '' : String(lineIndex)} label="Journal line to repair" onChange={(event) => setLineIndex(event.target.value)}>
                        {(selected.orphanLines || []).map((line) => (
                          <MenuItem key={line.index} value={String(line.index)}>
                            Line {line.index + 1}: {line.accountName || line.accountId || 'Unknown'} — {line.type} {line.amount}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {(selected.issues || []).map((text, index) => <Typography key={index} variant="caption" color="warning.main">• {text}</Typography>)}
                    <OptionSearch kind="ledger" value={selectedOption} onChange={setSelectedOption} initialQuery={(selected.orphanLines || []).find((row) => Number(row.index) === Number(lineIndex))?.accountName || initialOptionQuery} />
                  </>
                )}

                {review?.note && <Alert severity="info">{review.note}</Alert>}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <Divider />
      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving}>Close</Button>
        {review?.resolver && selected && (
          <Button variant="contained" color="success" onClick={resolve} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <VerifiedRounded />}>
            Fix reviewed selection
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
