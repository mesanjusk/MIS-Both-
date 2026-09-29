import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, ListSubheader, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import axios from '../../apiClient';
import { canQuickCreateMisOrder } from './archiveOrderEligibility';
import { fetchAssignees } from '../../services/assigneeService';
import {
  WORKFLOW_GROUPS, WORKFLOW_SECTIONS, STAGE_TO_CAPABILITY, CAPABILITY_LABELS,
} from '../../constants/orderStages';

// Use the same stages as the full Confirm Final dialog. The Today/New
// column's working stage is new_design (rather than the enquiry stage).
const sectionsByKey = new Map(WORKFLOW_SECTIONS.map((section) => [section.key, section]));
const designKeys = ['todaysNew', 'oldPending', 'designApproval', 'hold', 'readyToPrint'];
const stageGroups = WORKFLOW_GROUPS.map((group) => ({
  label: group.label,
  sections: (group.sectionKeys.length ? group.sectionKeys : designKeys)
    .map((key) => sectionsByKey.get(key)).filter(Boolean),
}));
const sectionStage = (section) => section.key === 'todaysNew' ? 'new_design' : section.stages[0];

/**
 * Fast-path creation for an unlinked Final file in Archive > month > date.
 * The existing full Confirm Final modal remains available under More actions.
 * A real Items[] row is created with no invented price/invoice.
 */
export default function ArchiveQuickOrderDialog({ open, file, onClose, onSuccess }) {
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [stage, setStage] = useState('print');
  const [assigneeId, setAssigneeId] = useState('');
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setCustomer(null);
    setStage('print');
    setAssigneeId('');
    setNewItem((file?.fileName || '').replace(/\.[^.]+$/, ''));
    setError('');
    setLoading(true);
    Promise.all([
      axios.get('/api/customers/GetCustomerList'),
      fetchAssignees(),
    ]).then(([customersResponse, assigneesResponse]) => {
      if (!active) return;
      setCustomers(customersResponse.data?.result || []);
      setAssignees((assigneesResponse.data?.result || []).filter((a) => a.type === 'payable'));
    }).catch((err) => {
      if (active) setError(err?.response?.data?.message || 'Could not load customers or assignees. Retry.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, file?.fileId, file?.fileName]);

  const stageCapability = STAGE_TO_CAPABILITY[stage] || 'design';
  const assigneeOptions = useMemo(() => {
    const tagged = assignees.filter((a) => a.capabilities?.includes(stageCapability));
    return tagged.length ? tagged : assignees;
  }, [assignees, stageCapability]);

  useEffect(() => {
    if (assigneeId && !assigneeOptions.some((assignee) => assignee.id === assigneeId)) {
      setAssigneeId('');
    }
  }, [assigneeId, assigneeOptions]);

  const canSubmit = !loading && !submitting && customer?.Customer_uuid && newItem.trim() && file?.fileId
    && canQuickCreateMisOrder(file);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await axios.post('/api/design-files/confirm-final', {
        fileId: file.fileId,
        fileName: file.fileName,
        customerUuid: customer.Customer_uuid,
        stage,
        assigneeId: assigneeId || null,
        fromArchive: true,
        orderMode: 'items',
        // One genuine order item. No artificial billing amount is created.
        items: [{ itemName: newItem.trim(), qty: 1, rate: 0, amount: 0, remark: '' }],
        itemDetails: '',
        extraCharges: [],
      });
      if (!data?.success) throw new Error(data?.message || 'Order was not created');
      onSuccess?.(`MIS Order #${data.orderNumber} created for "${file.fileName}". Archive refreshed.`);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Unable to create MIS order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(open)} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>+ Create MIS Order</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            Archive file: <strong>{file?.fileName || ''}</strong>
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Autocomplete
            options={customers}
            value={customer}
            onChange={(_, value) => setCustomer(value)}
            getOptionLabel={(item) => `${item?.Customer_name || ''}${item?.Mobile ? ` — ${item.Mobile}` : ''}`}
            isOptionEqualToValue={(a, b) => a.Customer_uuid === b.Customer_uuid}
            loading={loading}
            disabled={loading || submitting}
            renderInput={(params) => (
              <TextField {...params} label="Customer name *" size="small"
                placeholder="Select customer"
                InputProps={{ ...params.InputProps, endAdornment: <>
                  {loading ? <CircularProgress size={14} /> : null}
                  {params.InputProps.endAdornment}
                </> }}
              />
            )}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select label="Stage *" size="small" value={stage}
              onChange={(event) => setStage(event.target.value)}
              disabled={loading || submitting} sx={{ flex: 1 }}>
              {stageGroups.flatMap((group) => [
                <ListSubheader key={group.label}>{group.label}</ListSubheader>,
                ...group.sections.map((section) => (
                  <MenuItem key={section.key} value={sectionStage(section)}>{section.label}</MenuItem>
                )),
              ])}
            </TextField>
            <TextField select label="Assign to" size="small" value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              disabled={loading || submitting} sx={{ flex: 1 }}
              helperText={`${CAPABILITY_LABELS[stageCapability] || 'Stage'} parties`}>
              <MenuItem value="">Unassigned</MenuItem>
              {assigneeOptions.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label="New item *" size="small" value={newItem}
            onChange={(event) => setNewItem(event.target.value)} disabled={loading || submitting}
            placeholder="e.g. 500 visiting cards" inputProps={{ maxLength: 300 }}
            helperText="Adds one item (quantity 1, rate ₹0); edit order billing later." />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={14} /> : null}>
          Create MIS Order
        </Button>
      </DialogActions>
    </Dialog>
  );
}
