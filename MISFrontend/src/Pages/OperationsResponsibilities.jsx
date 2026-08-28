import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  FormControlLabel, InputLabel, MenuItem, Select, Stack, Switch, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import DownloadingIcon from '@mui/icons-material/Downloading';
import {
  PageContainer, SectionCard, DataTableWrapper, LoadingState, EmptyState, ErrorState,
} from '../Components/ui';
import { categoryLabel, ownerRoleLabel, OWNERSHIP_SLOTS } from '../constants/operations';
import { useAuth } from '../context/AuthContext';
import {
  fetchResponsibilities, createResponsibility, updateResponsibility, deleteResponsibility,
  fetchOperationsUsers, fetchOperationsSettings, seedOperationsDefaults,
} from '../services/operationsService';

/**
 * One ownership slot in the matrix. Defined at module scope so editing a row
 * does not remount the whole table (which would drop the open dropdown).
 */
/** "Ana (P1)", or "AI Assistant (AI · automated)" for a virtual operator. */
const operatorLabel = (user) => {
  const name = user.name || user.User_name;
  const bits = [user.operations?.priority, user.isVirtual ? 'automated' : ''].filter(Boolean);
  return bits.length ? `${name} (${bits.join(' · ')})` : name;
};

function SlotSelect({ value, users, userNames, disabled, onChange }) {
  // A row can still point at a user who has since been deactivated; show the
  // stored value as blank rather than crashing MUI on an unknown option.
  const known = !value || users.some((user) => user.User_uuid === value);
  return (
    <FormControl size="small" fullWidth disabled={disabled}>
      <Select
        value={known ? value : ''}
        displayEmpty
        onChange={(event) => onChange(event.target.value)}
        renderValue={(selected) => (selected ? userNames.get(selected) || 'Unknown user' : 'Select user')}
      >
        <MenuItem value="">— None —</MenuItem>
        {users.map((user) => (
          <MenuItem key={user.User_uuid} value={user.User_uuid}>{operatorLabel(user)}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

SlotSelect.propTypes = {
  value: PropTypes.string,
  users: PropTypes.array.isRequired,
  userNames: PropTypes.instanceOf(Map).isRequired,
  disabled: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
};

const EMPTY_CHAIN = Object.fromEntries(OWNERSHIP_SLOTS.map((slot) => [slot.field, '']));

const EMPTY_FORM = {
  name: '',
  description: '',
  category: 'general',
  ...EMPTY_CHAIN,
  isCritical: false,
  isActive: true,
  sortOrder: 0,
};

/**
 * Settings → Operations → Responsibilities.
 *
 * Every dropdown is populated from the live user list; nothing on this screen
 * is a hard-coded name. Saving a row rewrites only the configuration — who
 * actually owns the work today is recomputed from attendance on every load.
 */
export default function OperationsResponsibilities() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const canEdit = isAdmin || isSuperAdmin;

  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  // The AI assistant and any other standing automation — assignable to a slot
  // exactly like a person, so an area handled by AI is configured here rather
  // than living outside the chain.
  const [virtualOperators, setVirtualOperators] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUuid, setEditUuid] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [respRes, usersRes, settingsRes] = await Promise.all([
        fetchResponsibilities(),
        fetchOperationsUsers(),
        fetchOperationsSettings(),
      ]);
      setRows(respRes.data?.result || []);
      setUsers(usersRes.data?.result || []);
      setVirtualOperators(usersRes.data?.virtualOperators || []);
      setCategories(settingsRes.data?.result?.categories || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load responsibilities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only users who are active in operations can be picked; a deactivated user
  // still shows on rows that already reference them so the gap is visible.
  const selectableUsers = useMemo(
    () => [
      ...users.filter((user) => user.operations?.active !== false),
      ...virtualOperators.filter((operator) => operator.operations?.active !== false),
    ],
    [users, virtualOperators],
  );
  const userNameByUuid = useMemo(
    () => new Map(
      [...users, ...virtualOperators].map((user) => [user.User_uuid, user.name || user.User_name]),
    ),
    [users, virtualOperators],
  );

  const openCreate = () => {
    setEditUuid(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditUuid(row.responsibility_uuid);
    setForm({
      name: row.name || '',
      description: row.description || '',
      category: row.category || 'general',
      ...Object.fromEntries(OWNERSHIP_SLOTS.map((slot) => [slot.field, row[slot.field] || ''])),
      isCritical: !!row.isCritical,
      isActive: row.isActive !== false,
      sortOrder: row.sortOrder || 0,
    });
    setShowModal(true);
  };

  const setField = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /** Inline slot change straight from the matrix — the common daily edit. */
  const changeSlot = async (row, slot, value) => {
    setError('');
    setSuccess('');
    try {
      await updateResponsibility(row.responsibility_uuid, { [slot]: value });
      setSuccess(`${row.name} updated`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Update failed');
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editUuid) await updateResponsibility(editUuid, form);
      else await createResponsibility(form);
      setShowModal(false);
      setSuccess(editUuid ? 'Responsibility updated' : 'Responsibility created');
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteResponsibility(deleteTarget.responsibility_uuid);
      setDeleteTarget(null);
      setSuccess('Responsibility deleted');
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Delete failed');
    }
  };

  const seed = async () => {
    setSeeding(true);
    setError('');
    try {
      const res = await seedOperationsDefaults();
      const created = res.data?.result?.responsibilities?.created ?? 0;
      setSuccess(
        created
          ? `${created} default responsibilities added — assign users to each one below.`
          : 'Defaults already present; nothing was overwritten.',
      );
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Seeding failed');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <PageContainer
      title="Responsibilities"
      subtitle="Settings → Operations → Responsibilities. Primary and Backups 1–4 are stored as operators — staff, the owner, or the AI assistant — so re-assigning a priority never re-points a responsibility."
      actions={(
        <>
          <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load}>Refresh</Button>
          {canEdit ? (
            <>
              <Button size="small" startIcon={<DownloadingIcon />} onClick={seed} disabled={seeding}>
                {seeding ? 'Seeding...' : 'Seed defaults'}
              </Button>
              <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                Add
              </Button>
            </>
          ) : null}
        </>
      )}
    >
      {error ? <ErrorState message={error} /> : null}
      {success ? <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert> : null}
      {!canEdit ? <Typography variant="caption" color="text.secondary">Read-only</Typography> : null}

      {loading ? <LoadingState label="Loading responsibilities..." /> : (
        <SectionCard>
          <DataTableWrapper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 180 }}>Responsibility</TableCell>
                  <TableCell sx={{ minWidth: 130 }}>Category</TableCell>
                  {OWNERSHIP_SLOTS.map((slot) => (
                    <TableCell key={slot.field} sx={{ minWidth: 180 }}>{slot.label}</TableCell>
                  ))}
                  <TableCell sx={{ minWidth: 160 }}>Owner Now</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.responsibility_uuid} hover>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2">{row.name}</Typography>
                        {row.isCritical ? <Chip size="small" color="warning" label="Critical" /> : null}
                        {row.isActive === false ? <Chip size="small" label="Inactive" /> : null}
                      </Stack>
                    </TableCell>
                    <TableCell>{categoryLabel(row.category)}</TableCell>
                    {OWNERSHIP_SLOTS.map((slot) => (
                      <TableCell key={slot.field}>
                        <SlotSelect
                          value={row[slot.field] || ''}
                          users={selectableUsers}
                          userNames={userNameByUuid}
                          disabled={!canEdit}
                          onChange={(value) => changeSlot(row, slot.field, value)}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      {row.resolution?.currentOwner ? (
                        <Tooltip title={row.resolution.currentOwner.reason || ''}>
                          <Chip
                            size="small"
                            color="success"
                            label={`${row.resolution.currentOwner.userName} · ${ownerRoleLabel(row.resolution.currentOwner.role)}`}
                          />
                        </Tooltip>
                      ) : (
                        <Chip size="small" color="error" label="⚠️ NO AVAILABLE OWNER" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button size="small" onClick={() => openEdit(row)} disabled={!canEdit}>Edit</Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => setDeleteTarget(row)}
                          disabled={!canEdit}
                        >
                          <DeleteIcon fontSize="small" />
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length ? (
                  <TableRow>
                    <TableCell colSpan={OWNERSHIP_SLOTS.length + 4}>
                      <EmptyState
                        title="No responsibilities yet"
                        description="Use “Seed defaults” to create the standard list with every slot left unassigned."
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </SectionCard>
      )}

      <Dialog open={showModal} onClose={() => setShowModal(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editUuid ? 'Edit responsibility' : 'Add responsibility'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" size="small" value={form.name} onChange={setField('name')} fullWidth />
            <TextField
              label="Description"
              size="small"
              value={form.description}
              onChange={setField('description')}
              fullWidth
              multiline
              minRows={2}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Category</InputLabel>
              <Select label="Category" value={form.category} onChange={setField('category')}>
                {categories.map((category) => (
                  <MenuItem key={category} value={category}>{categoryLabel(category)}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              Outside Logistics work stays with a user who is marked Outside; Inside Store work
              moves to their backup so the store floor keeps running. Slots can also hold the AI
              assistant, which is always available and never steps out of the chain.
            </Typography>
            {OWNERSHIP_SLOTS.map((slot) => (
              <FormControl size="small" fullWidth key={slot.field}>
                <InputLabel>{slot.label}</InputLabel>
                <Select label={slot.label} value={form[slot.field]} onChange={setField(slot.field)}>
                  <MenuItem value="">— None —</MenuItem>
                  {selectableUsers.map((user) => (
                    <MenuItem key={user.User_uuid} value={user.User_uuid}>{operatorLabel(user)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            ))}
            <TextField
              label="Sort order"
              size="small"
              type="number"
              value={form.sortOrder}
              onChange={setField('sortOrder')}
            />
            <FormControlLabel
              control={<Switch checked={form.isCritical} onChange={setField('isCritical')} />}
              label="Critical (must have backup cover)"
            />
            <FormControlLabel
              control={<Switch checked={form.isActive} onChange={setField('isActive')} />}
              label="Active"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete responsibility</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete “{deleteTarget?.name}”? Tasks already linked to it keep their own user chain.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
