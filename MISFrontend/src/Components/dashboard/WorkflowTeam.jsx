import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, LinearProgress, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import axios from '../../apiClient';
import { attendanceColor } from '../../constants/operations';
import { ADMIN_ROLES, isRoleAllowed } from '../../constants/roles';
import { useRoleKey } from '../../hooks/useRouteAccess';
import {
  createOperationsTask, fetchMyOperationsTasks, fetchOperationsUsers, fetchTeamStatus,
} from '../../services/operationsService';
import AttendanceStatus from './AttendanceStatus';

const MyOperations = lazy(() => import('../../Pages/MyOperations'));
const indiaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dateTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const closedStatuses = new Set(['completed', 'done', 'closed', 'cancelled', 'canceled']);

function deadlineLabel(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? dateTime.format(date) : '';
}

async function fetchPendingStaffTasks() {
  try {
    const { data } = await axios.get('/api/usertasks/GetUsertaskList', { cache: false });
    return (data?.result || []).filter((task) => !closedStatuses.has(String(task.Status || '').trim().toLowerCase()));
  } catch (error) {
    if (error.response?.status === 404) return [];
    throw error;
  }
}

function StaffRows({ rows, showAttendance }) {
  return (
    <Stack spacing={1}>
      {!rows.length && <Typography color="text.secondary" variant="body2">No records for this date.</Typography>}
      {rows.map((person) => (
        <Paper key={person.User_uuid || person.User_name} variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
            <Typography fontWeight={700}>{person.name || person.User_name}</Typography>
            <Chip size="small" label={person.attendanceStatus || 'No record'} color={attendanceColor(person.attendanceStatus)} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {showAttendance
              ? [person.inTime && `In ${person.inTime}`, person.outTime && `Out ${person.outTime}`].filter(Boolean).join(' · ')
              : `${person.pending} pending · ${person.overdue} overdue`}
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}

function AssignTaskForm({ staff }) {
  const [assignee, setAssignee] = useState('');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(indiaToday);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (saving || !assignee || !title.trim() || !dueDate) return;
    setSaving(true);
    setFeedback(null);
    try {
      const { data } = await createOperationsTask({
        Usertask_name: title.trim(),
        primaryUserUuid: assignee,
        Deadline: new Date(`${dueDate}T23:59:59+05:30`).toISOString(),
      });
      setTitle('');
      setFeedback({ severity: data?.ownership?.escalated ? 'warning' : 'success',
        message: data?.ownership?.escalated ? 'Task saved. The selected user is currently unavailable.' : 'Task assigned.' });
    } catch (error) {
      setFeedback({ severity: 'error', message: error.response?.data?.message || 'Could not assign the task.' });
    } finally {
      setSaving(false);
    }
  };

  if (!staff.length) return <Typography color="text.secondary">No active users are available to assign.</Typography>;
  return (
    <Stack component="form" spacing={1.5} onSubmit={submit}>
      {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}
      <TextField size="small" label="Task name" required value={title} onChange={(event) => setTitle(event.target.value)} />
      <TextField select size="small" label="Assign to" required value={assignee} onChange={(event) => setAssignee(event.target.value)}>
        {staff.map((person) => <MenuItem key={person.User_uuid} value={person.User_uuid}>{person.name || person.User_name}</MenuItem>)}
      </TextField>
      <TextField size="small" type="date" label="Due date" required value={dueDate}
        InputLabelProps={{ shrink: true }} onChange={(event) => setDueDate(event.target.value)} />
      <Button type="submit" variant="contained" disabled={saving || !assignee || !title.trim() || !dueDate}>Assign task</Button>
    </Stack>
  );
}

function PendingStaffTasks({ tasks }) {
  const [assignee, setAssignee] = useState('');
  const owners = [...new Set(tasks.map((task) => task.User).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const visible = tasks.filter((task) => !assignee || task.User === assignee);
  return (
    <Stack spacing={1}>
      {owners.length > 0 && (
        <TextField select size="small" label="Assigned to" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
          <MenuItem value="">Everyone</MenuItem>
          {owners.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </TextField>
      )}
      {!visible.length && <Typography color="text.secondary" variant="body2">No pending tasks.</Typography>}
      {visible.map((task) => (
        <Paper key={task.Usertask_uuid || task._id} variant="outlined" sx={{ p: 1.5 }}>
          <Typography fontWeight={700}>{task.Usertask_name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {[task.User || 'Unassigned', task.Status || 'Pending', deadlineLabel(task.Deadline)].filter(Boolean).join(' · ')}
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}

export default function WorkflowTeam({ userName }) {
  const canManage = isRoleAllowed(ADMIN_ROLES, useRoleKey());
  const [tab, setTab] = useState('report');
  const [date, setDate] = useState(indiaToday);
  const [request, setRequest] = useState(null);
  const [revision, setRevision] = useState(0);
  const key = `${tab}:${date}:${revision}:${canManage}:${userName}`;
  const reports = tab === 'report' || (tab === 'attendance' && canManage);
  const needsData = reports || (canManage && (tab === 'assign' || tab === 'pending'));
  const loading = needsData && request?.key !== key;
  const rows = request?.key === key ? request.rows : [];
  const error = request?.key === key ? request.error : '';

  useEffect(() => {
    if (!needsData) return;
    let current = true;
    async function load() {
      try {
        let result;
        if (tab === 'assign') {
          const { data } = await fetchOperationsUsers();
          result = (data?.result || []).filter((person) => person.User_uuid && person.operations?.active !== false);
        } else if (tab === 'pending') {
          result = await fetchPendingStaffTasks();
        } else if (canManage) {
          const { data } = await fetchTeamStatus(date);
          result = (data?.result?.rows || []).filter((person) => !person.isVirtual);
        } else {
          const { data } = await fetchMyOperationsTasks(date);
          const { availability, buckets = {} } = data?.result || {};
          result = availability ? [{
            User_name: userName,
            attendanceStatus: availability.attendanceStatus,
            pending: Object.entries(buckets).reduce((count, [status, tasks]) => count + (status === 'completed' ? 0 : tasks.length), 0),
            overdue: buckets.overdue?.length || 0,
          }] : [];
        }
        if (current) setRequest({ key, rows: result });
      } catch (err) {
        if (current) setRequest({ key, rows: [], error: err.response?.data?.message || 'Could not load this view.' });
      }
    }
    void load();
    return () => { current = false; };
  }, [canManage, date, key, needsData, tab, userName]);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, next) => setTab(next)} aria-label="Team views" variant="fullWidth"
        sx={{ borderBottom: '1px solid', borderColor: 'divider', '& .MuiTab-root': { minWidth: 0, px: 0.5, fontSize: '0.75rem', textTransform: 'none' } }}>
        <Tab value="report" label="User Report" />
        <Tab value="attendance" label="Attendance" />
        {canManage && <Tab value="assign" label="Assign Task" />}
        <Tab value="pending" label="Pending Tasks" />
      </Tabs>
      <Stack spacing={1.5} sx={{ p: 1.5 }}>
        {tab === 'attendance' && <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography component="h2" fontWeight={700} sx={{ mb: 1 }}>My attendance today</Typography>
          <AttendanceStatus />
        </Paper>}
        {reports && (
          <Stack direction="row" gap={1} alignItems="center">
            <TextField size="small" type="date" label="Report date" value={date} fullWidth
              InputLabelProps={{ shrink: true }} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} />
            <Button onClick={() => setRevision((count) => count + 1)} disabled={loading}>Refresh</Button>
          </Stack>
        )}
        {loading && <LinearProgress aria-label="Loading team data" />}
        {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRevision((count) => count + 1)}>Retry</Button>}>{error}</Alert>}
        {!loading && !error && reports && <StaffRows rows={rows} showAttendance={tab === 'attendance'} />}
        {!loading && !error && tab === 'assign' && canManage && <AssignTaskForm staff={rows} />}
        {!loading && !error && tab === 'pending' && canManage && <PendingStaffTasks tasks={rows} />}
        {tab === 'pending' && !canManage && (
          <Suspense fallback={<LinearProgress aria-label="Loading your tasks" />}><MyOperations compact /></Suspense>
        )}
      </Stack>
    </Box>
  );
}
