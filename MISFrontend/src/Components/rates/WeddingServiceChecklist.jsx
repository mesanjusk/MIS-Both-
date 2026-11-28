import {
  Box, Checkbox, CircularProgress, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography
} from '@mui/material';

const formatMoney = amount => '₹' + (Number(amount) || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const formatQty = value => Number.isInteger(Number(value))
  ? String(value) : Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

const EMPTY_ROWS = [
  ['card', 'CARD RATE'], ['design', 'DESIGNING'], ['printing', 'PRINTING'],
  ['packing', 'PACKING'], ['nameLabel', 'NAME LABEL'], ['other', 'OTHER']
];

export default function WeddingServiceChecklist({
  brand, brandLabel, code, quote, qty, selected, onToggle, nameLabelQty,
  onNameLabelQty, otherQty, onOtherQty, deliveryDays, onDeliveryDays,
  loading = false, isAdmin = false,
}) {
  const linesById = Object.fromEntries((quote?.lines || []).map(row => [row.key, row]));
  const rows = EMPTY_ROWS.map(([key, fallback]) =>
    linesById[key] || { key, label: fallback, selected: selected[key], qty: 0, rate: 0, total: 0 });
  const editableQty = (key) => key === 'nameLabel' || key === 'other';
  return (
    <Paper variant="outlined" sx={{ mt: 1.5, borderRadius: 2, bgcolor: '#fff', overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 1.25, md: 2 }, py: 1.1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#252525', letterSpacing: '-0.01em' }}>
            {brandLabel || 'SK(' + brand + ')'} {code}
          </Typography>
          {isAdmin && quote?.codedPrice && (
            <Typography sx={{ fontWeight: 800, color: '#3c3c3c', fontSize: 15 }}>
              {quote.codedPrice}
            </Typography>
          )}
        </Stack>
      </Box>
      <Box sx={{ height: '1px', bgcolor: '#444', mx: 1 }} />
      <Table size="small" sx={{
        width: '100%',
        tableLayout: 'fixed',
        '& td, & th': { py: 0.5, px: { xs: 0.4, sm: 0.8 }, borderBottom: 'none' },
      }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: { xs: '40%', sm: '43%' }, fontSize: 11, color: '#777' }}>SERVICE</TableCell>
            <TableCell align="center" sx={{ width: '19%', fontSize: 11, color: '#777' }}>QTY</TableCell>
            <TableCell align="right" sx={{ width: '19%', fontSize: 11, color: '#777' }}>RATE</TableCell>
            <TableCell align="right" sx={{ width: '22%', fontSize: 11, color: '#777' }}>TOTAL</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => {
            const enabled = selected[row.key] !== false;
            const label = row.key === 'other' && row.label ? row.label : row.label.toUpperCase();
            return (
              <TableRow key={row.key} sx={{ opacity: enabled ? 1 : 0.55 }}>
                <TableCell>
                  <Stack direction="row" alignItems="center" gap={0} sx={{ minWidth: 0 }}>
                    <Checkbox
                      size="small" checked={enabled} onChange={e => onToggle(row.key, e.target.checked)}
                      inputProps={{ 'aria-label': 'Include ' + label }}
                      sx={{ p: '5px', color: '#444', '&.Mui-checked': { color: '#252525' } }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ fontSize: { xs: 11, sm: 13 }, overflowWrap: 'anywhere' }}>
                        {label}
                      </Typography>
                      {(row.key === 'printing' || row.key === 'packing') && (
                        <Typography sx={{ fontSize: 10, color: '#777' }}>per 100 cards</Typography>
                      )}
                      {row.key === 'design' && <Typography sx={{ fontSize: 10, color: '#777' }}>one time</Typography>}
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell align="center">
                  {editableQty(row.key) ? (
                    <TextField size="small" type="number" disabled={!enabled}
                      aria-label={row.key === 'nameLabel' ? 'Name label quantity' : 'Other service quantity'}
                      inputProps={{ min: 0, max: 1000000, step: 1, style: { textAlign: 'center', padding: '5px 1px', fontSize: 12 } }}
                      value={row.key === 'nameLabel' ? nameLabelQty : otherQty}
                      onChange={e => (row.key === 'nameLabel' ? onNameLabelQty : onOtherQty)(e.target.value)}
                      sx={{ width: '100%' }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: { xs: 11, sm: 13 } }}>{formatQty(row.qty)}</Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Typography sx={{ fontSize: { xs: 10.5, sm: 13 }, whiteSpace: 'nowrap' }}>
                    {formatMoney(row.rate)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography fontWeight={700} sx={{ fontSize: { xs: 10.5, sm: 13 }, whiteSpace: 'nowrap' }}>
                    {formatMoney(row.total)}
                  </Typography>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Box sx={{ height: '1px', bgcolor: '#444', mx: 1 }} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}
        sx={{ px: { xs: 1.3, md: 2 }, py: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="body2" fontWeight={700}>Delivery</Typography>
          <TextField size="small" type="number" value={deliveryDays} onChange={e => onDeliveryDays(e.target.value)}
            placeholder="Days" aria-label="Delivery in days"
            inputProps={{ min: 0, max: 3650, step: 1, style: { padding: 5, fontSize: 12 } }}
            sx={{ width: 72 }} />
          <Typography variant="caption" color="text.secondary">days</Typography>
        </Stack>
        <Stack alignItems="flex-end" gap={0.2}>
          <Typography variant="caption" fontWeight={700}>GRAND TOTAL</Typography>
          <Stack direction="row" alignItems="center" gap={0.8}>
            {loading && <CircularProgress size={14} />}
            <Typography variant="h6" fontWeight={900}>
              {quote ? formatMoney(quote.amount) : '—'}
            </Typography>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}
