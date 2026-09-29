import { useEffect, useState } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import axios from '../../apiClient';

const TITLES = {
  customer: 'Add Customer',
  stage: 'Add Stage Shortcut',
  assignee: 'Add Assignable Party',
  item: 'Add Item to Master',
};
const preferredGroup = (groups, kind) => {
  if (kind === 'assignee') return 'Account Payable';
  const values = groups.map((row) => row.Customer_group).filter(Boolean);
  return values.find((name) => /^account\s*receivable$/i.test(name))
    || values.find((name) => /^customer$/i.test(name))
    || values.find((name) => !/^account\s*payable$/i.test(name))
    || 'Customer';
};

export default function ConfirmFinalMasterAddDialog({
  kind, onClose, onCreated, stage = 'print', stageCapability = 'print', stageOptions = [],
}) {
  const open = Boolean(kind);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [group, setGroup] = useState('');
  const [groupOptions, setGroupOptions] = useState([]);
  const [canonicalStage, setCanonicalStage] = useState(stage);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setName('');
    setMobile('');
    setGroup(kind === 'assignee' ? 'Account Payable' : '');
    setCanonicalStage(stage);
    setError('');
    if (!['customer', 'item'].includes(kind)) return () => { active = false; };
    setLoading(true);
    const path = kind === 'customer'
      ? '/api/customergroup/GetCustomergroupList'
      : '/api/itemgroup/GetItemgroupList';
    axios.get(path, { cache: false })
      .then(({ data }) => {
        if (!active) return;
        const options = Array.isArray(data?.result) ? data.result : [];
        const names = options
          .map((row) => kind === 'customer' ? row.Customer_group : row.Item_group)
          .filter(Boolean);
        setGroupOptions([...new Set(names)]);
        setGroup(kind === 'customer' ? preferredGroup(options, kind) : (names[0] || 'General'));
      })
      .catch((err) => {
        if (!active) return;
        // A new installation can legitimately have no group master yet.
        if (err?.response?.status !== 404) setError('Unable to load groups. Check the connection before saving.');
        setGroup(kind === 'customer' ? 'Customer' : 'General');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, kind, stage]);

  const save = async () => {
    const label = name.trim().replace(/\s+/g, ' ');
    if (!label || !group && ['customer', 'item'].includes(kind)) {
      setError('Enter a name and select a group.');
      return;
    }
    if (mobile && !/^\d{10}$/.test(mobile)) {
      setError('Mobile must contain exactly 10 digits.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let saved = null;
      if (kind === 'customer' || kind === 'assignee') {
        await axios.post('/api/customers/addCustomer', {
          Customer_name: label,
          Customer_group: kind === 'assignee' ? 'Account Payable' : group,
          Mobile_number: mobile || undefined,
          PartyRoles: kind === 'assignee' ? ['vendor'] : ['customer'],
          Status: 'active',
          Capabilities: kind === 'assignee' ? [stageCapability] : [],
        });
      } else if (kind === 'item') {
        const { data } = await axios.post('/api/items/addItem', {
          Item_name: label, Item_group: group, itemType: 'finished_item',
          unit: 'Nos', stockTracked: false, defaultSaleRate: 0,
        });
        saved = data?.result || null;
      } else if (kind === 'stage') {
        const { data } = await axios.post('/api/design-files/confirm-stage-shortcuts', {
          label, canonicalStage,
        });
        saved = data?.result || null;
      }
      // The parent reloads only the relevant dropdown and selects the saved
      // record by its UUID/ID where available. Preserve every other form field.
      await onCreated?.({ kind, name: label, saved, canonicalStage });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not add this record.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth
      aria-labelledby="confirm-final-add-title">
      <DialogTitle id="confirm-final-add-title">{TITLES[kind] || 'Add'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField autoFocus size="small" fullWidth required
            label={kind === 'stage' ? 'Stage shortcut name' : kind === 'item' ? 'New item name' : 'Name'}
            inputProps={{ maxLength: kind === 'stage' ? 60 : 200 }}
            value={name} onChange={(event) => setName(event.target.value)}
            disabled={busy || loading} />
          {kind === 'customer' && (
            <TextField select size="small" required label="Customer group" value={group}
              onChange={(event) => setGroup(event.target.value)} disabled={busy || loading}>
              {[...new Set([group, ...groupOptions].filter(Boolean))].map((entry) =>
                <MenuItem key={entry} value={entry}>{entry}</MenuItem>)}
            </TextField>
          )}
          {kind === 'item' && (
            <TextField select size="small" required label="Item group" value={group}
              onChange={(event) => setGroup(event.target.value)} disabled={busy || loading}>
              {[...new Set([group, ...groupOptions].filter(Boolean))].map((entry) =>
                <MenuItem key={entry} value={entry}>{entry}</MenuItem>)}
            </TextField>
          )}
          {['customer', 'assignee'].includes(kind) && (
            <TextField size="small" label="Mobile (optional)" value={mobile}
              placeholder="10-digit number" inputProps={{ maxLength: 10, inputMode: 'numeric' }}
              onChange={(event) => {
                if (/^\d{0,10}$/.test(event.target.value)) setMobile(event.target.value);
              }} disabled={busy || loading} />
          )}
          {kind === 'assignee' && (
            <Typography variant="caption" color="text.secondary">
              Creates an active Account Payable party tagged for this order stage
              ({stageCapability}). Existing assignees are unchanged.
            </Typography>
          )}
          {kind === 'stage' && (
            <>
              <TextField select size="small" label="Maps to existing MIS stage" value={canonicalStage}
                onChange={(event) => setCanonicalStage(event.target.value)} disabled={busy}>
                {stageOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
              <Alert severity="info" sx={{ py: 0.25 }}>
                Adds a selectable name, not a new workflow state. It follows the existing selected MIS stage,
                preserving order history, assignments and production routing.
              </Alert>
            </>
          )}
          {kind === 'item' && (
            <Typography variant="caption" color="text.secondary">
              Adds this item to the master with no invented sale rate. Current order quantities, rates and charges remain editable.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={busy || loading || !name.trim() ||
          (['customer', 'item'].includes(kind) && !group) ||
          (kind === 'stage' && !canonicalStage)}
          startIcon={busy ? <CircularProgress size={14} /> : <AddRoundedIcon />}
          onClick={save}>Add {kind === 'stage' ? 'Shortcut' : kind === 'assignee' ? 'Assignee' : kind}</Button>
      </DialogActions>
    </Dialog>
  );
}
