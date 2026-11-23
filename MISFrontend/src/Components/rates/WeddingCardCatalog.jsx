import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, Paper, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow,
  TextField, Tooltip, Typography
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import { useAuth } from '../../context/AuthContext';
import {
  fetchWeddingCardRates, quoteWeddingCard, createWeddingCardRate,
  updateWeddingCardRate, deleteWeddingCardRate, bulkUpdateWeddingCardRates,
  uploadWeddingCardPhoto, removeWeddingCardPhoto
} from '../../services/weddingCardService';

const money = (value) => '₹' + (Number(value) || 0).toFixed(2);
const defaultForm = (brand = 'M') => ({
  brand, code: '', originalPrice: '', markupPercent: '10', discountPercent: '0',
  printingCharge: '0', packingCharge: '0', designCharge: '0', notes: ''
});
const bulkFields = [
  ['originalPrice', 'Original price ₹'], ['markupPercent', 'Price increase %'],
  ['discountPercent', 'Discount %'], ['printingCharge', 'Printing per 100 ₹'],
  ['packingCharge', 'Packing per 100 ₹'], ['designCharge', 'Design once ₹']
];
const decimal = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const CODE_MAP = { '1':'N','2':'A','3':'G','4':'P','5':'U','6':'R','7':'C','8':'I','9':'T','0':'Y' };
const encoded = (value) => String(value).replace(/[0-9]/g, digit => CODE_MAP[digit]);
const limits = { originalPrice: 10000000, markupPercent: 1000, discountPercent: 100,
  printingCharge: 10000000, packingCharge: 10000000, designCharge: 10000000 };

