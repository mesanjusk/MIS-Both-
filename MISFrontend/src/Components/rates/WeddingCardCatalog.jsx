import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import { useAuth } from '../../context/AuthContext';
import {
  fetchWeddingCardRates, createWeddingCardRate,
  updateWeddingCardRate, deleteWeddingCardRate
} from '../../services/weddingCardService';

const money = (value) => `₹${(Number(value) || 0).toFixed(2)}`;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const codeMap = { '1': 'N', '2': 'A', '3': 'G', '4': 'P', '5': 'U', '6': 'R', '7': 'C', '8': 'I', '9': 'T', '0': 'Y' };
const encodePrice = (value) => String(value).replace(/[0-9]/g, (digit) => codeMap[digit]);
const blankForm = (brand = 'M') => ({
  brand, code: '', originalPrice: '', printingCharge: '0',
  packingCharge: '0', designCharge: '0', notes: ''
});

export default function WeddingCardCatalog({ onAddToQuote }) {
  const { isSuperAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [brand, setBrand] = useState('M');
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState('1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchWeddingCardRates();
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load Wedding Card prices');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => rows.filter((r) =>
    r.brand === brand && (!search.trim() ||
      [r.code, r.codedPrice, r.notes].some((field) => String(field || '').toLowerCase().includes(search.trim().toLowerCase())))
  ), [rows, brand, search]);

  const changeBrand = (next) => { setBrand(next); setPage(0); };
  const changeSearch = (next) => { setSearch(next); setPage(0); };
  const openAdd = () => {
    setEditing(null);
    setForm(blankForm(brand));
    setDialogOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      brand: row.brand, code: row.code, originalPrice: String(row.originalPrice),
      printingCharge: String(row.printingCharge || 0),
      packingCharge: String(row.packingCharge || 0),
      designCharge: String(row.designCharge || 0),
      notes: row.notes || ''
    });
    setDialogOpen(true);
  };
  const setField = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  const updatedPrice = roundMoney(Number(form.originalPrice || 0) * 1.1);
  const finalRate = roundMoney(updatedPrice +
    Number(form.printingCharge || 0) + Number(form.packingCharge || 0) +
    Number(form.designCharge || 0));

  const save = async () => {
    if (!/^\d{3,5}$/.test(form.code)) return setError('Enter a 3–5 digit card number');
    const fields = ['originalPrice', 'printingCharge', 'packingCharge', 'designCharge'];
    if (fields.some((key) => form[key] === '' || !Number.isFinite(Number(form[key])) || Number(form[key]) < 0)) {
      return setError('Enter nonnegative numeric prices and charges');
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        brand: form.brand, code: form.code, notes: form.notes,
        ...Object.fromEntries(fields.map((key) => [key, Number(form[key])]))
      };
      if (editing) await updateWeddingCardRate(editing.brand, editing.code, payload);
      else await createWeddingCardRate(payload);
      setDialogOpen(false);
      changeBrand(form.brand);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save card rate');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete Wedding Card SK (${row.brand}) No. ${row.code}? This does not delete the Wedding Card item.`)) return;
    try {
      await deleteWeddingCardRate(row.brand, row.code);
      setRows((previous) => previous.filter((r) => !(r.brand === row.brand && r.code === row.code)));
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete card code');
    }
  };

  const addToQuote = (row) => {
    const count = Number(qty);
    if (!Number.isInteger(count) || count < 1) return setError('Quantity must be a positive whole number');
    const amount = roundMoney(row.finalRate * count);
    onAddToQuote({
      key: `wedding-${row.brand}-${row.code}-${Date.now()}-${Math.random()}`,
      itemName: `Wedding Card / SK (${row.brand}) / No. ${row.code}`,
      pricingType: 'per_piece', qty: count, unit: 'Nos',
      amount, gstPercent: 0, gst: 0, total: amount
    });
    setError('');
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, borderRadius: 3, mb: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={900}>Wedding Card — Rate Catalogue</Typography>
          <Typography variant="caption" color="text.secondary">
            Choose a subcategory and card number. New rate = original + 10% + printing + packing + design charges.
          </Typography>
        </Box>
        {isSuperAdmin && (
          <Button variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={openAdd} sx={{ alignSelf: 'flex-start', borderRadius: 2 }}>
            Add Card Code
          </Button>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mb: 1.5 }}>
        <TextField select size="small" label="Wedding Card Subcategory" value={brand} onChange={(event) => changeBrand(event.target.value)} sx={{ minWidth: 185 }}>
          <MenuItem value="M">SK (M)</MenuItem>
          <MenuItem value="K">SK (K)</MenuItem>
        </TextField>
        <TextField size="small" label="Search Card No. / Code" value={search} onChange={(e) => changeSearch(e.target.value)} sx={{ flex: 1 }} />
        <TextField size="small" label="Quote Quantity" inputProps={{ min: 1, step: 1 }} type="number" value={qty} onChange={(e) => setQty(e.target.value)} sx={{ minWidth: 125 }} />
        <Chip label={`${visible.length} designs`} size="small" variant="outlined" sx={{ alignSelf: 'center' }} />
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
      ) : (
        <>
          <TableContainer sx={{ maxHeight: 535, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
              <TableHead><TableRow>
                <TableCell sx={{ fontWeight: 900 }}>No.</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Coded value</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Original</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>+10%</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Printing</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Packing</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Design</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Final Rate</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {visible.slice(page * perPage, page * perPage + perPage).map((row) => (
                  <TableRow key={`${row.brand}:${row.code}`} hover>
                    <TableCell>
                      <Typography fontWeight={800} variant="body2">{row.code}</Typography>
                      {row.notes?.includes('Source also listed') && <Typography color="warning.main" variant="caption">Verify price</Typography>}
                    </TableCell>
                    <TableCell><Typography fontWeight={800} variant="body2">{row.codedPrice}</Typography></TableCell>
                    <TableCell align="right">{money(row.originalPrice)}</TableCell>
                    <TableCell align="right">{money(row.updatedPrice)}</TableCell>
                    <TableCell align="right">{money(row.printingCharge)}</TableCell>
                    <TableCell align="right">{money(row.packingCharge)}</TableCell>
                    <TableCell align="right">{money(row.designCharge)}</TableCell>
                    <TableCell align="right"><Typography color="primary.main" fontWeight={900} variant="body2">{money(row.finalRate)}</Typography></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Add to current quote">
                        <IconButton size="small" color="primary" onClick={() => addToQuote(row)}><ShoppingCartRoundedIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      {isSuperAdmin && (
                        <>
                          <Tooltip title="Edit prices and charges"><IconButton size="small" onClick={() => openEdit(row)}><EditRoundedIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Delete this card code"><IconButton size="small" color="error" onClick={() => remove(row)}><DeleteRoundedIcon fontSize="small" /></IconButton></Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && <TableRow><TableCell colSpan={9} align="center">No Wedding Card numbers match your search.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={visible.length} page={Math.min(page, Math.max(0, Math.ceil(visible.length / perPage) - 1))}
            onPageChange={(_, next) => setPage(next)} rowsPerPage={perPage}
            onRowsPerPageChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]} />
        </>
      )}

      <Dialog open={dialogOpen} onClose={saving ? undefined : () => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit Wedding Card Code' : 'Add Wedding Card Code'}</DialogTitle>
        <DialogContent>
          <Stack gap={1.5} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
              <TextField select label="Subcategory" size="small" value={form.brand} disabled={Boolean(editing)} onChange={(e) => setField('brand', e.target.value)} fullWidth>
                <MenuItem value="M">SK (M)</MenuItem>
                <MenuItem value="K">SK (K)</MenuItem>
              </TextField>
              <TextField label="Card No." size="small" value={form.code} disabled={Boolean(editing)} onChange={(e) => setField('code', e.target.value.replace(/\D/g, ''))} fullWidth />
            </Stack>
            <TextField label="Original Price (₹)" type="number" size="small" inputProps={{ min: 0, step: '0.01' }}
              value={form.originalPrice} onChange={(e) => setField('originalPrice', e.target.value)} fullWidth />
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
              {[
                ['printingCharge', 'Printing (₹)'], ['packingCharge', 'Packing (₹)'], ['designCharge', 'Design (₹)']
              ].map(([key, label]) => (
                <TextField key={key} label={label} type="number" inputProps={{ min: 0, step: '0.01' }} value={form[key]}
                  onChange={(e) => setField(key, e.target.value)} size="small" fullWidth />
              ))}
            </Stack>
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Typography variant="body2">Coded: <strong>{form.originalPrice !== '' ? encodePrice(Number(form.originalPrice)) : '—'}</strong></Typography>
              <Typography variant="body2">Updated (+10%): <strong>{money(updatedPrice)}</strong></Typography>
              <Typography variant="subtitle2" fontWeight={900}>Final Rate: {money(finalRate)}</Typography>
            </Paper>
            <TextField label="Notes (optional)" size="small" multiline minRows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={saving} onClick={save}>
            {saving ? <CircularProgress size={18} /> : editing ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
