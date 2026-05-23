import { useEffect, useState, useCallback } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem,
  Select, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadingIcon from '@mui/icons-material/Downloading';
import { PageContainer, SectionCard } from '../Components/ui';
import axios from '../apiClient';

const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const TIMES = ['morning', 'during_day', 'evening', 'any'];
const SECTIONS = [
  'Section 1 — Day Start',
  'Section 2 — Enquiry Handling',
  'Section 3 — Quotation and Estimation',
  'Section 4 — Order Confirmation and Booking',
  'Section 5 — Design Workflow',
  'Section 6 — Production Planning and Vendor Assignment',
  'Section 7 — Printing and Production',
  'Section 8 — Post-Printing',
  'Section 9 — Quality Check',
  'Section 10 — Packing and Dispatch',
  'Section 11 — Delivery and Proof of Delivery',
  'Section 12 — Payment Collection and Follow-up',
  'Section 13 — Vendor Payment Management',
  'Section 14 — Customer Relationship Management',
  'Section 15 — Marketing and Lead Generation',
  'Section 16 — Inventory Management',
  'Section 17 — Day End Procedures',
];

const TIME_COLOR = {
  morning: 'warning',
  during_day: 'info',
  evening: 'secondary',
  any: 'default',
};

const TIME_LABEL = {
  morning: 'Morning',
  during_day: 'During Day',
  evening: 'Evening',
  any: 'Any Time',
};

const EMPTY_FORM = {
  title: '',
  description: '',
  section: '',
  frequency: 'daily',
  timeOfDay: 'any',
  primaryGroup: '',
  fallbackGroups: ['', '', ''],
  isSkippable: false,
  isActive: true,
  sortOrder: 0,
  kpi: '',
};

