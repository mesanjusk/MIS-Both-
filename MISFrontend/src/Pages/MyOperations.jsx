import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, Grid, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
  PageContainer, SectionCard, DataTableWrapper, LoadingState, EmptyState, ErrorState,
} from '../Components/ui';
import {
  BUCKET_META, attendanceColor, stateColor, ownerRoleLabel,
} from '../constants/operations';
import {
  fetchMyOperations, fetchMyOperationsTasks, setUserOperationalState,
  updateOperationsTaskStatus, requestTaskHandover,
} from '../services/operationsService';

const formatDeadline = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** The logged-in user's own operational role card, task buckets and cover. */
export default function MyOperations() {
  const [me, setMe] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [meRes, tasksRes] = await Promise.all([fetchMyOperations(), fetchMyOperationsTasks()]);
      setMe(meRes.data?.result || null);
      setTasks(tasksRes.data?.result || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load your operations view');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeState = async (status) => {
    if (!me?.User_uuid) return;
    setError('');
    try {
      await setUserOperationalState(me.User_uuid, { status, currentTask: '' });
      setSuccess(`You are now ${status}.`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not change your state');
    }
  };

  const setTaskStatus = async (task, status) => {
    setError('');
    try {
      await updateOperationsTaskStatus(task.Usertask_uuid, status);
      setSuccess(`“${task.Usertask_name}” marked ${status}.`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not update the task');
    }
  };

  const askHandover = async (task) => {
    setError('');
    try {
      await requestTaskHandover(task.Usertask_uuid, 'Requested from My Operations');
      setSuccess('Handover requested — management has been notified.');
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not request handover');
    }
  };

  if (loading) {
    return <PageContainer title="My Operations"><LoadingState label="Loading your day..." /></PageContainer>;
  }

  const availability = me?.availability || {};
  const buckets = tasks?.buckets || {};

  const renderTaskTable = (rows, { showOwnerRole = false, actions = true } = {}) => (
    <DataTableWrapper>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Task</TableCell>
            <TableCell>Responsibility</TableCell>
            <TableCell>Due</TableCell>
            <TableCell>Status</TableCell>
            {showOwnerRole ? <TableCell>Held as</TableCell> : null}
            {actions ? <TableCell align="right">Actions</TableCell> : null}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((task) => (
            <TableRow key={task._id || task.Usertask_uuid} hover>
              <TableCell>
                {task.Usertask_name}
                {task.overdue ? <Chip size="small" color="error" label="Overdue" sx={{ ml: 0.5 }} /> : null}
              </TableCell>
              <TableCell>{task.responsibilityName || '—'}</TableCell>
              <TableCell>{formatDeadline(task.Deadline)}</TableCell>
              <TableCell>{task.Status}</TableCell>
              {showOwnerRole ? (
                <TableCell><Chip size="small" variant="outlined" label={ownerRoleLabel(task.ownerRole)} /></TableCell>
              ) : null}
              {actions ? (
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" onClick={() => setTaskStatus(task, 'In Progress')}>Start</Button>
                    <Button size="small" color="success" onClick={() => setTaskStatus(task, 'Completed')}>Done</Button>
                    <Button size="small" color="warning" onClick={() => askHandover(task)}>Handover</Button>
                  </Stack>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={showOwnerRole ? 6 : 5}><EmptyState title="Nothing here" /></TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </DataTableWrapper>
  );

  return (
    <PageContainer
      title="My Operations"
      subtitle="Your operational role, today's tasks and anything you are covering"
      actions={<Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load}>Refresh</Button>}
    >
      {error ? <ErrorState message={error} /> : null}
      {success ? <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert> : null}

      <SectionCard title="My Operational Role">
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Stack direction="row" spacing={1} alignItems="center">
              {me?.operations?.priority
                ? <Chip color="primary" label={me.priorityLabel || me.operations.priority} />
                : <Chip label="No priority assigned" />}
            </Stack>
            <Typography variant="h6" sx={{ mt: 0.5 }}>{me?.operations?.roleTitle || 'Role not set'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {me?.operations?.department || 'No department'}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
              <Chip size="small" color={attendanceColor(availability.attendanceStatus)} label={availability.attendanceStatus || '—'} />
              <Chip size="small" variant="outlined" color={stateColor(availability.operationalState)} label={availability.operationalState || '—'} />
            </Stack>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2">Primary Responsibilities</Typography>
            <Divider sx={{ my: 0.5 }} />
            {me?.primaryResponsibilities?.length
              ? me.primaryResponsibilities.map((name) => <Typography key={name} variant="body2">• {name}</Typography>)
              : <Typography variant="body2" color="text.secondary">None configured</Typography>}
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2">Backup Responsibilities</Typography>
            <Divider sx={{ my: 0.5 }} />
            {me?.backupResponsibilities?.length
              ? me.backupResponsibilities.map((name) => <Typography key={name} variant="body2">• {name}</Typography>)
              : <Typography variant="body2" color="text.secondary">None configured</Typography>}
          </Grid>
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">Set your state</Typography>
            <Stack direction="row" spacing={0.5}>
              {['Available', 'Busy', 'Outside'].map((state) => (
                <Chip
                  key={state}
                  size="small"
                  clickable
                  onClick={() => changeState(state)}
                  color={availability.operationalState === state ? stateColor(state) : 'default'}
                  variant={availability.operationalState === state ? 'filled' : 'outlined'}
                  label={state}
                />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Marking yourself Outside keeps your outside-logistics work and hands inside-store work
              to your backup — it does not close the store.
            </Typography>
          </Grid>
        </Grid>
      </SectionCard>

      {tasks?.transferredToMe?.length ? (
        <SectionCard title="Tasks Transferred To Me" subtitle="You are covering these because the configured owner is unavailable">
          {renderTaskTable(tasks.transferredToMe, { showOwnerRole: true })}
        </SectionCard>
      ) : null}

      <SectionCard title="My Tasks">
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 1 }}>
          {BUCKET_META.map((meta) => (
            <Chip
              key={meta.key}
              size="small"
              color={meta.color}
              variant="outlined"
              label={`${meta.dot} ${meta.label}: ${(buckets[meta.key] || []).length}`}
            />
          ))}
        </Stack>
        {BUCKET_META.map((meta) => {
          const rows = buckets[meta.key] || [];
          if (!rows.length) return null;
          return (
            <Box key={meta.key} sx={{ mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{meta.dot} {meta.label}</Typography>
              {renderTaskTable(rows, { showOwnerRole: true })}
            </Box>
          );
        })}
        {!BUCKET_META.some((meta) => (buckets[meta.key] || []).length) ? (
          <EmptyState title="No open tasks" description="Nothing is assigned to you right now." />
        ) : null}
      </SectionCard>

      {tasks?.coveredForMe?.length ? (
        <SectionCard title="My Tasks Covered By Someone Else">
          <Stack spacing={0.5}>
            {tasks.coveredForMe.map((task) => (
              <Typography key={task._id} variant="body2">
                • {task.Usertask_name} — currently with {task.currentOwner?.userName}
              </Typography>
            ))}
          </Stack>
        </SectionCard>
      ) : null}

      {tasks?.backupTasks?.length ? (
        <SectionCard title="Tasks I May Need To Cover" subtitle="You are configured as a backup on these">
          {renderTaskTable(tasks.backupTasks, { showOwnerRole: true, actions: false })}
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
