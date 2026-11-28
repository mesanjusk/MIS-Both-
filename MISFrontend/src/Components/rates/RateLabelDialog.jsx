import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography
} from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { downloadRateLabelPdf, getLabelLayout, isWeddingJobLayoutLegible } from '../../utils/rateLabelPdf';

const money = amount => '₹' + (Number(amount) || 0).toFixed(2);

export default function RateLabelDialog({ open, onClose, item, quote, quantity, isAdmin }) {
  const [orientation, setOrientation] = useState('portrait');
  const [columns, setColumns] = useState('2');
  const [rows, setRows] = useState('5');
  const [count, setCount] = useState('10');
  const [priceMode, setPriceMode] = useState('job');
  const [showInternalCode, setShowInternalCode] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const geometry = useMemo(() => {
    try { return getLabelLayout({ columns, rows, orientation }); } catch { return null; }
  }, [columns, rows, orientation]);
  useEffect(() => {
    if (geometry) setCount(String(geometry.perPage));
  }, [geometry?.perPage]);
  useEffect(() => { if (open) setError(''); }, [open]);

  const isWedding = item?.type === 'wedding';
  const breakdown = quote?.breakdown;
  const total = Number(quote?.amount);
  const qty = Number(quantity);
  const baseAvailable = Boolean(isAdmin && isWedding && breakdown);
  const isJob = isWedding && priceMode === 'job';
  const layoutValid = Boolean(geometry && (!isJob || isWeddingJobLayoutLegible(geometry)));
  const price = priceMode === 'base' && baseAvailable
    ? breakdown.discountedUnitPrice
    : priceMode === 'total' || !isWedding
      ? total
      : qty > 0 ? Math.round((total / qty + Number.EPSILON) * 100) / 100 : NaN;
  const labelItem = {
    type: isJob ? 'job' : (isWedding ? 'wedding' : 'other'),
    brand: item?.brand || '',
    brandLabel: item?.brandLabel || '',
    code: item?.code || '',
    name: isWedding ? 'Wedding Card' : (item?.itemName || item?.name || 'SK Digital Product') +
      ' (Qty ' + qty + ')',
    codedPrice: showInternalCode && baseAvailable ? quote?.codedPrice : '',
    lines: isJob ? quote?.lines : undefined,
    deliveryDays: isJob ? quote?.deliveryDays : undefined,
    grandTotal: isJob ? quote?.amount : undefined,
    price,
  };

  const download = () => {
    setError('');
    if (!layoutValid) return setError(isJob
      ? 'Job slips need labels at least 78 × 47 mm. Try 2 columns × 5 rows on A4 portrait.'
      : 'Reduce rows/columns: labels must remain legible on A4.');
    try {
      setExporting(true);
      downloadRateLabelPdf({
        item: labelItem, rows: geometry.rows, columns: geometry.columns,
        orientation, count: Number(count)
      });
    } catch (e) {
      setError(e.message || 'Unable to export labels.');
    } finally {
      setExporting(false);
    }
  };
  const countValid = Number.isSafeInteger(Number(count)) && Number(count) > 0 && Number(count) <= 5000;
  const pages = layoutValid && countValid ? Math.ceil(Number(count) / geometry.perPage) : 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Download printable price labels</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Stack spacing={1.6}>
          <Typography variant="body2" color="text.secondary">
            {isWedding ? 'Wedding Card · ' + (item.brandLabel || 'SK (' + item.brand + ')') + ' · No. ' + item.code
              : item?.itemName || 'Rate Card Item'}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField select size="small" fullWidth label="Paper orientation"
              value={orientation} onChange={e => setOrientation(e.target.value)}>
              <MenuItem value="portrait">A4 Portrait</MenuItem>
              <MenuItem value="landscape">A4 Landscape</MenuItem>
            </TextField>
            <TextField size="small" fullWidth type="number" label="Columns"
              inputProps={{ min: 1, max: 8, step: 1 }}
              value={columns} onChange={e => setColumns(e.target.value)} />
            <TextField size="small" fullWidth type="number" label="Rows"
              inputProps={{ min: 1, max: 12, step: 1 }}
              value={rows} onChange={e => setRows(e.target.value)} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField size="small" fullWidth label="Number of labels to print"
              type="number" inputProps={{ min: 1, max: 5000, step: 1 }}
              value={count} onChange={e => setCount(e.target.value)} />
            <TextField select size="small" fullWidth label="Price printed on label"
              value={priceMode} onChange={e => setPriceMode(e.target.value)}>
              {isWedding && <MenuItem value="job">Itemized job slip (same as reference)</MenuItem>}
              {isWedding && <MenuItem value="effective">Effective per card (all charges)</MenuItem>}
              {baseAvailable && <MenuItem value="base">Card selling price (excl. extra charges)</MenuItem>}
              <MenuItem value="total">{isWedding ? 'Full order total' : 'Calculated quote total'}</MenuItem>
            </TextField>
          </Stack>
          {baseAvailable && (
            <FormControlLabel control={
              <input type="checkbox" checked={showInternalCode}
                onChange={e => setShowInternalCode(e.target.checked)} />
            } label="Print internal NAGPURCITY supplier code (admin only)" />
          )}
          {layoutValid && countValid ? (
            <Stack spacing={0.75}>
              <Typography variant="body2">
                <strong>{geometry.columns} × {geometry.rows} = {geometry.perPage} labels/page</strong>
                {' · '}{pages} A4 page{pages === 1 ? '' : 's'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Each label: {geometry.labelWidth.toFixed(1)} × {geometry.labelHeight.toFixed(1)} mm.
                Print at 100% Actual Size without scaling.
                {isJob ? ' Six service rows with checkboxes, delivery days and grand total.' : ''}
              </Typography>
              <Box sx={{
                border: '1px solid', borderColor: 'divider',
                p: 1, borderRadius: 1.5, maxHeight: 180, overflow: 'hidden'
              }}>
                <Box sx={{
                  display: 'grid', gridTemplateColumns: 'repeat(' + geometry.columns + ', 1fr)',
                  gap: '3px', maxWidth: 280, mx: 'auto'
                }}>
                  {Array.from({ length: Math.min(geometry.perPage, 24, Number(count)) }, (_, i) => (
                    <Box key={i} sx={{
                      border: '1px solid #c88a32', bgcolor: '#fffcf7', borderRadius: 0.5,
                      aspectRatio: geometry.labelWidth + '/' + geometry.labelHeight,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', overflow: 'hidden'
                    }}>
                      <Typography sx={{ fontWeight: 800, color: '#804c16', fontSize: 7, whiteSpace: 'nowrap' }}>
                        {isWedding ? 'SK (' + item.brand + ')' : 'SK DIGITAL'}
                      </Typography>
                      <Typography sx={{ color: '#b73822', fontWeight: 800, fontSize: 7 }}>
                        {isWedding ? item.code : 'Product'}
                      </Typography>
                      {isJob && <Typography sx={{ fontSize: 4.5, color: '#333', textAlign: 'center' }}>
                        Card / Design / Print / Pack / Name / Other
                      </Typography>}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Typography variant="body2">Label price: <strong>{money(price)}</strong></Typography>
            </Stack>
          ) : <Alert severity="warning">{isJob && geometry && !isWeddingJobLayoutLegible(geometry)
            ? 'Job slip format needs larger labels. Try 2 columns × 5 rows on A4 portrait.'
            : 'Choose valid rows, columns and 1–5,000 labels.'}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" startIcon={<DownloadRoundedIcon />} disabled={!layoutValid || !countValid || exporting || !Number.isFinite(price) || (isJob && !quote?.lines?.length)}
          onClick={download}>Download PDF</Button>
      </DialogActions>
    </Dialog>
  );
}
