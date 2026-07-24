import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import toast from 'react-hot-toast';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
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
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import { fetchRateCards } from '../services/rateCardService';
import { computeRateCardAmount, computeGst } from '../utils/rateCardPricing';

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;

export default function RateCalculator() {
  const [rateCards, setRateCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState('');

  const [selectedId, setSelectedId] = useState('');
  const [widthFt, setWidthFt] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [qty, setQty] = useState(1);

  const [lines, setLines] = useState([]);

  const printRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Rate Quote',
    pageStyle: '@media print { .no-print { display: none !important; } }',
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchRateCards(true);
        setRateCards(Array.isArray(data) ? data : []);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Unable to load rate cards');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedCard = useMemo(
    () => rateCards.find((r) => r.rateCard_uuid === selectedId) || null,
    [rateCards, selectedId]
  );

  const preview = useMemo(() => {
    if (!selectedCard) return null;
    return computeRateCardAmount(selectedCard, { widthFt, heightFt, qty });
  }, [selectedCard, widthFt, heightFt, qty]);

  const belowMinQty = selectedCard && Number(qty) > 0 && Number(qty) < Number(selectedCard.minQty || 0);

  const addLine = () => {
    if (!selectedCard) return toast.error('Select an item first');
    if (!qty || Number(qty) <= 0) return toast.error('Enter a valid quantity');
    if (!preview || preview.error) return toast.error(preview?.error || 'Unable to compute price');

    const { gst, total } = computeGst(preview.amount, selectedCard.gstPercent);
    setLines((prev) => [
      ...prev,
      {
        key: `${selectedCard.rateCard_uuid}-${Date.now()}`,
        itemName: selectedCard.itemName,
        pricingType: selectedCard.pricingType,
        widthFt: selectedCard.pricingType === 'per_sqft' ? Number(widthFt) || 0 : null,
        heightFt: selectedCard.pricingType === 'per_sqft' ? Number(heightFt) || 0 : null,
        sqft: preview.sqft || null,
        qty: Number(qty),
        unit: selectedCard.unit,
        amount: preview.amount,
        gstPercent: selectedCard.gstPercent || 0,
        gst,
        total,
      },
    ]);
    setWidthFt('');
    setHeightFt('');
    setQty(1);
  };

  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));
  const clearAll = () => setLines([]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
    const gstTotal = lines.reduce((sum, l) => sum + l.gst, 0);
    return { subtotal, gstTotal, grandTotal: subtotal + gstTotal };
  }, [lines]);

  const copySummary = async () => {
    if (lines.length === 0) return toast.error('Add at least one item to the quote');
    const rows = lines.map((l) => {
      const dims = l.pricingType === 'per_sqft' ? ` (${l.widthFt}ft x ${l.heightFt}ft = ${l.sqft.toFixed(2)} sq.ft)` : '';
      return `${l.itemName}${dims} x ${l.qty} ${l.unit} = ${money(l.total)}`;
    });
    const text = [
      customerName ? `Quote for: ${customerName}` : 'Rate Quote',
      ...rows,
      '',
      `Subtotal: ${money(totals.subtotal)}`,
      `GST: ${money(totals.gstTotal)}`,
      `Grand Total: ${money(totals.grandTotal)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Quote summary copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, bgcolor: 'background.default', minHeight: '100%' }}>
      <Paper elevation={0} sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <CalculateRoundedIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h5" fontWeight={900} color="primary.main">Rate Calculator</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Quick pricing for cards, flex, banners and other print items using rates from the Rate Card Master.
        </Typography>

        <TextField
          label="Customer / Quote For (optional)"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          size="small"
          sx={{ maxWidth: 360, mb: 1.5 }}
          fullWidth
        />

        <Divider sx={{ mb: 1.5 }} />

        {loading ? (
          <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : rateCards.length === 0 ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            No rate cards found. Ask an admin to set up items and rates in Rate Card Master first.
          </Alert>
        ) : (
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, mb: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} flexWrap="wrap" alignItems="flex-start">
              <TextField
                select
                label="Item"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                size="small"
                sx={{ minWidth: 220, flex: 1 }}
              >
                <MenuItem value="">Select item</MenuItem>
                {rateCards.map((rc) => (
                  <MenuItem key={rc.rateCard_uuid} value={rc.rateCard_uuid}>
                    {rc.itemName}{rc.category ? ` (${rc.category})` : ''}
                  </MenuItem>
                ))}
              </TextField>

              {selectedCard?.pricingType === 'per_sqft' && (
                <>
                  <TextField label="Width (ft)" type="number" size="small" value={widthFt} onChange={(e) => setWidthFt(e.target.value)} sx={{ width: 120 }} />
                  <TextField label="Height (ft)" type="number" size="small" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} sx={{ width: 120 }} />
                </>
              )}

              <TextField label="Quantity" type="number" size="small" value={qty} onChange={(e) => setQty(e.target.value)} sx={{ width: 110 }} />

              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={addLine} sx={{ borderRadius: 2.5, height: 40 }}>
                Add to Quote
              </Button>
            </Stack>

            {selectedCard && (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 1.25 }}>
                {selectedCard.pricingType === 'per_sqft' && (
                  <Chip size="small" variant="outlined" label={`Rate: ₹${selectedCard.ratePerSqft}/sq.ft${selectedCard.minBillingSqft ? ` (min ${selectedCard.minBillingSqft} sq.ft)` : ''}`} />
                )}
                {selectedCard.pricingType === 'per_piece' && (
                  <Chip size="small" variant="outlined" label={`Rate: ₹${selectedCard.ratePerPiece}/pc`} />
                )}
                {selectedCard.pricingType === 'slab' && (
                  <Chip size="small" variant="outlined" label={preview?.matchedSlab ? `Slab: ${preview.matchedSlab.minQty}-${preview.matchedSlab.maxQty || '∞'}` : 'No matching slab'} />
                )}
                {preview?.sqft ? <Chip size="small" variant="outlined" label={`${preview.sqft.toFixed(2)} sq.ft`} /> : null}
                {belowMinQty && <Chip size="small" color="warning" label={`Below min order qty (${selectedCard.minQty})`} />}
                {preview && !preview.error && (
                  <Typography variant="subtitle2" fontWeight={900} color="primary.main">
                    Amount: {money(preview.amount)}
                  </Typography>
                )}
                {preview?.error && <Alert severity="warning" sx={{ py: 0, borderRadius: 2 }}>{preview.error}</Alert>}
              </Stack>
            )}
          </Paper>
        )}

        <Box ref={printRef} sx={{ p: { xs: 0, md: 0.5 } }}>
          <Typography variant="subtitle1" fontWeight={900} sx={{ mb: 1 }}>
            Quote{customerName ? ` — ${customerName}` : ''}
          </Typography>

          {lines.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No items added yet.</Typography>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 900 }}>Item</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Size / Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>Amount</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>GST</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }} className="no-print">Remove</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.key} hover>
                      <TableCell>{l.itemName}</TableCell>
                      <TableCell>
                        {l.pricingType === 'per_sqft'
                          ? `${l.widthFt}ft x ${l.heightFt}ft (${l.sqft.toFixed(2)} sq.ft) x ${l.qty}`
                          : `${l.qty} ${l.unit}`}
                      </TableCell>
                      <TableCell align="right">{money(l.amount)}</TableCell>
                      <TableCell align="right">{money(l.gst)}</TableCell>
                      <TableCell align="right">{money(l.total)}</TableCell>
                      <TableCell align="right" className="no-print">
                        <Tooltip title="Remove">
                          <IconButton size="small" color="error" onClick={() => removeLine(l.key)}>
                            <DeleteRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {lines.length > 0 && (
            <Stack alignItems="flex-end" spacing={0.5} sx={{ mt: 1.5 }}>
              <Typography variant="body2">Subtotal: {money(totals.subtotal)}</Typography>
              <Typography variant="body2">GST: {money(totals.gstTotal)}</Typography>
              <Typography variant="h6" fontWeight={900} color="primary.main">Grand Total: {money(totals.grandTotal)}</Typography>
            </Stack>
          )}
        </Box>

        {lines.length > 0 && (
          <Stack direction="row" spacing={1.25} sx={{ mt: 2 }} className="no-print">
            <Button variant="outlined" startIcon={<ContentCopyRoundedIcon />} onClick={copySummary} sx={{ borderRadius: 2.5 }}>
              Copy Summary
            </Button>
            <Button variant="outlined" startIcon={<PrintRoundedIcon />} onClick={handlePrint} sx={{ borderRadius: 2.5 }}>
              Print Quote
            </Button>
            <Button color="error" onClick={clearAll} sx={{ borderRadius: 2.5 }}>
              Clear All
            </Button>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
