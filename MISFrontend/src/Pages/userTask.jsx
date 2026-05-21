import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Stack, Tooltip, Typography,
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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingAssignments, setPendingAssignments] = useState([]);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);

  // SOP state
  const [sopTasks, setSopTasks] = useState([]);
  const [sopCompletions, setSopCompletions] = useState({});
  const [sopCanEndDay, setSopCanEndDay] = useState(true);
  const [sopBlockingTasks, setSopBlockingTasks] = useState([]);
  const [sopLoading, setSopLoading] = useState(false);
  const [sopAction, setSopAction] = useState(false);
  const [showSkipDialog, setShowSkipDialog] = useState(null);
  const [skipReason, setSkipReason] = useState('');

  const group = userGroup || localStorage.getItem('User_group') || '';

  const loadSopStatus = useCallback(async () => {
    if (!group) return;
    setSopLoading(true);
    try {
      const res = await axios.get('/api/sop/daily', { params: { userGroup: group } });
      if (res.data.success) {
        setSopTasks(res.data.tasks || []);
        setSopCompletions(res.data.completionMap || {});
        setSopCanEndDay(res.data.canEndDay !== false);
        setSopBlockingTasks(res.data.blockingTasks || []);
      }
    } catch {
      // silently ignore; SOP is non-blocking
    } finally {
      setSopLoading(false);
    }
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
      setMessage(myTasks.length ? `You have ${myTasks.length} assigned pending tasks.` : '');
    } catch (err) {
      console.error(err);
      setError('Failed to load your day view.');
    }
  }, [userName]);

  useEffect(() => {
    loadPage();
    loadSopStatus();
  }, [loadPage, loadSopStatus]);

  const hasStarted = attendanceFlow.includes('In');
  const hasEnded = attendanceFlow.includes('Out');

  const canEndDay = hasStarted && !hasEnded && sopCanEndDay;

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

  const summary = useMemo(() => {
    const overdue = tasks.filter((task) => task.overdue).length;
    return `${tasks.length} assigned tasks${overdue ? ` • ${overdue} overdue` : ''}`;
  }, [tasks]);

  const endDayButton = (() => {
    if (!hasStarted || hasEnded) return null;
    if (!sopCanEndDay) {
      const label = sopBlockingTasks.length
        ? `${sopBlockingTasks.length} mandatory SOP task${sopBlockingTasks.length > 1 ? 's' : ''} pending`
        : 'SOP tasks pending';
      return (
        <Tooltip title={label} arrow>
          <span>
            <Button variant="outlined" disabled>End day</Button>
          </span>
        </Tooltip>
      );
    }
    return (
      <Button variant="outlined" onClick={() => saveAttendance('Out')}>End day</Button>
    );
  })();

  return (
    <Stack spacing={2} sx={{ p: { xs: 1, md: 2 } }}>
      <Box>
        <Typography variant="h5" fontWeight={700}>My day</Typography>
        <Typography color="text.secondary">Start attendance, then work your assigned queue till 8:00 PM.</Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="info">{message}</Alert>}

      {/* Pending assignments dialog */}
      <Dialog open={showAssignmentDialog} onClose={() => setShowAssignmentDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Your pending assignments</DialogTitle>
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
            )) : <Typography variant="body2" color="text.secondary">No pending assignments right now.</Typography>}
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

      {/* Attendance card */}
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Attendance actions</Typography>
              <Typography variant="body2" color="text.secondary">
                Today flow: {attendanceFlow.length ? attendanceFlow.join(' → ') : 'Not started'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="contained" disabled={hasStarted} onClick={() => saveAttendance('In')}>Start day</Button>
              {endDayButton}
            </Stack>
          </Stack>
          {!sopCanEndDay && hasStarted && !hasEnded && sopBlockingTasks.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              Complete these mandatory SOP tasks before ending the day:
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                {sopBlockingTasks.map((t) => <li key={t.sop_uuid}>{t.title}</li>)}
              </ul>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* SOP Daily Checklist */}
      {sopTasks.length > 0 && (
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>Daily SOP Checklist</Typography>
                <Typography variant="body2" color="text.secondary">
                  {sopTasks.filter((t) => sopCompletions[t.sop_uuid]).length} of {sopTasks.length} completed
                </Typography>
              </Box>
              <Chip
                label={sopCanEndDay ? 'All clear' : `${sopBlockingTasks.length} blocking`}
                color={sopCanEndDay ? 'success' : 'error'}
                size="small"
              />
            </Stack>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={1}>
              {sopTasks.map((task) => {
                const completion = sopCompletions[task.sop_uuid];
                const done = Boolean(completion);
                const skipped = completion?.skipped;
                return (
                  <Box
                    key={task.sop_uuid}
                    sx={{
                      border: '1px solid',
                      borderColor: done ? (skipped ? 'warning.light' : 'success.light') : 'divider',
                      borderRadius: 2,
                      p: 1.25,
                      bgcolor: done ? (skipped ? 'warning.50' : 'success.50') : 'transparent',
                      opacity: done ? 0.85 : 1,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <Box sx={{ pt: 0.25 }}>
                        {done
                          ? <CheckCircleIcon fontSize="small" color={skipped ? 'warning' : 'success'} />
                          : <RadioButtonUncheckedIcon fontSize="small" color="disabled" />}
                      </Box>
                      <Box flex={1}>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center" sx={{ mb: 0.25 }}>
                          <Typography variant="body2" fontWeight={done ? 400 : 600} sx={{ textDecoration: skipped ? 'line-through' : 'none' }}>
                            {task.title}
                          </Typography>
                          <Chip label={TIME_LABEL[task.timeOfDay]} size="small" color={TIME_COLOR[task.timeOfDay]} sx={{ height: 18, fontSize: 10 }} />
                          {!task.isSkippable && !done && <Chip label="Mandatory" size="small" color="error" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
                          {skipped && <Chip label="Skipped" size="small" color="warning" sx={{ height: 18, fontSize: 10 }} />}
                        </Stack>
                        {task.description && (
                          <Typography variant="caption" color="text.secondary">{task.description}</Typography>
                        )}
                        {task.kpi && (
                          <Typography variant="caption" color="success.dark" sx={{ display: 'block' }}>KPI: {task.kpi}</Typography>
                        )}
                      </Box>
                      {!done && (
                        <Stack direction="row" spacing={0.5}>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => handleComplete(task.sop_uuid)}
                            disabled={sopAction}
                            sx={{ minWidth: 80, fontSize: 12 }}
                          >
                            Done
                          </Button>
                          {task.isSkippable && (
                            <Tooltip title="Skip this task">
                              <Button
                                size="small"
                                variant="outlined"
                                color="warning"
                                onClick={() => setShowSkipDialog(task.sop_uuid)}
                                disabled={sopAction}
                                sx={{ minWidth: 32, px: 0.5 }}
                              >
                                <SkipNextIcon fontSize="small" />
                              </Button>
                            </Tooltip>
                          )}
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Assigned tasks */}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Assigned tasks</Typography>
              <Typography variant="body2" color="text.secondary">{summary}</Typography>
            </Box>
            <Chip label={tasks.length ? 'Working queue' : 'No tasks'} color={tasks.length ? 'primary' : 'default'} />
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Stack spacing={1.5}>
            {tasks.map((task) => (
              <Box key={`${task.source}-${task.id}`} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Typography fontWeight={700}>{task.title}</Typography>
                <Typography variant="body2" color="text.secondary">Type: {task.source}</Typography>
                <Typography variant="body2" color="text.secondary">Task: {task.taskName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Due: {task?.dueDate ? new Date(task.dueDate).toLocaleString() : 'Today 8:00 PM'}
                </Typography>
                {task.overdue && <Chip size="small" color="error" label="Pending from previous day" sx={{ mt: 1 }} />}
              </Box>
            ))}
            {!tasks.length && <Typography variant="body2" color="text.secondary">No assigned tasks yet.</Typography>}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
