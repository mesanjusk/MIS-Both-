import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import {
  fetchRateCategories, createRateCategory,
  renameRateCategory, deleteRateCategory
} from '../../services/rateCategoryService';

export default function RateCategoryManager({ open, onClose, onChanged }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [editingUuid, setEditingUuid] = useState('');
  const [editName, setEditName] = useState('');
  const [message, setMessage] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await fetchRateCategories();
      setCategories(Array.isArray(result) ? result : []);
    } catch (err) {
      setMessage({ severity: 'error', text: err.response?.data?.message || 'Could not load categories' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (open) { setMessage(null); setEditingUuid(''); refresh(); }
  }, [open]);

  const visible = useMemo(
    () => categories.filter(row => row.name.toLowerCase().includes(search.toLowerCase().trim())),
    [categories, search]
  );

  const afterMutation = async text => {
    await refresh();
    await onChanged?.();
    setMessage({ severity: 'success', text });
  };
  const create = async (name = newName) => {
    const cleaned = name.trim();
    if (cleaned.length < 2) {
      setMessage({ severity: 'error', text: 'Enter a category name (at least two characters)' });
      return;
    }
    setBusy(true);
    try {
      await createRateCategory(cleaned);
      setNewName('');
      await afterMutation('Category "' + cleaned + '" added');
    } catch (err) {
      setMessage({ severity: 'error', text: err.response?.data?.message || 'Unable to add category' });
    } finally { setBusy(false); }
  };
  const rename = async row => {
    const cleaned = editName.trim();
    if (cleaned.length < 2) {
      setMessage({ severity: 'error', text: 'Enter a valid category name' });
      return;
    }
    setBusy(true);
    try {
      await renameRateCategory(row.uuid, cleaned);
      setEditingUuid('');
      await afterMutation('Category renamed to "' + cleaned + '". Linked items and rate cards are updated.');
    } catch (err) {
      setMessage({ severity: 'error', text: err.response?.data?.message || 'Unable to rename category' });
    } finally { setBusy(false); }
  };
  const remove = async row => {
    const used = row.itemCount + row.rateCardCount + row.childCount + (row.bomCount || 0);
    if (used) {
      setMessage({ severity: 'error', text: 'Reassign linked items, rate cards, BOM components and subcategories before deleting.' });
      return;
    }
    if (!window.confirm('Delete unused category "' + row.name + '"? This cannot be undone.')) return;
    setBusy(true);
    try {
      await deleteRateCategory(row.uuid);
      await afterMutation('Unused category "' + row.name + '" deleted');
    } catch (err) {
      setMessage({ severity: 'error', text: err.response?.data?.message || 'Unable to delete category' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} fullWidth maxWidth="md" onClose={busy ? undefined : onClose}>
      <DialogTitle sx={{ fontWeight: 900 }}>Manage Rate Calculator Categories</DialogTitle>
      <DialogContent>
        <Stack gap={1.5} sx={{ pt: 1 }}>
          <Alert severity="info">
            Categories use the shared Item Group master. Renaming a category also
            updates linked Items and Rate Cards. Deletion is allowed only when
            no item, rate card, BOM component or subcategory uses it.
          </Alert>
          {message && (
            <Alert severity={message.severity} onClose={() => setMessage(null)}>
              {message.text}
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <TextField size="small" label="New category name" fullWidth
              value={newName} onChange={event => setNewName(event.target.value)}
              inputProps={{ maxLength: 80 }}
              onKeyDown={event => { if (event.key === 'Enter') create(); }} />
            <Button size="small" variant="contained" startIcon={<AddRoundedIcon />}
              disabled={busy || !newName.trim()} onClick={() => create()}>
              Add Category
            </Button>
          </Stack>
          <TextField size="small" label="Find category" placeholder="Search existing categories"
            value={search} onChange={event => setSearch(event.target.value)} />
          {loading ? (
            <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={25} /></Box>
          ) : (
            <TableContainer sx={{ maxHeight: 430, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Category</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800 }}>Items</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800 }}>Rate Cards</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map(row => (
                    <TableRow key={row.uuid || 'legacy:' + row.name}>
                      <TableCell>
                        {editingUuid && editingUuid === row.uuid ? (
                          <Stack direction="row" gap={0.75}>
                            <TextField size="small" autoFocus fullWidth value={editName}
                              inputProps={{ maxLength: 80 }}
                              onChange={event => setEditName(event.target.value)}
                              onKeyDown={event => { if (event.key === 'Enter') rename(row); }} />
                            <Button size="small" disabled={busy} onClick={() => rename(row)}>Save</Button>
                            <Button size="small" disabled={busy} onClick={() => setEditingUuid('')}>Cancel</Button>
                          </Stack>
                        ) : (
                          <Stack gap={0.25}>
                            <Typography fontWeight={700} variant="body2">{row.name}</Typography>
                            {row.parentName && <Typography variant="caption" color="text.secondary">
                              Under {row.parentName}
                            </Typography>}
                            {!row.managed && <Chip label="Legacy category — register to manage"
                              variant="outlined" size="small" sx={{ alignSelf: 'flex-start' }} />}
                            {!!row.childCount && <Typography variant="caption" color="text.secondary">
                              {row.childCount} subcategories
                            </Typography>}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {row.itemCount}
                        {!!row.bomCount && <Typography variant="caption" display="block" color="text.secondary">
                          {row.bomCount} BOM refs
                        </Typography>}
                      </TableCell>
                      <TableCell align="center">{row.rateCardCount}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {!row.managed ? (
                          <Button size="small" disabled={busy} onClick={() => create(row.name)}>Register</Button>
                        ) : (
                          <>
                            <Tooltip title="Rename category and update linked references">
                              <span>
                                <IconButton size="small" disabled={busy || !!editingUuid}
                                  onClick={() => { setEditingUuid(row.uuid); setEditName(row.name); }}>
                                  <EditRoundedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={row.itemCount || row.rateCardCount || row.childCount || row.bomCount
                              ? 'In use: move linked entries before deleting'
                              : 'Delete unused category'}>
                              <span>
                                <IconButton size="small" color="error"
                                  disabled={busy || !!editingUuid || !!(row.itemCount || row.rateCardCount || row.childCount || row.bomCount)}
                                  onClick={() => remove(row)}>
                                  <DeleteRoundedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!visible.length && (
                    <TableRow><TableCell colSpan={4} align="center">No categories match your search</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
