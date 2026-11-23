import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import toast from 'react-hot-toast';
import {
  Alert, Box, Button, CircularProgress, Divider, IconButton, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { useAuth } from '../context/AuthContext';
import { fetchRateCards } from '../services/rateCardService';
import { fetchWeddingCardRates, quoteWeddingCard } from '../services/weddingCardService';
import WeddingCardCatalog from '../Components/rates/WeddingCardCatalog';
import { computeRateCardAmount, computeGst } from '../utils/rateCardPricing';

const money = (n) => '₹' + (Number(n) || 0).toFixed(2);
const roundMoney = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const idFor = row => row.type === 'wedding'
  ? 'wedding:' + row.brand + ':' + row.code
  : 'other:' + row.rateCard_uuid;
const toLabel = row => row.type === 'wedding'
  ? 'Wedding Card / SK (' + row.brand + ') / No. ' + row.code
  : row.itemName + (row.category ? ' / ' + row.category : '');

export default function RateCalculator() {
  const { isSuperAdmin } = useAuth();
  const [rateCards, setRateCards] = useState([]);
  const [weddingCodes, setWeddingCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [qty, setQty] = useState('100');
  const [widthFt, setWidthFt] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [weddingQuote, setWeddingQuote] = useState(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [lines, setLines] = useState([]);

  const printRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Rate Quote',
    pageStyle: '@media print { .no-print { display: none !important; } }',
  });

  const load = async () => {
    setLoading(true);
    const [rates, wedding] = await Promise.allSettled([
      fetchRateCards(true), fetchWeddingCardRates()
    ]);
    if (rates.status === 'fulfilled' && Array.isArray(rates.value)) setRateCards(rates.value);
    else toast.error('Could not load other rate categories');
    if (wedding.status === 'fulfilled' && Array.isArray(wedding.value)) setWeddingCodes(wedding.value);
    else toast.error('Could not load Wedding Card designs');
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const matches = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    const wedding = weddingCodes.map(row => ({ ...row, type: 'wedding' }));
    const other = rateCards.filter(rc => !/^wedding cards?$/i.test(rc.itemName || ''))
      .map(rc => ({ ...rc, type: 'other' }));
    const candidates = [...wedding, ...other].filter(row => {
      const target = row.type === 'wedding'
        ? row.code + ' wedding card sk ' + row.brand
        : (row.itemName || '') + ' ' + (row.category || '');
      return target.toLowerCase().includes(q);
    });
    const score = row => {
      const field = row.type === 'wedding' ? row.code : (row.itemName || '').toLowerCase();
      if (field === q) return 0;
      if (field.startsWith(q)) return 1;
      return 2;
    };
    candidates.sort((a,b) => score(a)-score(b) || toLabel(a).localeCompare(toLabel(b)));
    return candidates.slice(0, 30);
  }, [rateCards, weddingCodes, search]);
  const active = matches.find(row => idFor(row) === selectedKey) || matches[0] || null;
  const count = Number(qty);
  const quantityValid = Number.isSafeInteger(count) && count > 0 && count <= 1000000;

  useEffect(() => {
    if (!active || active.type !== 'wedding' || !quantityValid) {
      setWeddingQuote(null); setQuoteBusy(false); return;
    }
    let cancelled = false;
    setQuoteBusy(true); setQuoteError(''); setWeddingQuote(null);
    const timer = setTimeout(() => {
      quoteWeddingCard(active.brand, active.code, count).then(value => {
        if (!cancelled) { setWeddingQuote(value); setQuoteError(''); }
      }).catch(err => {
        if (!cancelled) { setWeddingQuote(null); setQuoteError(err.response?.data?.message || 'Could not calculate price'); }
      }).finally(() => { if (!cancelled) setQuoteBusy(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active?.brand, active?.code, active?.type, count, quantityValid, quoteRevision]);

  const otherPreview = useMemo(() => {
    if (!active || active.type !== 'other' || !quantityValid) return null;
    const calculation = computeRateCardAmount(active, { widthFt, heightFt, qty: count });
    if (calculation?.error) return { error: calculation.error };
    const gst = computeGst(calculation.amount, active.gstPercent || 0);
    return { amount: roundMoney(gst.total), preview: calculation };
  }, [active, quantityValid, widthFt, heightFt, count]);

  const finalAmount = active?.type === 'wedding' ? weddingQuote?.amount : otherPreview?.amount;
  const calculatedError = otherPreview?.error || quoteError;
  const addLine = () => {
    if (!active || !quantityValid || finalAmount == null || quoteBusy) return toast.error('Calculate a valid price first');
    const isWedding = active.type === 'wedding';
    setLines(prev => [...prev, {
      key: idFor(active) + ':' + Date.now() + ':' + prev.length,
      itemName: toLabel(active),
      pricingType: isWedding ? 'per_piece' : active.pricingType,
      widthFt: !isWedding && active.pricingType === 'per_sqft' ? Number(widthFt) : null,
      heightFt: !isWedding && active.pricingType === 'per_sqft' ? Number(heightFt) : null,
      sqft: otherPreview?.preview?.sqft || null,
      qty: count, unit: isWedding ? 'Nos' : active.unit,
      amount: finalAmount, gstPercent: 0, gst: 0, total: finalAmount
    }]);
    toast.success('Added to quote');
  };
  const removeLine = key => setLines(prev => prev.filter(row => row.key !== key));
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, row) => sum + row.amount, 0);
    const gstTotal = lines.reduce((sum, row) => sum + row.gst, 0);
    return { subtotal, gstTotal, grandTotal: subtotal + gstTotal };
  }, [lines]);

  const copySummary = async () => {
    if (!lines.length) return toast.error('Add an item to the quote first');
    const output = [
      customerName ? 'Quote for: ' + customerName : 'Rate Quote',
      ...lines.map(row => row.itemName + ' x ' + row.qty + ' ' + row.unit + ' = ' + money(row.total)),
      '', 'Grand Total: ' + money(totals.grandTotal)
    ].join('\n');
    try { await navigator.clipboard.writeText(output); toast.success('Quote copied'); }
    catch { toast.error('Cannot copy quote'); }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, minHeight: '100%' }}>
      <Paper elevation={0} sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" gap={1} alignItems="center">
          <CalculateRoundedIcon color="primary" />
          <Typography variant="h5" fontWeight={900}>Rate Calculator</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Search across all categories by product code or name. Enter quantity to see the final calculated price.
        </Typography>
        <TextField label="Customer / Quote For (optional)" size="small" value={customerName}
          onChange={e => setCustomerName(e.target.value)} fullWidth sx={{ maxWidth: 380, mb: 2 }} />
        <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.5, mb: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <TextField size="small" fullWidth label="Search product code / any category" autoComplete="off"
              placeholder="e.g. 580, 1115, Flex, Banner, Wedding Card"
              value={search} onChange={e => { setSearch(e.target.value); setSelectedKey(''); }}
              InputProps={{ startAdornment: <SearchRoundedIcon color="action" sx={{ mr: 0.5 }} /> }} />
            <TextField size="small" label="Quantity" type="number" value={qty} onChange={e => setQty(e.target.value)}
              inputProps={{ min: 1, step: 1 }} sx={{ minWidth: { xs: '100%', sm: 130 } }} />
          </Stack>
          {active?.type === 'other' && active.pricingType === 'per_sqft' && (
            <Stack direction="row" gap={1} sx={{ mt: 1 }}>
              <TextField label="Width (ft)" size="small" type="number" value={widthFt}
                onChange={e => setWidthFt(e.target.value)} />
              <TextField label="Height (ft)" size="small" type="number" value={heightFt}
                onChange={e => setHeightFt(e.target.value)} />
            </Stack>
          )}
          {loading && <Box sx={{ textAlign: 'center', p: 2 }}><CircularProgress size={22}/></Box>}
          {!loading && search.trim() && matches.length > 1 && (
            <Paper variant="outlined" sx={{ mt: 1, maxHeight: 230, overflowY: 'auto' }}>
              {matches.map(row => (
                <MenuItem key={idFor(row)} selected={idFor(row) === idFor(active)} dense
                  onClick={() => setSelectedKey(idFor(row))}>
                  {row.type === 'wedding' && row.imageUrl &&
                    <Box component="img" src={row.imageUrl} alt="" sx={{ width: 33, height: 33, objectFit: 'cover', borderRadius: 1, mr: 1 }} />}
                  <Typography variant="body2">{toLabel(row)}</Typography>
                </MenuItem>
              ))}
            </Paper>
          )}
          {active && (
            <Paper variant="outlined" sx={{ mt: 1.5, p: 1.5, borderRadius: 2 }}>
              <Stack direction="row" alignItems="center" gap={1}>
                {active.type === 'wedding' && active.imageUrl && (
                  <Box component="img" src={active.imageUrl} alt="Wedding Card preview"
                    sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1 }} />
                )}
                <Typography variant="caption" color="text.secondary">{toLabel(active)}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1}>
                <Typography variant="h5" color="primary.main" fontWeight={900}>
                  {quoteBusy ? 'Calculating…' : !quantityValid ? 'Enter valid quantity' :
                    calculatedError ? 'Price unavailable' :
                    finalAmount == null ? 'Enter dimensions / quantity' : money(finalAmount)}
                </Typography>
                <Button variant="contained" startIcon={<AddRoundedIcon />} disabled={quoteBusy || finalAmount == null || !quantityValid || !!calculatedError}
                  onClick={addLine}>Add to Quote</Button>
              </Stack>
              {calculatedError && <Alert severity="warning" sx={{ mt: 1 }}>{calculatedError}</Alert>}
            </Paper>
          )}
          {!loading && search.trim() && matches.length === 0 &&
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No matching item or code.</Typography>}
        </Paper>

        {isSuperAdmin && (
          <Box className="no-print" sx={{ mb: 2 }}>
            <Button variant="outlined" size="small" startIcon={<SettingsRoundedIcon />}
              onClick={async () => {
                if (manageOpen) {
                  try { setWeddingCodes(await fetchWeddingCardRates()); setQuoteRevision(n => n + 1); } catch { toast.error('Could not refresh Wedding Card codes'); }
                }
                setManageOpen(!manageOpen);
              }}>
              {manageOpen ? 'Close Wedding Card Editor' : 'Edit Wedding Card Prices / Bulk Edit / Photos'}
            </Button>
          </Box>
        )}
        {isSuperAdmin && manageOpen && <WeddingCardCatalog onAddToQuote={line => setLines(prev => [...prev, line])}/>}

        <Divider sx={{ mb: 1.5 }} />
        <Box ref={printRef}>
          <Typography fontWeight={900} sx={{ mb: 1 }}>Quote{customerName ? ' — ' + customerName : ''}</Typography>
          {!lines.length ? <Typography variant="body2" color="text.secondary">No items added yet.</Typography> : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>Item</TableCell><TableCell>Qty</TableCell>
                  <TableCell align="right">Amount</TableCell><TableCell className="no-print" align="right">Remove</TableCell>
                </TableRow></TableHead>
                <TableBody>{lines.map(row => (
                  <TableRow key={row.key}>
                    <TableCell>{row.itemName}</TableCell>
                    <TableCell>{row.qty} {row.unit}{row.sqft ? ' · ' + row.sqft.toFixed(2) + ' sq.ft.' : ''}</TableCell>
                    <TableCell align="right">{money(row.total)}</TableCell>
                    <TableCell align="right" className="no-print">
                      <Tooltip title="Remove line"><IconButton color="error" size="small" onClick={() => removeLine(row.key)}>
                        <DeleteRoundedIcon fontSize="small"/>
                      </IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </TableContainer>
          )}
          {!!lines.length && <Typography align="right" variant="h6" fontWeight={900} sx={{ mt: 1 }}>
            Total: {money(totals.grandTotal)}
          </Typography>}
        </Box>
        {!!lines.length && (
          <Stack direction="row" gap={1} sx={{ mt: 2 }} className="no-print">
            <Button variant="outlined" onClick={copySummary} startIcon={<ContentCopyRoundedIcon />}>Copy Quote</Button>
            <Button variant="outlined" onClick={handlePrint} startIcon={<PrintRoundedIcon />}>Print</Button>
            <Button color="error" onClick={() => setLines([])}>Clear All</Button>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
