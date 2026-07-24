import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
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
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import {
  fetchRateCards,
  createRateCard,
  updateRateCard,
  deleteRateCard,
} from '../services/rateCardService';
import { fetchItems, fetchItemGroups } from '../services/itemService';

const PRICING_TYPES = [
  { value: 'per_sqft', label: 'Per Sq.Ft (Flex / Banner)' },
  { value: 'per_piece', label: 'Per Piece' },
  { value: 'slab', label: 'Quantity Slabs (Cards)' },
];

const BLANK_SLAB = { minQty: 1, maxQty: 0, ratePerPiece: 0, flatPrice: 0 };

const BLANK_FORM = {
  itemName: '',
  category: '',
  itemUuid: '',
  pricingType: 'per_piece',
  unit: 'Nos',
  ratePerSqft: 0,
  minBillingSqft: 0,
  ratePerPiece: 0,
  minQty: 1,
  slabs: [],
  gstPercent: 0,
  isActive: true,
  notes: '',
};

function pricingSummary(rc) {
  if (rc.pricingType === 'per_sqft') {
    return `₹${rc.ratePerSqft || 0}/sq.ft${rc.minBillingSqft ? ` (min ${rc.minBillingSqft} sq.ft)` : ''}`;
  }
  if (rc.pricingType === 'slab') {
    return `${(rc.slabs || []).length} slab(s)`;
  }
  return `₹${rc.ratePerPiece || 0}/pc`;
}

