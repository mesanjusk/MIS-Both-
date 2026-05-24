import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Stack, Tooltip, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import { useAuth } from '../context/AuthContext';
import axios from '../apiClient';

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
  any: 'Anytime',
};

export default function UserTask() {
  const { userName, userGroup } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [attendanceFlow, setAttendanceFlow] = useState([]);
  const [error, setError] = useState('');
  const [pendingAssignments, setPendingAssignments] = useState([]);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);

  const [sopTasks, setSopTasks] = useState([]);
  const [sopCompletions, setSopCompletions] = useState({});
  const [sopCanEndDay, setSopCanEndDay] = useState(true);
  const [sopBlockingTasks, setSopBlockingTasks] = useState([]);
  const [sopAction, setSopAction] = useState(false);
  const [showSkipDialog, setShowSkipDialog] = useState(null);
  const [skipReason, setSkipReason] = useState('');

  const group = userGroup || localStorage.getItem('User_group') || '';

  const loadSopStatus = useCallback(async () => {
    if (!group) return;
    try {
      const res = await axios.get('/api/sop/daily', { params: { userGroup: group } });
      if (res.data.success) {
        setSopTasks(res.data.tasks || []);
        setSopCompletions(res.data.completionMap || {});
        setSopCanEndDay(res.data.canEndDay !== false);
        setSopBlockingTasks(res.data.blockingTasks || []);
      }
    } catch {}
  }, [group]);

  const loadPage = useCallback(async () => {
    if (!userName) return;
    try {
      setError('');
      const [summaryRes, attendanceRes] = await Promise.all([
        axios.get('/api/dashboard/summary', { params: { userName, isAdmin: false } }),
        axios.get(`/api/attendance/getTodayAttendance/${userName}`),
      ]);
      const myTasks = summaryRes?.data?.result?.myAssignedTasks || [];
      const pending = attendanceRes?.data?.pendingAssignments || [];
      setTasks(myTasks);
      setAttendanceFlow(attendanceRes?.data?.flow || []);
      setPendingAssignments(pending);
    } catch (err) {
      console.error(err);
      setError('Failed to load tasks.');
    }
  }, [userName]);

  useEffect(() => {
    loadPage();
    loadSopStatus();
  }, [loadPage, loadSopStatus]);

  const hasStarted = attendanceFlow.includes('In');
  const hasEnded = attendanceFlow.includes('Out');

  const saveAttendance = async (type) => {
    try {
      setError('');
      const response = await axios.post('/api/attendance/addAttendance', {
        User_name: userName,
        Type: type,
        Status: type === 'Out' ? 'Completed' : 'Present',
        Time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      if (type === 'In' && Array.isArray(response?.data?.pendingAssignments)) {
        setPendingAssignments(response.data.pendingAssignments);
        setShowAssignmentDialog(response.data.pendingAssignments.length > 0);
      }
      await loadPage();
    } catch (err) {
      console.error(err);
      setError('Failed to update attendance.');
    }
  };

  const handleComplete = async (sopUuid) => {
    setSopAction(true);
    try {
      await axios.post('/api/sop/complete', { sopUuid, userName, userGroup: group });
      await loadSopStatus();
    } catch {
      setError('Failed to mark task complete.');
    } finally {
      setSopAction(false);
    }
  };

  const handleSkip = async () => {
    if (!showSkipDialog) return;
    setSopAction(true);
    try {
      await axios.post('/api/sop/skip', { sopUuid: showSkipDialog, userName, userGroup: group, skipReason });
      setShowSkipDialog(null);
      setSkipReason('');
      await loadSopStatus();
    } catch {
      setError('Failed to skip task.');
    } finally {
      setSopAction(false);
    }
  };

  const taskSummary = useMemo(() => {
    const overdue = tasks.filter((t) => t.overdue).length;
    return overdue ? `${tasks.length} tasks · ${overdue} overdue` : `${tasks.length} tasks`;
  }, [tasks]);

  const endDayButton = (() => {
    if (!hasStarted || hasEnded) return null;
    if (!sopCanEndDay) {
      const label = sopBlockingTasks.length
        ? `${sopBlockingTasks.length} SOP task${sopBlockingTasks.length > 1 ? 's' : ''} pending`
        : 'SOP tasks pending';
      return (
        <Tooltip title={label} arrow>
          <span>
            <Button variant="outlined" size="small" disabled
              sx={{ py: 0.2, px: 1, fontSize: '0.72rem', minHeight: 24 }}>
              End day
            </Button>
          </span>
        </Tooltip>
      );
    }
    return (
      <Button variant="outlined" size="small" onClick={() => saveAttendance('Out')}
        sx={{ py: 0.2, px: 1, fontSize: '0.72rem', minHeight: 24 }}>
        End day
      </Button>
    );
  })();

  return (
    <Stack spacing={1.5} sx={{ p: { xs: 0.75, md: 1 } }}>
      {error && <Alert severity="error" sx={{ py: 0.5, fontSize: '0.78rem' }}>{error}</Alert>}

      {/* Pending assignments dialog */}
      <Dialog open={showAssignmentDialog} onClose={() => setShowAssignmentDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Pending assignments</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {pendingAssignments.length ? pendingAssignments.map((task) => (
              <Box key={`${task.source}-${task.id}`} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Typography fontWeight={700}>{task.title}</Typography>
                <Typography variant="body2" color="text.secondary">Type: {task.source}</Typography>
                <Typography variant="body2" color="text.secondary">Task: {task.taskName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Due: {task?.dueDate ? new Date(task.dueDate).toLocaleString() : 'Today 8:00 PM'}
                </Typography>
              </Box>
            )) : <Typography variant="body2" color="text.secondary">No pending assignments.</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAssignmentDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Skip reason dialog */}
      <Dialog open={Boolean(showSkipDialog)} onClose={() => { setShowSkipDialog(null); setSkipReason(''); }} maxWidth="xs" fullWidth>
        <DialogTitle>Skip this task?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Optionally provide a reason for skipping.
          </Typography>
          <input
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Reason (optional)"
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowSkipDialog(null); setSkipReason(''); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSkip} disabled={sopAction}>Skip</Button>
        </DialogActions>
      </Dialog>

      {/* ── Compact attendance row ── */}
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap"
        sx={{ px: 0.75, py: 0.6, borderRadius: 1.5, bgcolor: 'rgba(22,163,74,0.04)', border: '1px solid', borderColor: 'rgba(22,163,74,0.15)' }}>
        <Chip
          size="small"
          label={attendanceFlow.length ? attendanceFlow.join(' → ') : 'Not checked in'}
          color={hasStarted && !hasEnded ? 'success' : 'default'}
          variant={hasStarted ? 'filled' : 'outlined'}
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
        />
        <Box sx={{ flex: 1 }} />
        {!hasStarted && (
          <Button size="small" variant="contained" onClick={() => saveAttendance('In')}
            sx={{ py: 0.2, px: 1, fontSize: '0.72rem', minHeight: 24 }}>
            Start day
          </Button>
        )}
        {endDayButton}
      </Stack>

      {!sopCanEndDay && hasStarted && !hasEnded && sopBlockingTasks.length > 0 && (
        <Alert severity="warning" sx={{ py: 0.4, fontSize: '0.73rem' }}>
          {sopBlockingTasks.length} mandatory SOP task{sopBlockingTasks.length > 1 ? 's' : ''} pending before end day
        </Alert>
      )}

      {/* ── SOP Checklist ── */}
      {sopTasks.length > 0 && (
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.6 }}>
            <Typography variant="caption" fontWeight={800} color="text.disabled"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.6rem' }}>
              SOP Checklist
            </Typography>
            <Chip
              label={sopCanEndDay ? 'All clear' : `${sopBlockingTasks.length} blocking`}
              color={sopCanEndDay ? 'success' : 'error'}
              size="small"
              sx={{ height: 18, fontSize: '0.6rem' }}
            />
          </Stack>
          <Stack spacing={0.4}>
            {sopTasks.map((task) => {
              const completion = sopCompletions[task.sop_uuid];
              const done = Boolean(completion);
              const skipped = completion?.skipped;
              return (
                <Stack
                  key={task.sop_uuid}
                  direction="row" alignItems="center" spacing={0.75}
                  sx={{
                    py: 0.5, px: 0.75, borderRadius: 1.5,
                    bgcolor: done ? (skipped ? '#fffbeb' : '#f0fdf4') : 'transparent',
                    border: '1px solid',
                    borderColor: done ? (skipped ? '#fde68a' : '#bbf7d0') : 'divider',
                    opacity: done ? 0.8 : 1,
                  }}
                >
                  {done
                    ? <CheckCircleIcon sx={{ fontSize: 14, color: skipped ? 'warning.main' : 'success.main', flexShrink: 0 }} />
                    : <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: 'action.disabled', flexShrink: 0 }} />}
                  <Typography variant="caption" fontWeight={done ? 400 : 600} noWrap sx={{ flex: 1, textDecoration: skipped ? 'line-through' : 'none' }}>
                    {task.title}
                  </Typography>
                  <Chip label={TIME_LABEL[task.timeOfDay]} size="small" color={TIME_COLOR[task.timeOfDay]}
                    sx={{ height: 16, fontSize: 9, flexShrink: 0 }} />
                  {!task.isSkippable && !done && (
                    <Chip label="Must" size="small" color="error" variant="outlined"
                      sx={{ height: 16, fontSize: 9, flexShrink: 0, minWidth: 30 }} />
                  )}
                  {!done && (
                    <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
                      <Button size="small" variant="contained" onClick={() => handleComplete(task.sop_uuid)}
                        disabled={sopAction} sx={{ py: 0, px: 0.75, fontSize: 10, minHeight: 22, minWidth: 40 }}>
                        Done
                      </Button>
                      {task.isSkippable && (
                        <Tooltip title="Skip">
                          <Button size="small" variant="outlined" color="warning"
                            onClick={() => setShowSkipDialog(task.sop_uuid)} disabled={sopAction}
                            sx={{ py: 0, px: 0.4, minHeight: 22, minWidth: 26 }}>
                            <SkipNextIcon sx={{ fontSize: 12 }} />
                          </Button>
                        </Tooltip>
                      )}
                    </Stack>
                  )}
                </Stack>
              );
            })}
          </Stack>
        </Box>
      )}

      {/* ── Assigned tasks ── */}
      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.6 }}>
          <Typography variant="caption" fontWeight={800} color="text.disabled"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.6rem' }}>
            Assigned Tasks
          </Typography>
          {tasks.length > 0 && (
            <Chip label={taskSummary} color="primary" size="small" sx={{ height: 18, fontSize: '0.6rem' }} />
          )}
        </Stack>
        <Stack spacing={0.4}>
          {tasks.map((task) => (
            <Stack
              key={`${task.source}-${task.id}`}
              direction="row" alignItems="center" spacing={0.75}
              sx={{
                py: 0.6, px: 0.75, borderRadius: 1.5,
                bgcolor: task.overdue ? '#fff5f5' : 'rgba(0,0,0,0.02)',
                border: '1px solid',
                borderColor: task.overdue ? '#fecaca' : 'divider',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" fontWeight={700} noWrap sx={{ display: 'block' }}>
                  {task.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.63rem' }}>
                  {task.taskName} · {task.source}
                </Typography>
              </Box>
              {task.overdue && (
                <Chip size="small" color="error" label="Overdue" sx={{ height: 16, fontSize: '0.6rem', flexShrink: 0 }} />
              )}
            </Stack>
          ))}
          {!tasks.length && (
            <Typography variant="caption" color="text.disabled"
              sx={{ py: 1.5, textAlign: 'center', display: 'block' }}>
              No tasks assigned yet
            </Typography>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