export default function WeddingCardCatalog({ onAddToQuote }) {
  const { isSuperAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [brand, setBrand] = useState('M');
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState('100');
  const [activeCode, setActiveCode] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState('set');
  const [bulkChanges, setBulkChanges] = useState({});
  const [photoBusy, setPhotoBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchWeddingCardRates();
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load wedding card designs');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => rows.filter(row =>
    row.brand === brand &&
    (!search.trim() || row.code.includes(search.trim()))
  ), [rows, brand, search]);
  const shown = visible.slice(page * perPage, page * perPage + perPage);
  const active = rows.find(row => row.brand === brand && row.code === activeCode);
  const selectedRows = visible.filter(row => selected.includes(row.brand + ':' + row.code));
  const changeBrand = (next) => {
    setBrand(next); setPage(0); setSelected([]); setActiveCode(''); setQuote(null);
  };
  const changeSearch = (next) => { setSearch(next); setPage(0); };
  const chooseCard = (row) => {
    setBrand(row.brand); setActiveCode(row.code); setQuote(null);
  };

  useEffect(() => {
    if (!activeCode || !Number.isSafeInteger(Number(qty)) || Number(qty) < 1) {
      setQuote(null); return;
    }
    let ignore = false;
    setQuoteBusy(true);
    const timer = setTimeout(() => {
      quoteWeddingCard(brand, activeCode, Number(qty))
        .then(data => { if (!ignore) { setQuote(data); setError(''); } })
        .catch(err => { if (!ignore) { setQuote(null); setError(err.response?.data?.message || 'Could not calculate quote'); } })
        .finally(() => { if (!ignore) setQuoteBusy(false); });
    }, 180);
    return () => { ignore = true; clearTimeout(timer); };
  }, [brand, activeCode, qty]);

  const addLine = () => {
    if (!quote || !active) return;
    onAddToQuote({
      key: 'wedding-' + brand + '-' + activeCode + '-' + Date.now(),
      itemName: 'Wedding Card / SK (' + brand + ') / No. ' + activeCode,
      pricingType: 'per_piece', qty: Number(qty), unit: 'Nos',
      amount: quote.amount, gstPercent: 0, gst: 0, total: quote.amount
    });
  };
  const openAdd = () => {
    setEditing(null); setForm(defaultForm(brand)); setDialogOpen(true); setError('');
  };
  const openEdit = row => {
    setEditing(row);
    setForm({
      brand: row.brand, code: row.code,
      originalPrice: String(row.originalPrice ?? 0),
      markupPercent: String(row.markupPercent ?? 10),
      discountPercent: String(row.discountPercent ?? 0),
      printingCharge: String(row.printingCharge ?? 0),
      packingCharge: String(row.packingCharge ?? 0),
      designCharge: String(row.designCharge ?? 0),
      notes: row.notes || ''
    });
    setDialogOpen(true); setError('');
  };
  const updateField = (key, value) => setForm(old => ({ ...old, [key]: value }));
  const save = async () => {
    if (!/^\d{3,5}$/.test(form.code)) return setError('Enter a 3–5 digit card number');
    if (Object.keys(limits).some(key => form[key] === '' || !Number.isFinite(Number(form[key])) ||
      Number(form[key]) < 0 || Number(form[key]) > limits[key])) return setError('Check all prices and percentages');
    setSaving(true);
    try {
      const payload = { ...form, ...Object.fromEntries(Object.keys(limits).map(key => [key, Number(form[key])])) };
      if (editing) await updateWeddingCardRate(editing.brand, editing.code, payload);
      else await createWeddingCardRate(payload);
      setDialogOpen(false); setError('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save wedding card');
    } finally { setSaving(false); }
  };
  const remove = async row => {
    if (!window.confirm('Delete Wedding Card SK (' + row.brand + ') No. ' + row.code + '?')) return;
    try {
      await deleteWeddingCardRate(row.brand, row.code);
      setRows(old => old.filter(r => !(r.brand === row.brand && r.code === row.code)));
      setSelected(old => old.filter(id => id !== row.brand + ':' + row.code));
      setError('');
    } catch (err) { setError(err.response?.data?.message || 'Unable to remove card'); }
  };
  const toggle = (row, checked) => {
    const id = row.brand + ':' + row.code;
    setSelected(old => checked ? [...new Set([...old, id])] : old.filter(x => x !== id));
  };
  const toggleVisible = checked => {
    const ids = visible.map(r => r.brand + ':' + r.code);
    setSelected(old => checked ? [...new Set([...old, ...ids])] : old.filter(id => !ids.includes(id)));
  };
  const doBulk = async () => {
    const values = Object.fromEntries(Object.entries(bulkChanges).filter(([, v]) => v !== ''));
    if (!Object.keys(values).length) return setError('Select at least one pricing field');
    if (Object.entries(values).some(([k,v]) => !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > limits[k])) {
      return setError('Invalid bulk adjustment');
    }
    setSaving(true);
    try {
      const ids = selectedRows.map(r => ({ brand: r.brand, code: r.code }));
      const result = await bulkUpdateWeddingCardRates(ids, values, bulkMode);
      setBulkOpen(false); setBulkChanges({}); setSelected([]); setQuote(null);
      await load(); setError('');
      return result;
    } catch (err) { setError(err.response?.data?.message || 'Bulk edit failed'); }
    finally { setSaving(false); }
  };
  const uploadPhoto = async file => {
    if (!file || !editing) return;
    if (file.size > 5 * 1024 * 1024) return setError('Image must be 5MB or smaller');
    setPhotoBusy(true);
    try {
      await uploadWeddingCardPhoto(editing.brand, editing.code, file);
      const data = await fetchWeddingCardRates();
      setRows(data);
      const updated = data.find(r => r.brand === editing.brand && r.code === editing.code);
      setEditing(updated || null); setError('');
    } catch (err) { setError(err.response?.data?.message || 'Image upload failed'); }
    finally { setPhotoBusy(false); }
  };
  const deletePhoto = async idx => {
    if (!editing || !window.confirm('Remove this product image?')) return;
    setPhotoBusy(true);
    try {
      await removeWeddingCardPhoto(editing.brand, editing.code, idx);
      const data = await fetchWeddingCardRates();
      setRows(data);
      setEditing(data.find(r => r.brand === editing.brand && r.code === editing.code) || null);
      setError('');
    } catch (err) { setError(err.response?.data?.message || 'Unable to remove photo'); }
    finally { setPhotoBusy(false); }
  };

  const unit = decimal(Number(form.originalPrice || 0) * (1 + Number(form.markupPercent || 0) / 100) *
    (1 - Number(form.discountPercent || 0) / 100));
  const example100 = decimal(unit * 100 + Number(form.printingCharge || 0) +
    Number(form.packingCharge || 0) + Number(form.designCharge || 0));

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, mb: 2, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Box>
          <Typography fontWeight={900}>Wedding Card · SK (M) / SK (K)</Typography>
          <Typography variant="caption" color="text.secondary">
            Search a card number and quantity to get the final order price. Cost details are admin-only in Edit.
          </Typography>
        </Box>
        {isSuperAdmin && (
          <Stack direction="row" gap={1}>
            <Button size="small" variant="outlined" disabled={selectedRows.length === 0}
              onClick={() => { setBulkChanges({}); setBulkMode('set'); setBulkOpen(true); }}>
              Bulk Edit ({selectedRows.length})
            </Button>
            <Button size="small" startIcon={<AddRoundedIcon />} variant="contained" onClick={openAdd}>Add Code</Button>
          </Stack>
        )}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mb: 1.5 }}>
        <TextField select label="Subcategory" size="small" value={brand} onChange={e => changeBrand(e.target.value)} sx={{ minWidth: 165 }}>
          <MenuItem value="M">SK (M)</MenuItem><MenuItem value="K">SK (K)</MenuItem>
        </TextField>
        <TextField label="Search Card No." size="small" value={search} onChange={e => changeSearch(e.target.value)} sx={{ flex: 1 }} />
        <TextField label="Quantity" size="small" type="number" inputProps={{ min: 1, step: 1 }}
          value={qty} onChange={e => setQty(e.target.value)} sx={{ width: { xs: '100%', sm: 125 } }} />
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>{error}</Alert>}
      {active && (
        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, mb: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={1.5}>
            {active.imageUrl && <Box component="img" src={active.imageUrl} alt="" sx={{ width: 58, height: 58, objectFit: 'cover', borderRadius: 1 }} />}
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption">Wedding Card · SK ({active.brand}) · No. {active.code}</Typography>
              <Typography fontWeight={900} color="primary.main" variant="h6">
                {quoteBusy ? 'Calculating…' : quote ? money(quote.amount) : 'Enter quantity'}
              </Typography>
            </Box>
            <Button variant="contained" size="small" disabled={!quote || quoteBusy} startIcon={<ShoppingCartRoundedIcon />} onClick={addLine}>Add to Quote</Button>
          </Stack>
        </Paper>
      )}
      {loading ? <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress /></Box> : (
        <>
          <TableContainer sx={{ maxHeight: 460, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>
                {isSuperAdmin && <TableCell padding="checkbox"><Checkbox size="small"
                  checked={visible.length > 0 && selectedRows.length === visible.length}
                  indeterminate={selectedRows.length > 0 && selectedRows.length !== visible.length}
                  onChange={e => toggleVisible(e.target.checked)} /></TableCell>}
                <TableCell>Card No.</TableCell><TableCell>Photo</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {shown.map(row => (
                  <TableRow key={row.brand + ':' + row.code} hover selected={activeCode === row.code}>
                    {isSuperAdmin && <TableCell padding="checkbox"><Checkbox size="small"
                      checked={selected.includes(row.brand + ':' + row.code)}
                      onChange={e => toggle(row, e.target.checked)} /></TableCell>}
                    <TableCell><Typography variant="body2" fontWeight={900}>{row.code}</Typography></TableCell>
                    <TableCell>{row.imageUrl || row.images?.[0]?.url ?
                      <Box component="img" src={row.imageUrl || row.images[0].url} alt="Card" sx={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 1 }}/> :
                      <PhotoCameraRoundedIcon color="disabled" />}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Button size="small" onClick={() => chooseCard(row)}>Get Price</Button>
                      {isSuperAdmin && <>
                        <Tooltip title="Edit price, charges, image"><IconButton size="small" onClick={() => openEdit(row)}><EditRoundedIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Delete code"><IconButton size="small" color="error" onClick={() => remove(row)}><DeleteRoundedIcon fontSize="small" /></IconButton></Tooltip>
                      </>}
                    </TableCell>
                  </TableRow>
                ))}
                {!visible.length && <TableRow><TableCell colSpan={isSuperAdmin ? 4 : 3} align="center">No cards found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={visible.length} page={Math.min(page, Math.max(0, Math.ceil(visible.length / perPage) - 1))}
            onPageChange={(_, v) => setPage(v)} rowsPerPage={perPage}
            onRowsPerPageChange={e => { setPerPage(Number(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]} />
        </>
      )}

      <Dialog open={dialogOpen} maxWidth="sm" fullWidth onClose={saving ? undefined : () => setDialogOpen(false)}>
        <DialogTitle>{editing ? 'Edit SK (' + editing.brand + ') No. ' + editing.code : 'Add Wedding Card'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          <Stack gap={1.5} sx={{ pt: 1 }}>
            <Stack direction="row" gap={1}>
              <TextField select size="small" label="Subcategory" fullWidth value={form.brand}
                disabled={!!editing} onChange={e => updateField('brand', e.target.value)}>
                <MenuItem value="M">SK (M)</MenuItem><MenuItem value="K">SK (K)</MenuItem>
              </TextField>
              <TextField size="small" label="Card Number" fullWidth value={form.code}
                disabled={!!editing} onChange={e => updateField('code', e.target.value.replace(/\D/g, ''))} />
            </Stack>
            <TextField label="Original price ₹ (admin only)" size="small" type="number" fullWidth
              value={form.originalPrice} onChange={e => updateField('originalPrice', e.target.value)} />
            <Stack direction="row" gap={1}>
              <TextField label="Price increase %" size="small" type="number" fullWidth value={form.markupPercent}
                onChange={e => updateField('markupPercent', e.target.value)} />
              <TextField label="Discount %" size="small" type="number" fullWidth value={form.discountPercent}
                onChange={e => updateField('discountPercent', e.target.value)} />
            </Stack>
            <TextField label="Printing charge ₹ / 100 cards" size="small" type="number" fullWidth value={form.printingCharge}
              onChange={e => updateField('printingCharge', e.target.value)} />
            <TextField label="Packing charge ₹ / 100 cards" size="small" type="number" fullWidth value={form.packingCharge}
              onChange={e => updateField('packingCharge', e.target.value)} />
            <TextField label="Design charge ₹ / order (one time)" size="small" type="number" fullWidth value={form.designCharge}
              onChange={e => updateField('designCharge', e.target.value)} />
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography variant="caption">Internal coded supplier rate: {encoded(form.originalPrice || 0)}</Typography>
              <Typography variant="body2">Example quote for 100 cards: <strong>{money(example100)}</strong></Typography>
              <Typography variant="caption" color="text.secondary">Design is added once; printing and packing are prorated for quantities other than 100.</Typography>
            </Paper>
            <TextField label="Notes" size="small" fullWidth multiline minRows={2} value={form.notes}
              onChange={e => updateField('notes', e.target.value)} />
            {editing && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography fontWeight={800} variant="body2" sx={{ mb: 1 }}>Product Photos (maximum 6)</Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  {(editing.images || []).map((img, idx) => (
                    <Box key={img.url + idx} sx={{ position: 'relative' }}>
                      <Box component="img" src={img.url} alt={'Card image ' + (idx + 1)} sx={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 1 }} />
                      <IconButton disabled={photoBusy} size="small" color="error" onClick={() => deletePhoto(idx)}
                        sx={{ position: 'absolute', top: 0, right: 0, bgcolor: 'background.paper' }}><DeleteRoundedIcon fontSize="small" /></IconButton>
                    </Box>
                  ))}
                </Stack>
                <Button size="small" component="label" disabled={photoBusy || (editing.images || []).length >= 6}
                  startIcon={<PhotoCameraRoundedIcon />} sx={{ mt: 1 }}>
                  {photoBusy ? 'Uploading…' : 'Upload photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden
                    onChange={e => { const file = e.target.files?.[0]; if (file) uploadPhoto(file); e.target.value = ''; }} />
                </Button>
              </Paper>
            )}
            {!editing && <Typography variant="caption" color="text.secondary">Save the new code first, then open Edit to upload images.</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Update' : 'Add'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkOpen} maxWidth="sm" fullWidth onClose={saving ? undefined : () => setBulkOpen(false)}>
        <DialogTitle>Bulk Edit · {selectedRows.length} selected cards</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          <Typography variant="caption" color="text.secondary">Only selected fields will change. Unselected charges remain untouched.</Typography>
          <TextField select fullWidth size="small" sx={{ mt: 2 }} label="Operation" value={bulkMode}
            onChange={e => setBulkMode(e.target.value)}>
            <MenuItem value="set">Set field to this value</MenuItem>
            <MenuItem value="add">Increase field by this amount / percentage points</MenuItem>
          </TextField>
          <Stack gap={1.3} sx={{ mt: 2 }}>
            {bulkFields.map(([key, label]) => (
              <Stack key={key} direction="row" alignItems="center" gap={1}>
                <Checkbox checked={bulkChanges[key] !== undefined}
                  onChange={e => setBulkChanges(old => {
                    const next = { ...old };
                    if (e.target.checked) next[key] = '0'; else delete next[key];
                    return next;
                  })} />
                <TextField size="small" fullWidth label={label} type="number"
                  disabled={bulkChanges[key] === undefined} value={bulkChanges[key] ?? ''}
                  onChange={e => setBulkChanges(old => ({ ...old, [key]: e.target.value }))} />
              </Stack>
            ))}
          </Stack>
          <Alert severity="info" sx={{ mt: 2 }}>Updates {selectedRows.length} selected cards. Preview your values before applying. Deletions and card numbers are not affected.</Alert>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setBulkOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={saving || !selectedRows.length} onClick={doBulk}>Apply to {selectedRows.length} cards</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