export default function SopPage() {
  const [tasks, setTasks] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterGroup, setFilterGroup] = useState('');
  const [filterFrequency, setFilterFrequency] = useState('');
  const [filterTime, setFilterTime] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/sop/tasks');
      setTasks(res.data.result || []);
    } catch {
      setError('Failed to load SOP tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await axios.get('/api/usergroup/GetUsergroupList');
      setUserGroups((res.data.result || []).map((g) => g.User_group));
    } catch {
      setUserGroups([]);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchGroups();
  }, [fetchTasks, fetchGroups]);

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (task) => {
    setEditId(task._id);
    const fallbacks = [...(task.fallbackGroups || []), '', '', ''].slice(0, 3);
    setForm({
      title: task.title || '',
      description: task.description || '',
      section: task.section || '',
      frequency: task.frequency || 'daily',
      timeOfDay: task.timeOfDay || 'any',
      primaryGroup: task.primaryGroup || '',
      fallbackGroups: fallbacks,
      isSkippable: task.isSkippable || false,
      isActive: task.isActive !== false,
      sortOrder: task.sortOrder || 0,
      kpi: task.kpi || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.primaryGroup) {
      setError('Title and Primary Group are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        fallbackGroups: form.fallbackGroups.filter(Boolean),
      };
      if (editId) {
        await axios.put(`/api/sop/tasks/${editId}`, payload);
        setSuccess('Task updated');
      } else {
        await axios.post('/api/sop/tasks', payload);
        setSuccess('Task created');
      }
      setShowModal(false);
      fetchTasks();
    } catch {
      setError('Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/sop/tasks/${id}`);
      setSuccess('Task deleted');
      setDeleteConfirm(null);
      fetchTasks();
    } catch {
      setError('Failed to delete task');
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setError('');
    try {
      const res = await axios.post('/api/sop/seed');
      if (res.data.seeded) {
        setSuccess(`Loaded ${res.data.count} default SOP tasks`);
        fetchTasks();
      } else {
        setError(res.data.message || 'Tasks already exist');
      }
    } catch {
      setError('Failed to seed tasks');
    } finally {
      setSeeding(false);
    }
  };

  const setFallback = (index, value) => {
    setForm((f) => {
      const next = [...f.fallbackGroups];
      next[index] = value;
      return { ...f, fallbackGroups: next };
    });
  };

  const filtered = tasks.filter((t) => {
    if (!showInactive && !t.isActive) return false;
    if (filterGroup && t.primaryGroup !== filterGroup) return false;
    if (filterFrequency && t.frequency !== filterFrequency) return false;
    if (filterTime && t.timeOfDay !== filterTime) return false;
    return true;
  });

  const grouped = filtered.reduce((acc, t) => {
    const key = TIME_LABEL[t.timeOfDay] || 'Any Time';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const timeOrder = ['Morning', 'During Day', 'Evening', 'Any Time'];

  return (
    <PageContainer
      title="SOP Task Manager"
      subtitle="Standard Operating Procedure — define, assign and track daily work duties by group"
    >
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess('')} sx={{ mb: 1 }}>{success}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Filter by Group</InputLabel>
          <Select value={filterGroup} label="Filter by Group" onChange={(e) => setFilterGroup(e.target.value)}>
            <MenuItem value="">All Groups</MenuItem>
            {userGroups.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Frequency</InputLabel>
          <Select value={filterFrequency} label="Frequency" onChange={(e) => setFilterFrequency(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {FREQUENCIES.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Time of Day</InputLabel>
          <Select value={filterTime} label="Time of Day" onChange={(e) => setFilterTime(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {TIMES.map((t) => <MenuItem key={t} value={t}>{TIME_LABEL[t]}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControlLabel
          control={<Switch size="small" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />}
          label={<Typography variant="body2">Show inactive</Typography>}
        />
        <Box sx={{ flex: 1 }} />
        <Button
          startIcon={<DownloadingIcon />}
          variant="outlined"
          size="small"
          onClick={handleSeed}
          disabled={seeding}
        >
          Load Default SOP Tasks
        </Button>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={openAdd}>
          Add Task
        </Button>
      </Stack>

      {loading ? (
        <Typography color="text.secondary">Loading...</Typography>
      ) : filtered.length === 0 ? (
        <Alert severity="info">No SOP tasks found. Use "Load Default SOP Tasks" to get started.</Alert>
      ) : (
        timeOrder.map((timeLabel) => {
          const group = grouped[timeLabel];
          if (!group?.length) return null;
          return (
            <SectionCard key={timeLabel} title={timeLabel} sx={{ mb: 2 }} contentSx={{ p: 1 }}>
              <Stack spacing={1}>
                {group.map((task) => (
                  <Box
                    key={task._id}
                    sx={{
                      border: '1px solid',
                      borderColor: task.isActive ? 'divider' : 'action.disabledBackground',
                      borderRadius: 2,
                      p: 1.5,
                      opacity: task.isActive ? 1 : 0.55,
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box flex={1}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                          <Typography variant="subtitle2" fontWeight={700}>{task.title}</Typography>
                          {!task.isActive && <Chip label="Inactive" size="small" color="default" />}
                          <Chip label={task.isSkippable ? 'Optional' : 'Mandatory'} size="small" color={task.isSkippable ? 'default' : 'error'} variant="outlined" />
                          <Chip label={TIME_LABEL[task.timeOfDay]} size="small" color={TIME_COLOR[task.timeOfDay]} />
                          <Chip label={task.frequency} size="small" color="primary" variant="outlined" />
                        </Stack>
                        {task.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{task.description}</Typography>
                        )}
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Chip label={`Primary: ${task.primaryGroup}`} size="small" sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }} />
                          {(task.fallbackGroups || []).filter(Boolean).map((fg, i) => (
                            <Chip key={i} label={`Fallback ${i + 1}: ${fg}`} size="small" variant="outlined" />
                          ))}
                        </Stack>
                        {task.section && (
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>{task.section}</Typography>
                        )}
                        {task.kpi && (
                          <Typography variant="caption" color="success.main">KPI: {task.kpi}</Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(task)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setDeleteConfirm(task._id)}><DeleteIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          );
        })
      )}

      {/* Add / Edit Modal */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit SOP Task' : 'Add SOP Task'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Title *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} fullWidth size="small" />
            <TextField label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} fullWidth size="small" multiline rows={2} />
            <FormControl size="small" fullWidth>
              <InputLabel>Section</InputLabel>
              <Select value={form.section} label="Section" onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}>
                <MenuItem value="">— None —</MenuItem>
                {SECTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1}>
              <FormControl size="small" fullWidth>
                <InputLabel>Frequency *</InputLabel>
                <Select value={form.frequency} label="Frequency *" onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
                  {FREQUENCIES.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Time of Day</InputLabel>
                <Select value={form.timeOfDay} label="Time of Day" onChange={(e) => setForm((f) => ({ ...f, timeOfDay: e.target.value }))}>
                  {TIMES.map((t) => <MenuItem key={t} value={t}>{TIME_LABEL[t]}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
            <FormControl size="small" fullWidth>
              <InputLabel>Primary Group *</InputLabel>
              <Select value={form.primaryGroup} label="Primary Group *" onChange={(e) => setForm((f) => ({ ...f, primaryGroup: e.target.value }))}>
                {userGroups.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </Select>
            </FormControl>
            <Divider>
              <Typography variant="caption" color="text.secondary">Fallback Groups (in order)</Typography>
            </Divider>
            {[0, 1, 2].map((i) => (
              <FormControl key={i} size="small" fullWidth>
                <InputLabel>Fallback {i + 1} (if group unavailable)</InputLabel>
                <Select value={form.fallbackGroups[i]} label={`Fallback ${i + 1} (if group unavailable)`} onChange={(e) => setFallback(i, e.target.value)}>
                  <MenuItem value="">— None —</MenuItem>
                  {userGroups.filter((g) => g !== form.primaryGroup).map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </Select>
              </FormControl>
            ))}
            <Divider />
            <Stack direction="row" spacing={2}>
              <FormControlLabel
                control={<Switch checked={form.isSkippable} onChange={(e) => setForm((f) => ({ ...f, isSkippable: e.target.checked }))} />}
                label="Skippable"
              />
              <FormControlLabel
                control={<Switch checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />}
                label="Active"
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField label="Sort Order" type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} size="small" sx={{ width: 120 }} />
              <TextField label="KPI Target" value={form.kpi} onChange={(e) => setForm((f) => ({ ...f, kpi: e.target.value }))} fullWidth size="small" />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={Boolean(deleteConfirm)} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete SOP Task?</DialogTitle>
        <DialogContent>
          <Typography>This action cannot be undone. The task will be permanently removed.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => handleDelete(deleteConfirm)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
