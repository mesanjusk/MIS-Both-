import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import {
  fetchWeddingCardSubcategories, createWeddingCardSubcategory,
  updateWeddingCardSubcategory, deleteWeddingCardSubcategory
} from '../../services/weddingCardService';

const cleanCode = value => value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
const validCode = code => /^[A-Z][A-Z0-9_-]{0,11}$/.test(code);

export default function WeddingSubcategoryManager({ open, onClose, onChanged }) {
  const [rows, setRows] = useState([]);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editForm, setEditForm] = useState({ code: '', label: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await fetchWeddingCardSubcategories();
      setRows(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load Wedding Card subcategories');
    } finally { setLoading(false); }
  };
  useEffect(() => { if (open) { setError(''); setInfo(''); load(); } }, [open]);

  const afterSaved = async change => {
    await load();
    await onChanged?.(change);
    setError('');
  };
  const add = async () => {
    const cleaned = cleanCode(code);
    if (!validCode(cleaned)) return setError('Code must start with a letter and contain 1–12 letters, digits, _ or -');
    setSaving(true);
    try {
      const created = await createWeddingCardSubcategory({
        code: cleaned, label: label.trim() || 'SK (' + cleaned + ')'
      });
      setCode(''); setLabel('');
      await afterSaved({ type: 'add', code: created.code });
      setInfo('Subcategory created. You can now add card numbers inside it.');
    } catch (err) { setError(err.response?.data?.message || 'Could not create subcategory'); }
    finally { setSaving(false); }
  };
  const edit = async () => {
    const next = cleanCode(editForm.code);
    if (!validCode(next)) return setError('Choose a valid code starting with a letter (maximum 12 characters)');
    setSaving(true);
    try {
      const updated = await updateWeddingCardSubcategory(editCode, {
        code: next, label: editForm.label.trim() || 'SK (' + next + ')'
      });
      setEditCode('');
      await afterSaved({ type: 'rename', oldCode: editCode, code: updated.code });
      setInfo('Subcategory updated. All existing card numbers and rates are preserved.');
    } catch (err) { setError(err.response?.data?.message || 'Could not update subcategory'); }
    finally { setSaving(false); }
  };
  const remove = async row => {
    const used = (row.activeCount || 0) + (row.archivedCount || 0);
    if (used) return setError('Move or reassign all active and archived card numbers before deleting.');
    if (!window.confirm('Delete empty subcategory "' + row.label + '"?')) return;
    setSaving(true);
    try {
      await deleteWeddingCardSubcategory(row.code);
      await afterSaved({ type: 'delete', code: row.code });
      setInfo('Empty subcategory deleted.');
    } catch (err) { setError(err.response?.data?.message || 'Could not delete subcategory'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} fullWidth maxWidth="md" onClose={saving ? undefined : onClose}>
      <DialogTitle sx={{ fontWeight: 900 }}>Wedding Card — Manage Subcategories</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Stack gap={1.5}>
          <Alert severity="info">
            SK (M), SK (K) and new subcategories are all inside the same Wedding Card item.
            Renaming a code also moves its existing card numbers. Deletion is allowed only for
            empty subcategories, including archived records.
          </Alert>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
          {info && <Alert severity="success" onClose={() => setInfo('')}>{info}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <TextField size="small" label="New code (e.g. P)" value={code}
              onChange={e => setCode(cleanCode(e.target.value))}
              inputProps={{ maxLength: 12 }} sx={{ minWidth: 150 }} />
            <TextField size="small" label="Display name (optional)"
              placeholder={code ? 'SK (' + code + ')' : 'e.g. Premium Cards'}
              value={label} onChange={e => setLabel(e.target.value)}
              inputProps={{ maxLength: 60 }} fullWidth />
            <Button variant="contained" size="small" startIcon={<AddRoundedIcon />}
              onClick={add} disabled={saving || !validCode(code)}>
              Add
            </Button>
          </Stack>
          {loading ? <Box sx={{ textAlign: 'center', p: 3 }}><CircularProgress size={22}/></Box> : (
            <TableContainer sx={{ maxHeight: 390, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>Subcategory</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800 }}>Cards</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>Actions</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.code}>
                      <TableCell>
                        {editCode === row.code ? (
                          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                            <TextField size="small" label="Code" value={editForm.code}
                              onChange={e => setEditForm(f => ({ ...f, code: cleanCode(e.target.value) }))}
                              sx={{ width: 130 }} />
                            <TextField size="small" label="Name" fullWidth value={editForm.label}
                              inputProps={{ maxLength: 60 }}
                              onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
                            <Button size="small" disabled={saving} onClick={edit}>Save</Button>
                            <Button size="small" disabled={saving} onClick={() => setEditCode('')}>Cancel</Button>
                          </Stack>
                        ) : (
                          <Stack gap={0.2}>
                            <Typography variant="body2" fontWeight={800}>{row.label}</Typography>
                            <Typography variant="caption" color="text.secondary">Code: {row.code}</Typography>
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={(row.activeCount || 0) + ' active'} variant="outlined" />
                        {!!row.archivedCount && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {row.archivedCount} archived
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Rename code or display name">
                          <span><IconButton disabled={saving || !!editCode} size="small" onClick={() => {
                            setEditCode(row.code); setEditForm({ code: row.code, label: row.label });
                          }}><EditRoundedIcon fontSize="small" /></IconButton></span>
                        </Tooltip>
                        <Tooltip title={(row.activeCount || 0) + (row.archivedCount || 0)
                          ? 'Move card records before deleting' : 'Delete empty subcategory'}>
                          <span><IconButton size="small" color="error"
                            disabled={saving || !!editCode || !!(row.activeCount + row.archivedCount)}
                            onClick={() => remove(row)}><DeleteRoundedIcon fontSize="small"/></IconButton></span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rows.length && <TableRow><TableCell colSpan={3} align="center">
                    No subcategories. Add one above.
                  </TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button disabled={saving} onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
