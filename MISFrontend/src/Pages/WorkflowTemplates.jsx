import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import {
  fetchWorkflowTemplates,
  createWorkflowTemplate,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
} from '../services/workflowTemplateService';
import { fetchVendorMasters } from '../services/vendorService';

const STAGES = [
  { value: 'design', label: 'Design' },
  { value: 'printing', label: 'Printing' },
  { value: 'post_printing', label: 'Post Printing' },
  { value: 'finishing', label: 'Finishing' },
  { value: 'ready', label: 'Ready' },
  { value: 'delivered', label: 'Delivered' },
];

const ASSIGN_GROUPS = ['Designer', 'PostDesign', 'Delivery', 'Accounts', 'Office'];

const BLANK_STEP = {
  order: 1,
  label: '',
  stage: 'design',
  autoAssignGroup: '',
  requiresVendor: false,
  vendorWorkType: '',
  preferredVendorUuid: '',
  isOptional: false,
};

const BLANK_TEMPLATE = { itemNamePattern: '', description: '', steps: [{ ...BLANK_STEP }], isActive: true };

function StepChip({ step }) {
  return (
    <Chip
      size="small"
      label={`${step.order}. ${step.label}${step.stage ? ` (${step.stage})` : ''}${step.requiresVendor ? ' 🔧' : ''}${step.autoAssignGroup ? ` → ${step.autoAssignGroup}` : ''}`}
      sx={{ m: 0.3, fontWeight: 700, fontSize: 11 }}
      variant="outlined"
    />
  );
}

