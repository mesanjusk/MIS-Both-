import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography
} from '@mui/material';
import { bulkUpdateWeddingCardRows } from '../../services/weddingCardService';

// Each edited row is a different SKU. No global "set every SKU to the same
// value" behaviour: the user can edit individual cells and submit once.
export const SPREADSHEET_COLUMNS = [
  { field: 'originalPrice', label: 'Supplier / card', width: 116, limit: 10000000 },
  { field: 'markupPercent', label: 'Increase %', width: 104, limit: 1000 },
  { field: 'discountPercent', label: 'Discount %', width: 104, limit: 100 },
  { field: 'printingCharge', label: 'Print / 100', width: 110, limit: 10000000 },
  { field: 'packingCharge', label: 'Pack / 100', width: 110, limit: 10000000 },
  { field: 'designCharge', label: 'Design once', width: 110, limit: 10000000 },
  { field: 'nameLabelCharge', label: 'Name label / pc', width: 115, limit: 10000000 },
  { field: 'otherCharge', label: 'Other / unit', width: 112, limit: 10000000 },
  { field: 'otherServiceName', label: 'Other service name', width: 172 },
];
const NUMERIC_FIELDS = SPREADSHEET_COLUMNS.filter(c => c.limit != null).map(c => c.field);
const DEFAULTS = {
  originalPrice: 0, markupPercent: 10, discountPercent: 0,
  printingCharge: 0, packingCharge: 0, designCharge: 0,
  nameLabelCharge: 0, otherCharge: 0, otherServiceName: 'Other'
};
const rowId = row => row.brand + ':' + row.code;
const editableData = row => Object.fromEntries(SPREADSHEET_COLUMNS.map(({ field }) =>
  [field, String(row[field] ?? DEFAULTS[field])]
));
const toNumber = str => Number(str);
const validValue = (column, value) => column.limit == null
  ? value.length <= 45
  : value.trim() !== '' && Number.isFinite(toNumber(value)) &&
    toNumber(value) >= 0 && toNumber(value) <= column.limit;
export const changedFields = (original, current) => {
  const changes = {};
  const expected = {};
  for (const { field, limit } of SPREADSHEET_COLUMNS) {
    const oldVal = original[field];
    const newVal = current[field];
    if (limit == null ? oldVal.trim() === newVal.trim()
      : Number(oldVal) === Number(newVal)) continue;
    changes[field] = limit == null ? newVal.trim() : Number(newVal);
    expected[field] = limit == null ? oldVal.trim() : Number(oldVal);
  }
  return { changes, expected };
};
const baseExample = row => {
  const amount = Number(row.originalPrice) * (1 + Number(row.markupPercent) / 100)
    * (1 - Number(row.discountPercent) / 100);
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  return round(round(amount) * 100 + Number(row.printingCharge) +
    Number(row.packingCharge) + Number(row.designCharge));
};

