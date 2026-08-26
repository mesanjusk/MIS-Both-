import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, FormControl, Grid, IconButton, InputLabel,
  MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import DownloadingIcon from '@mui/icons-material/Downloading';
import {
  PageContainer, SectionCard, DataTableWrapper, LoadingState, EmptyState, ErrorState,
} from '../Components/ui';
import { WEEK_DAYS } from '../constants/operations';
import { useAuth } from '../context/AuthContext';
import {
  fetchOperationsSettings, saveStoreSettings, savePriorityLevels, saveDepartments,
  fetchOperationsUsers, fetchConfigurationWarnings, fetchOperationsAudit,
  seedOperationsDefaults, generateDailyOperationsTasks, saveStageResponsibilities,
  fetchResponsibilities,
} from '../services/operationsService';

const formatAuditValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * Settings → Operations.
 *
 * Store hours, the priority catalogue and the department list all live in the
 * database, so management can add a P5 or move the closing time without a
 * developer.
 */
export default function OperationsSettings() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const canEdit = isAdmin || isSuperAdmin;

  const [store, setStore] = useState(null);
  const [levels, setLevels] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [hooks, setHooks] = useState([]);
  const [stageMap, setStageMap] = useState({});
  const [responsibilities, setResponsibilities] = useState([]);
  const [users, setUsers] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [audit, setAudit] = useState([]);
  const [newDepartment, setNewDepartment] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [settingsRes, usersRes, warningsRes, respRes] = await Promise.all([
        fetchOperationsSettings(),
        fetchOperationsUsers(),
        fetchConfigurationWarnings(),
        fetchResponsibilities(),
      ]);
      const result = settingsRes.data?.result || {};
      setStore(result.store || {});
      setLevels(result.priorityLevels || []);
      setDepartments(result.departments || []);
      setHooks(result.automationHooks || []);
      setStageMap(result.stageResponsibilities || {});
      setResponsibilities(respRes.data?.result || []);
      setUsers(usersRes.data?.result || []);
      setWarnings(warningsRes.data?.result || []);

      if (canEdit) {
        // Audit is admin-only; a non-admin viewer just doesn't get the panel.
        const auditRes = await fetchOperationsAudit({ limit: 50 });
        setAudit(auditRes.data?.result || []);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [canEdit]);

  useEffect(() => { load(); }, [load]);

  const run = async (key, action, message) => {
    setBusy(key);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(message);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Action failed');
    } finally {
      setBusy('');
    }
  };

  const setStoreField = (field) => (event) =>
    setStore((prev) => ({ ...prev, [field]: event.target.value }));

  const toggleStoreDay = (day) => () =>
    setStore((prev) => {
      const current = prev.workingDays || [];
      return {
        ...prev,
        workingDays: current.includes(day)
          ? current.filter((entry) => entry !== day)
          : [...current, day].sort((a, b) => a - b),
      };
    });

  const toggleEscalationUser = (userUuid) => () =>
    setStore((prev) => {
      const current = prev.escalationUserUuids || [];
      return {
        ...prev,
        escalationUserUuids: current.includes(userUuid)
          ? current.filter((entry) => entry !== userUuid)
          : [...current, userUuid],
      };
    });

  const setLevelField = (index, field) => (event) => {
    const { value } = event.target;
    setLevels((prev) => prev.map((level, position) =>
      position === index ? { ...level, [field]: value } : level));
  };

  if (loading || !store) {
    return (
      <PageContainer title="Operations Settings">
        {error ? <ErrorState message={error} /> : <LoadingState label="Loading settings..." />}
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Operations Settings"
      subtitle="Store hours, priority levels, departments and configuration health"
      actions={(
        <>
          <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load}>Refresh</Button>
          {canEdit ? (
            <>
              <Button
                size="small"
                startIcon={<DownloadingIcon />}
                disabled={busy === 'seed'}
                onClick={() => run('seed', seedOperationsDefaults, 'Defaults seeded (existing rows untouched).')}
              >
                Seed defaults
              </Button>
              <Button
                size="small"
                disabled={busy === 'generate'}
                onClick={() => run('generate', () => generateDailyOperationsTasks(), "Today's scheduled tasks generated.")}
              >
                Generate today&apos;s tasks
              </Button>
            </>
          ) : null}
        </>
      )}
    >
      {error ? <ErrorState message={error} /> : null}
      {success ? <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert> : null}
      {!canEdit ? <Alert severity="info">Read-only — only a manager or admin can change these.</Alert> : null}

      {warnings.length ? (
        <SectionCard title={`Configuration Warnings (${warnings.length})`}>
          <Stack spacing={0.5}>
            {warnings.map((warning, index) => (
              <Alert
                key={`${warning.responsibility_uuid || 'general'}-${index}`}
                severity={warning.level === 'error' ? 'error' : 'warning'}
                sx={{ py: 0 }}
              >
                {warning.responsibility ? <strong>{warning.responsibility}: </strong> : null}
                {warning.message}
              </Alert>
            ))}
          </Stack>
        </SectionCard>
      ) : (
        <Alert severity="success">No configuration problems detected.</Alert>
      )}

      <SectionCard title="Store Hours">
        <Grid container spacing={2}>
          {[
            ['reportingTime', 'Staff Reporting Time'],
            ['openingTime', 'Store Opening Time'],
            ['closingTime', 'Store Closing Time'],
          ].map(([field, label]) => (
            <Grid item xs={12} sm={4} md={3} key={field}>
              <TextField
                label={label}
                size="small"
                type="time"
                fullWidth
                disabled={!canEdit}
                value={store[field] || ''}
                onChange={setStoreField(field)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          ))}
          <Grid item xs={12} sm={4} md={3}>
            <TextField
              label="Late grace (minutes)"
              size="small"
              type="number"
              fullWidth
              disabled={!canEdit}
              value={store.lateGraceMinutes ?? 0}
              onChange={setStoreField('lateGraceMinutes')}
            />
          </Grid>
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">Working Days</Typography>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {WEEK_DAYS.map((day) => (
                <Chip
                  key={day.value}
                  size="small"
                  label={day.label}
                  clickable={canEdit}
                  onClick={canEdit ? toggleStoreDay(day.value) : undefined}
                  color={(store.workingDays || []).includes(day.value) ? 'primary' : 'default'}
                  variant={(store.workingDays || []).includes(day.value) ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">
              Escalation recipients — leave empty to use every manager and admin
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {users.map((user) => (
                <Chip
                  key={user.User_uuid}
                  size="small"
                  label={user.name || user.User_name}
                  clickable={canEdit}
                  onClick={canEdit ? toggleEscalationUser(user.User_uuid) : undefined}
                  color={(store.escalationUserUuids || []).includes(user.User_uuid) ? 'primary' : 'default'}
                  variant={(store.escalationUserUuids || []).includes(user.User_uuid) ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
          </Grid>
          {canEdit ? (
            <Grid item xs={12}>
              <Button
                variant="contained"
                size="small"
                disabled={busy === 'store'}
                onClick={() => run('store', () => saveStoreSettings(store), 'Store hours saved.')}
              >
                Save store hours
              </Button>
            </Grid>
          ) : null}
        </Grid>
      </SectionCard>

      <SectionCard
        title="Operational Priority Levels"
        subtitle="The codes available for assignment. Add or rename them freely — user assignments are stored separately."
      >
        <Stack spacing={1}>
          {levels.map((level, index) => (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} key={`${level.code}-${index}`}>
              <TextField
                label="Code"
                size="small"
                disabled={!canEdit}
                value={level.code || ''}
                onChange={setLevelField(index, 'code')}
                sx={{ maxWidth: 120 }}
              />
              <TextField
                label="Label"
                size="small"
                disabled={!canEdit}
                value={level.label || ''}
                onChange={setLevelField(index, 'label')}
                sx={{ maxWidth: 180 }}
              />
              <TextField
                label="Default role title"
                size="small"
                fullWidth
                disabled={!canEdit}
                value={level.defaultRoleTitle || ''}
                onChange={setLevelField(index, 'defaultRoleTitle')}
              />
              {canEdit ? (
                <IconButton
                  size="small"
                  onClick={() => setLevels((prev) => prev.filter((_, position) => position !== index))}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              ) : null}
            </Stack>
          ))}
          {canEdit ? (
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setLevels((prev) => [...prev, { code: '', label: '', defaultRoleTitle: '' }])}
              >
                Add level
              </Button>
              <Button
                size="small"
                variant="contained"
                disabled={busy === 'levels'}
                onClick={() => run('levels', () => savePriorityLevels(levels), 'Priority levels saved.')}
              >
                Save levels
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </SectionCard>

      <SectionCard title="Departments">
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {departments.map((department) => (
            <Chip
              key={department}
              size="small"
              label={department}
              onDelete={canEdit ? () => setDepartments((prev) => prev.filter((entry) => entry !== department)) : undefined}
            />
          ))}
          {!departments.length ? <EmptyState title="No departments" /> : null}
        </Stack>
        {canEdit ? (
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              label="New department"
              value={newDepartment}
              onChange={(event) => setNewDepartment(event.target.value)}
            />
            <Button
              size="small"
              onClick={() => {
                const value = newDepartment.trim();
                if (!value || departments.includes(value)) return;
                setDepartments((prev) => [...prev, value]);
                setNewDepartment('');
              }}
            >
              Add
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={busy === 'departments'}
              onClick={() => run('departments', () => saveDepartments(departments), 'Departments saved.')}
            >
              Save
            </Button>
          </Stack>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Order Automation"
        subtitle="Point an automation hook at a responsibility and the task it creates goes to that chain's available owner instead of the first user matching a role name"
      >
        <Grid container spacing={1}>
          {hooks.map((hook) => (
            <Grid item xs={12} sm={6} md={4} key={hook.key}>
              <FormControl size="small" fullWidth disabled={!canEdit}>
                <InputLabel>{hook.label}</InputLabel>
                <Select
                  label={hook.label}
                  value={stageMap[hook.key] || ''}
                  onChange={(event) =>
                    setStageMap((prev) => ({ ...prev, [hook.key]: event.target.value }))}
                >
                  <MenuItem value="">— Leave existing behaviour —</MenuItem>
                  {responsibilities.map((item) => (
                    <MenuItem key={item.responsibility_uuid} value={item.responsibility_uuid}>
                      {item.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          ))}
          {canEdit ? (
            <Grid item xs={12}>
              <Button
                size="small"
                variant="contained"
                disabled={busy === 'stages'}
                onClick={() => run('stages', () => saveStageResponsibilities(stageMap), 'Automation mapping saved.')}
              >
                Save automation mapping
              </Button>
            </Grid>
          ) : null}
        </Grid>
      </SectionCard>

      {canEdit ? (
        <SectionCard title="Audit History" subtitle="Every operational configuration change, most recent first">
          <DataTableWrapper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Who</TableCell>
                  <TableCell>What</TableCell>
                  <TableCell>Field</TableCell>
                  <TableCell>From</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell>Reason</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {audit.map((row) => (
                  <TableRow key={row._id} hover>
                    <TableCell>{new Date(row.createdAt).toLocaleString('en-IN')}</TableCell>
                    <TableCell>{row.actorName || '—'}</TableCell>
                    <TableCell>
                      {row.action}
                      {row.entityName ? <Typography variant="caption" display="block">{row.entityName}</Typography> : null}
                    </TableCell>
                    <TableCell>{row.field || '—'}</TableCell>
                    <TableCell>{formatAuditValue(row.oldValue)}</TableCell>
                    <TableCell>{formatAuditValue(row.newValue)}</TableCell>
                    <TableCell>{row.reason || '—'}</TableCell>
                  </TableRow>
                ))}
                {!audit.length ? (
                  <TableRow>
                    <TableCell colSpan={7}><EmptyState title="No configuration changes recorded yet" /></TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </DataTableWrapper>
        </SectionCard>
      ) : null}

      <Box sx={{ pb: 1 }}>
        <Divider sx={{ mb: 1 }} />
        <Typography variant="caption" color="text.secondary">
          Attendance itself is unchanged — it is still marked from the dashboard and WhatsApp as
          before. Operations only reads it to decide who is available.
        </Typography>
      </Box>
    </PageContainer>
  );
}