export default function WorkflowTemplates() {
  const [templates, setTemplates] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(BLANK_TEMPLATE);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, vRes] = await Promise.allSettled([fetchWorkflowTemplates(), fetchVendorMasters()]);
      if (tRes.status === 'fulfilled') setTemplates(Array.isArray(tRes.value) ? tRes.value : []);
      if (vRes.status === 'fulfilled') setVendors(Array.isArray(vRes.value) ? vRes.value : []);
    } catch (err) {
      setMessage({ severity: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(BLANK_TEMPLATE);
    setEditId(null);
    setDialog('edit');
  };

  const openEdit = (t) => {
    setForm({ itemNamePattern: t.itemNamePattern, description: t.description || '', steps: t.steps || [], isActive: t.isActive });
    setEditId(t.template_uuid);
    setDialog('edit');
  };

  const saveTemplate = async () => {
    if (!form.itemNamePattern.trim()) return setMessage({ severity: 'error', text: 'Item name pattern is required' });
    if (!form.steps.length) return setMessage({ severity: 'error', text: 'At least one step is required' });
    setSaving(true);
    try {
      if (editId) {
        await updateWorkflowTemplate(editId, form);
      } else {
        await createWorkflowTemplate(form);
      }
      setDialog(null);
      setMessage({ severity: 'success', text: editId ? 'Template updated' : 'Template created' });
      await load();
    } catch (err) {
      setMessage({ severity: 'error', text: err?.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await deleteWorkflowTemplate(id);
      setMessage({ severity: 'success', text: 'Template deleted' });
      await load();
    } catch (err) {
      setMessage({ severity: 'error', text: err.message });
    }
  };

  const addStep = () => {
    const maxOrder = form.steps.reduce((m, s) => Math.max(m, s.order || 0), 0);
    setForm((f) => ({ ...f, steps: [...f.steps, { ...BLANK_STEP, order: maxOrder + 1 }] }));
  };

  const removeStep = (idx) => setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }));

  const updateStep = (idx, field, value) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s, i) => i === idx ? { ...s, [field]: value } : s) }));

  const moveStep = (idx, dir) => {
    const steps = [...form.steps];
    const swap = idx + dir;
    if (swap < 0 || swap >= steps.length) return;
    [steps[idx], steps[swap]] = [steps[swap], steps[idx]];
    steps.forEach((s, i) => { s.order = i + 1; });
    setForm((f) => ({ ...f, steps }));
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, bgcolor: 'background.default', minHeight: '100%' }}>
      <Paper elevation={0} sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <AccountTreeRoundedIcon sx={{ color: 'primary.main' }} />
              <Typography variant="h5" fontWeight={900} color="primary.main">Item Workflow Templates</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Define once per item type — the system auto-creates steps, assigns people, and advances stages for every matching order.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}
            sx={{ borderRadius: 2.5 }}>
            New Template
          </Button>
        </Stack>

        {message && <Alert severity={message.severity} sx={{ mt: 1.5, borderRadius: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

        <Divider sx={{ my: 1.5 }} />

        {loading ? (
          <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>
        ) : templates.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <AccountTreeRoundedIcon sx={{ fontSize: 48, color: 'primary.light', mb: 1 }} />
            <Typography color="text.secondary">No templates yet. Create one to automate your order workflow.</Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>Item Pattern</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Steps</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Active</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {templates.map((t) => (
                  <TableRow hover key={t.template_uuid}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={900} color="primary.main">{t.itemNamePattern}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{t.description || '-'}</Typography></TableCell>
                    <TableCell sx={{ maxWidth: 400 }}>
                      <Box>{(t.steps || []).map((s, i) => <StepChip key={i} step={s} />)}</Box>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={t.isActive ? 'Active' : 'Inactive'} color={t.isActive ? 'success' : 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(t)}><EditRoundedIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => removeTemplate(t.template_uuid)}><DeleteRoundedIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Create / Edit Dialog */}
      <Dialog open={dialog === 'edit'} onClose={() => setDialog(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 900 }}>{editId ? 'Edit Template' : 'New Template'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Item Name Pattern"
                placeholder="e.g. Brochure, Business Card, Flex Banner"
                value={form.itemNamePattern}
                onChange={(e) => setForm((f) => ({ ...f, itemNamePattern: e.target.value }))}
                fullWidth
                helperText="Orders containing this item name will automatically get these steps"
              />
              <TextField
                label="Description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                fullWidth
              />
            </Stack>

            <Stack direction="row" alignItems="center" spacing={1}>
              <Switch checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              <Typography variant="body2">Active (new orders will use this template)</Typography>
            </Stack>

            <Divider />

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1" fontWeight={900}>Workflow Steps</Typography>
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={addStep} variant="outlined" sx={{ borderRadius: 2 }}>Add Step</Button>
            </Stack>

            {form.steps.map((step, idx) => (
              <Card key={idx} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.default' }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                    <Chip size="small" label={`Step ${step.order}`} sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 900 }} />
                    <Box flex={1} />
                    <Tooltip title="Move up">
                      <IconButton size="small" onClick={() => moveStep(idx, -1)} disabled={idx === 0}><ArrowUpwardRoundedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <IconButton size="small" onClick={() => moveStep(idx, 1)} disabled={idx === form.steps.length - 1}><ArrowDownwardRoundedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Remove step">
                      <IconButton size="small" color="error" onClick={() => removeStep(idx)}><DeleteRoundedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} flexWrap="wrap">
                    <TextField
                      label="Step Label"
                      placeholder="Design, Printing, Lamination…"
                      value={step.label}
                      onChange={(e) => updateStep(idx, 'label', e.target.value)}
                      size="small"
                      sx={{ flex: 1, minWidth: 140 }}
                    />
                    <TextField
                      label="Stage"
                      select
                      value={step.stage || ''}
                      onChange={(e) => updateStep(idx, 'stage', e.target.value)}
                      size="small"
                      sx={{ flex: 1, minWidth: 140 }}
                    >
                      <MenuItem value="">None</MenuItem>
                      {STAGES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                    </TextField>
                    <TextField
                      label="Auto-assign Group"
                      select
                      value={step.autoAssignGroup || ''}
                      onChange={(e) => updateStep(idx, 'autoAssignGroup', e.target.value)}
                      size="small"
                      sx={{ flex: 1, minWidth: 140 }}
                    >
                      <MenuItem value="">None</MenuItem>
                      {ASSIGN_GROUPS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                    </TextField>
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} flexWrap="wrap" mt={1}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Switch
                        size="small"
                        checked={!!step.requiresVendor}
                        onChange={(e) => updateStep(idx, 'requiresVendor', e.target.checked)}
                      />
                      <Typography variant="caption">Needs Vendor</Typography>
                    </Stack>

                    {step.requiresVendor && (
                      <>
                        <TextField
                          label="Work Type"
                          placeholder="Printing, Lamination…"
                          value={step.vendorWorkType || ''}
                          onChange={(e) => updateStep(idx, 'vendorWorkType', e.target.value)}
                          size="small"
                          sx={{ flex: 1, minWidth: 140 }}
                        />
                        <TextField
                          label="Preferred Vendor"
                          select
                          value={step.preferredVendorUuid || ''}
                          onChange={(e) => updateStep(idx, 'preferredVendorUuid', e.target.value)}
                          size="small"
                          sx={{ flex: 1, minWidth: 160 }}
                        >
                          <MenuItem value="">Auto / None</MenuItem>
                          {vendors.map((v) => <MenuItem key={v.Vendor_uuid} value={v.Vendor_uuid}>{v.Vendor_name}</MenuItem>)}
                        </TextField>
                      </>
                    )}

                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Switch
                        size="small"
                        checked={!!step.isOptional}
                        onChange={(e) => updateStep(idx, 'isOptional', e.target.checked)}
                      />
                      <Typography variant="caption">Optional</Typography>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}

            {form.steps.length === 0 && (
              <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">No steps yet. Click "Add Step" to define the workflow.</Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button disabled={saving} variant="contained" onClick={saveTemplate}
            sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}>
            {saving ? <CircularProgress size={18} /> : editId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