export default function WeddingBulkSpreadsheetDialog({ open, rows, onClose, onSaved }) {
  const [working, setWorking] = useState({});
  const [originals, setOriginals] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);

  useEffect(() => {
    if (!open) return;
    const first = Object.fromEntries(rows.map(row => [rowId(row), editableData(row)]));
    setOriginals(first);
    setWorking(first);
    setBusy(false);
    setError('');
    setReview(false);
  }, [open, rows]);

  const changes = useMemo(() => rows.map(row => {
    const id = rowId(row);
    if (!working[id] || !originals[id]) return null;
    const update = changedFields(originals[id], working[id]);
    return Object.keys(update.changes).length
      ? { id, brand: row.brand, code: row.code, ...update } : null;
  }).filter(Boolean), [rows, originals, working]);

  const invalid = useMemo(() => rows.flatMap(row => {
    const current = working[rowId(row)];
    if (!current) return [];
    return SPREADSHEET_COLUMNS.filter(col => !validValue(col, current[col.field]))
      .map(col => row.brand + '-' + row.code + ': ' + col.label);
  }), [rows, working]);

  const changeCell = (id, field, value) => {
    setWorking(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setReview(false);
  };

  const pasteGrid = (event, rowIndex, colIndex) => {
    const clipboard = event.clipboardData.getData('text/plain');
    if (!clipboard.includes('\t') && !clipboard.includes('\n')) return;
    event.preventDefault();
    const matrix = clipboard.trimEnd().split(/\r?\n/).map(line => line.split('\t'));
    setWorking(prev => {
      const next = { ...prev };
      matrix.forEach((cells, dy) => {
        const target = rows[rowIndex + dy];
        if (!target) return;
        const id = rowId(target);
        const row = { ...next[id] };
        cells.forEach((value, dx) => {
          const column = SPREADSHEET_COLUMNS[colIndex + dx];
          if (column) row[column.field] = value.trim();
        });
        next[id] = row;
      });
      return next;
    });
    setReview(false);
  };

  const saveAll = async () => {
    if (invalid.length) return setError('Fix invalid cells before saving: ' + invalid.slice(0, 4).join(', '));
    if (!changes.length) return setError('No edited values to save.');
    if (!review) { setReview(true); setError(''); return; }
    setBusy(true);
    try {
      const updated = await bulkUpdateWeddingCardRows(changes.map(({ brand, code, changes: fields, expected }) =>
        ({ brand, code, changes: fields, expected })
      ));
      setReview(false);
      setError('');
      await onSaved(updated.updated);
    } catch (err) {
      setReview(false);
      setError(err.response?.data?.message || 'Bulk update failed. No rows were intentionally changed. Refresh and retry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xl" fullWidth
      PaperProps={{ sx: { height: { xs: '94vh', md: '82vh' } } }}>
      <DialogTitle sx={{ pb: 1 }}>Wedding Card · Bulk Edit Spreadsheet</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Edit different values in each row, Tab between cells, or paste a block copied from Excel.
          Card numbers cannot be changed here. Nothing is saved until you confirm.
        </Typography>
        <Stack direction="row" gap={1} sx={{ mb: 1 }} flexWrap="wrap">
          <Chip size="small" label={rows.length + ' selected cards'} />
          <Chip size="small" color={changes.length ? 'primary' : 'default'}
            label={changes.length + ' changed rows'} />
          {invalid.length > 0 && <Chip color="error" size="small" label={invalid.length + ' invalid cells'} />}
          <Button size="small" variant="outlined" disabled={busy || !changes.length}
            onClick={() => { setWorking(originals); setReview(false); setError(''); }}>
            Reset all edits
          </Button>
        </Stack>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>{error}</Alert>}
        <TableContainer component={Paper} variant="outlined"
          sx={{ flex: 1, minHeight: 150, overflow: 'auto', borderRadius: 1.5 }}>
          <Table size="small" stickyHeader sx={{
            minWidth: 1380,
            '& td, & th': { borderRight: '1px solid', borderColor: 'divider', padding: '5px' }
          }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ position: 'sticky', left: 0, zIndex: 4, bgcolor: 'background.paper',
                  fontWeight: 900, minWidth: 120 }}>SK / Card No.</TableCell>
                {SPREADSHEET_COLUMNS.map(column => (
                  <TableCell key={column.field} align="center" sx={{
                    minWidth: column.width, fontWeight: 800, fontSize: 11, whiteSpace: 'normal'
                  }}>{column.label}</TableCell>
                ))}
                <TableCell align="right" sx={{ minWidth: 120, fontWeight: 800 }}>
                  100-card quote*
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, rowIndex) => {
                const id = rowId(row);
                const data = working[id];
                const before = originals[id];
                const changed = Boolean(changes.find(c => c.id === id));
                if (!data) return null;
                return (
                  <TableRow key={id} hover sx={{ bgcolor: changed ? 'action.hover' : undefined }}>
                    <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper',
                      fontWeight: 800, whiteSpace: 'nowrap' }}>
                      SK ({row.brand}) {row.code}
                    </TableCell>
                    {SPREADSHEET_COLUMNS.map((col, colIndex) => {
                      const edited = col.limit == null
                        ? data[col.field].trim() !== before[col.field].trim()
                        : Number(data[col.field]) !== Number(before[col.field]);
                      const bad = !validValue(col, data[col.field]);
                      return (
                        <TableCell key={col.field} sx={{ minWidth: col.width, p: '3px !important',
                          bgcolor: bad ? 'error.light' : edited ? 'action.selected' : undefined }}>
                          <TextField size="small" fullWidth variant="outlined"
                            type={col.limit == null ? 'text' : 'number'}
                            value={data[col.field]} error={bad}
                            inputProps={{
                              'aria-label': 'SK ' + row.brand + ' ' + row.code + ' ' + col.label,
                              ...(col.limit == null ? { maxLength: 45 } :
                                { min: 0, max: col.limit, step: '0.01' }),
                              style: { padding: '7px 6px', fontSize: 12 }
                            }}
                            disabled={busy}
                            onPaste={event => pasteGrid(event, rowIndex, colIndex)}
                            onChange={event => changeCell(id, col.field, event.target.value)}
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell align="right" sx={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {SPREADSHEET_COLUMNS.every(col => validValue(col, data[col.field]))
                        ? '₹' + baseExample(data).toFixed(2) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          * Preview for 100 cards: selling card subtotal + printing /100 + packing /100 + one-time design.
          Name Label and Other are optional and are not included unless selected in the quote.
        </Typography>
        {review && <Alert severity="warning" sx={{ mt: 1 }}>
          Review: {changes.length} modified cards will be updated together. Changes remain editable;
          press <strong>Confirm &amp; Update All</strong> again to save.
        </Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !changes.length || invalid.length > 0}
          onClick={saveAll}>{busy ? 'Updating…' : review
            ? 'Confirm & Update All (' + changes.length + ')'
            : 'Review Changes (' + changes.length + ')'}</Button>
      </DialogActions>
    </Dialog>
  );
}