export default function RateCardMaster() {
  const [rateCards, setRateCards] = useState([]);
  const [items, setItems] = useState([]);
  const [itemGroups, setItemGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [data, itemsRes, groupsRes] = await Promise.all([
        fetchRateCards(),
        fetchItems(),
        fetchItemGroups(),
      ]);
      setRateCards(Array.isArray(data) ? data : []);
      if (itemsRes.data?.success) setItems(itemsRes.data.result || []);
      if (groupsRes.data?.success) setItemGroups(groupsRes.data.result || []);
    } catch (err) {
      setMessage({ severity: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const groupLabel = (groupName) => {
    const group = itemGroups.find((g) => g.Item_group === groupName);
    return group?.parentGroup ? `${group.parentGroup} / ${group.Item_group}` : groupName;
  };

  const categories = useMemo(
    () =>
      [...new Set([...itemGroups.map((g) => g.Item_group), ...rateCards.map((r) => r.category)].filter(Boolean))]
        .sort((a, b) => groupLabel(a).localeCompare(groupLabel(b))),
    [rateCards, itemGroups]
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.Item_uuid === form.itemUuid) || null,
    [items, form.itemUuid]
  );

  const openCreate = () => {
    setForm(BLANK_FORM);
    setEditId(null);
    setDialogOpen(true);
  };

  const openEdit = (rc) => {
    setForm({
      itemName: rc.itemName || '',
      category: rc.category || '',
      itemUuid: rc.itemUuid || '',
      pricingType: rc.pricingType || 'per_piece',
      unit: rc.unit || 'Nos',
      ratePerSqft: rc.ratePerSqft || 0,
      minBillingSqft: rc.minBillingSqft || 0,
      ratePerPiece: rc.ratePerPiece || 0,
      minQty: rc.minQty ?? 1,
      slabs: (rc.slabs || []).map((s) => ({ ...s })),
      gstPercent: rc.gstPercent || 0,
      isActive: rc.isActive !== false,
      notes: rc.notes || '',
    });
    setEditId(rc.rateCard_uuid);
    setDialogOpen(true);
  };

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const addSlab = () => setForm((f) => ({ ...f, slabs: [...f.slabs, { ...BLANK_SLAB }] }));
  const removeSlab = (idx) => setForm((f) => ({ ...f, slabs: f.slabs.filter((_, i) => i !== idx) }));
  const updateSlab = (idx, field, value) =>
    setForm((f) => ({ ...f, slabs: f.slabs.map((s, i) => (i === idx ? { ...s, [field]: value } : s)) }));

  const save = async () => {
    if (!form.itemName.trim()) return setMessage({ severity: 'error', text: 'Item name is required' });
    if (form.pricingType === 'slab' && form.slabs.length === 0) {
      return setMessage({ severity: 'error', text: 'Add at least one quantity slab' });
    }
    setSaving(true);
    try {
      if (editId) {
        await updateRateCard(editId, form);
      } else {
        await createRateCard(form);
      }
      setDialogOpen(false);
      setMessage({ severity: 'success', text: editId ? 'Rate card updated' : 'Rate card created' });
      await load();
    } catch (err) {
      setMessage({ severity: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rc) => {
    if (!window.confirm(`Delete rate card for "${rc.itemName}"?`)) return;
    try {
      await deleteRateCard(rc.rateCard_uuid);
      setMessage({ severity: 'success', text: 'Rate card deleted' });
      await load();
    } catch (err) {
      setMessage({ severity: 'error', text: err.response?.data?.message || err.message });
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, bgcolor: 'background.default', minHeight: '100%' }}>
      <Paper elevation={0} sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <CalculateRoundedIcon sx={{ color: 'primary.main' }} />
              <Typography variant="h5" fontWeight={900} color="primary.main">Rate Card Master</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Set pricing rules for cards, flex, banners and other print items. The Rate Calculator uses these to quote jobs.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate} sx={{ borderRadius: 2.5 }}>
            New Rate Card
          </Button>
        </Stack>

        {message && (
          <Alert severity={message.severity} sx={{ mt: 1.5, borderRadius: 2 }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        <Divider sx={{ my: 1.5 }} />

        {loading ? (
          <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>
        ) : rateCards.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <CalculateRoundedIcon sx={{ fontSize: 48, color: 'primary.light', mb: 1 }} />
            <Typography color="text.secondary">No rate cards yet. Add one to start quoting jobs.</Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>Item</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Pricing</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Rate</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>GST %</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Active</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rateCards.map((rc) => (
                  <TableRow hover key={rc.rateCard_uuid}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={900} color="primary.main">{rc.itemName}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{rc.category ? groupLabel(rc.category) : '-'}</Typography></TableCell>
                    <TableCell>
                      <Chip size="small" label={PRICING_TYPES.find((p) => p.value === rc.pricingType)?.label || rc.pricingType} variant="outlined" />
                    </TableCell>
                    <TableCell><Typography variant="caption">{pricingSummary(rc)}</Typography></TableCell>
                    <TableCell><Typography variant="caption">{rc.gstPercent || 0}%</Typography></TableCell>
                    <TableCell>
                      <Chip size="small" label={rc.isActive ? 'Active' : 'Inactive'} color={rc.isActive ? 'success' : 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(rc)}><EditRoundedIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => remove(rc)}><DeleteRoundedIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>{editId ? 'Edit Rate Card' : 'New Rate Card'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Autocomplete
              options={items}
              getOptionLabel={(item) => item.Item_name || ''}
              isOptionEqualToValue={(a, b) => a.Item_uuid === b.Item_uuid}
              value={selectedItem}
              onChange={(_, item) => {
                if (item) {
                  setForm((f) => ({
                    ...f,
                    itemUuid: item.Item_uuid,
                    itemName: item.Item_name,
                    category: item.Item_group || f.category,
                  }));
                } else {
                  setField('itemUuid', '');
                }
              }}
              renderInput={(params) => (
                <TextField {...params} label="Link to Item (optional)" placeholder="Search item master…" size="small" helperText="Pick an item from the master list so its name and group stay in sync here." />
              )}
              size="small"
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Item Name"
                placeholder="e.g. Visiting Card, Flex Banner, Standee"
                value={form.itemName}
                onChange={(e) => setField('itemName', e.target.value)}
                disabled={Boolean(form.itemUuid)}
                fullWidth
                size="small"
              />
              <TextField
                label="Category"
                placeholder="Cards, Flex & Banner..."
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                select={categories.length > 0}
                fullWidth
                size="small"
              >
                {categories.map((c) => <MenuItem key={c} value={c}>{groupLabel(c)}</MenuItem>)}
              </TextField>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField select label="Pricing Type" value={form.pricingType} onChange={(e) => setField('pricingType', e.target.value)} size="small" fullWidth>
                {PRICING_TYPES.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
              </TextField>
              <TextField label="Unit" value={form.unit} onChange={(e) => setField('unit', e.target.value)} size="small" fullWidth />
            </Stack>

            {form.pricingType === 'per_sqft' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField label="Rate per Sq.Ft (₹)" type="number" value={form.ratePerSqft} onChange={(e) => setField('ratePerSqft', e.target.value)} size="small" fullWidth />
                <TextField label="Minimum Billing Sq.Ft" type="number" value={form.minBillingSqft} onChange={(e) => setField('minBillingSqft', e.target.value)} size="small" fullWidth helperText="Floor area charged per piece" />
              </Stack>
            )}

            {form.pricingType === 'per_piece' && (
              <TextField label="Rate per Piece (₹)" type="number" value={form.ratePerPiece} onChange={(e) => setField('ratePerPiece', e.target.value)} size="small" fullWidth />
            )}

            {form.pricingType === 'slab' && (
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">Quantity Slabs</Typography>
                  <Button size="small" startIcon={<AddRoundedIcon />} onClick={addSlab} variant="outlined" sx={{ borderRadius: 2 }}>Add Slab</Button>
                </Stack>
                {form.slabs.map((slab, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <TextField label="Min Qty" type="number" size="small" value={slab.minQty} onChange={(e) => updateSlab(idx, 'minQty', Number(e.target.value))} sx={{ width: 100 }} />
                      <TextField label="Max Qty (0 = ∞)" type="number" size="small" value={slab.maxQty} onChange={(e) => updateSlab(idx, 'maxQty', Number(e.target.value))} sx={{ width: 130 }} />
                      <TextField label="Rate/Pc (₹)" type="number" size="small" value={slab.ratePerPiece} onChange={(e) => updateSlab(idx, 'ratePerPiece', Number(e.target.value))} sx={{ width: 110 }} />
                      <TextField label="Or Flat Price (₹)" type="number" size="small" value={slab.flatPrice} onChange={(e) => updateSlab(idx, 'flatPrice', Number(e.target.value))} sx={{ width: 130 }} />
                      <IconButton size="small" color="error" onClick={() => removeSlab(idx)}><DeleteRoundedIcon fontSize="small" /></IconButton>
                    </Stack>
                  </Paper>
                ))}
                {form.slabs.length === 0 && (
                  <Typography variant="caption" color="text.secondary">No slabs yet. e.g. 1-99 @ ₹5/pc, 100-499 @ ₹3/pc, 500+ @ ₹2/pc.</Typography>
                )}
              </Stack>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField label="GST %" type="number" value={form.gstPercent} onChange={(e) => setField('gstPercent', e.target.value)} size="small" fullWidth />
              <TextField label="Minimum Order Qty" type="number" value={form.minQty} onChange={(e) => setField('minQty', e.target.value)} size="small" fullWidth />
            </Stack>

            <TextField label="Notes" value={form.notes} onChange={(e) => setField('notes', e.target.value)} size="small" fullWidth multiline minRows={2} />

            <Stack direction="row" alignItems="center" spacing={1}>
              <Switch checked={form.isActive} onChange={(e) => setField('isActive', e.target.checked)} />
              <Typography variant="body2">Active (available in Rate Calculator)</Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button disabled={saving} variant="contained" onClick={save}>
            {saving ? <CircularProgress size={18} /> : editId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
