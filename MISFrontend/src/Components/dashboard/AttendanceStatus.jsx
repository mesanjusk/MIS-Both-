import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Tooltip, Typography,
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import axios from '../../apiClient';

// Compact "Start day / End day" attendance control, shown next to the
// user's name in the top nav — moved out of the Workflow widget so
// attendance lives with identity, not buried in a task list.
export default function AttendanceStatus() {
  const { userName, userGroup } = useAuth();
  const [attendanceFlow, setAttendanceFlow] = useState([]);
  const [error, setError] = useState('');
  const [pendingAssignments, setPendingAssignments] = useState([]);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [sopCanEndDay, setSopCanEndDay] = useState(true);
  const [sopBlockingTasks, setSopBlockingTasks] = useState([]);

  const group = userGroup || localStorage.getItem('User_group') || '';

  const loadSopStatus = useCallback(async () => {
    if (!group) return;
    try {
      const res = await axios.get('/api/sop/daily', { params: { userGroup: group } });
      if (res.data.success) {
        setSopCanEndDay(res.data.canEndDay !== false);
        setSopBlockingTasks(res.data.blockingTasks || []);
      }
    } catch {}
  }, [group]);

  const loadAttendance = useCallback(async () => {
    if (!userName) return;
    try {
      setError('');
      const res = await axios.get(`/api/attendance/getTodayAttendance/${userName}`);
      setAttendanceFlow(res?.data?.flow || []);
      setPendingAssignments(res?.data?.pendingAssignments || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load attendance.');
    }
  }, [userName]);

  useEffect(() => {
    loadAttendance();
    loadSopStatus();
  }, [loadAttendance, loadSopStatus]);

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
      await loadAttendance();
    } catch (err) {
      console.error(err);
      setError('Failed to update attendance.');
    }
  };

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
              sx={{ py: 0.2, px: 1, fontSize: '0.7rem', minHeight: 24, whiteSpace: 'nowrap' }}>
              End day
            </Button>
          </span>
        </Tooltip>
      );
    }
    return (
      <Button variant="outlined" size="small" onClick={() => saveAttendance('Out')}
        sx={{ py: 0.2, px: 1, fontSize: '0.7rem', minHeight: 24, whiteSpace: 'nowrap' }}>
        End day
      </Button>
    );
  })();

  if (!userName) return null;

  return (
    <>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Tooltip title={error || (attendanceFlow.length ? attendanceFlow.join(' → ') : 'Not checked in')}>
          <Chip
            size="small"
            label={hasStarted && !hasEnded ? 'On duty' : hasEnded ? 'Day done' : 'Not checked in'}
            color={hasStarted && !hasEnded ? 'success' : 'default'}
            variant={hasStarted ? 'filled' : 'outlined'}
            sx={{ height: 22, fontSize: '0.66rem', fontWeight: 600 }}
          />
        </Tooltip>
        {!hasStarted && (
          <Button size="small" variant="contained" onClick={() => saveAttendance('In')}
            sx={{ py: 0.2, px: 1, fontSize: '0.7rem', minHeight: 24, whiteSpace: 'nowrap' }}>
            Start day
          </Button>
        )}
        {endDayButton}
      </Stack>

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
    </>
  );
}
