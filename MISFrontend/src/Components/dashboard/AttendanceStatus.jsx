import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Tooltip, Typography,
} from '@mui/material';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import axios from '../../apiClient';
import EmployeeSopDialog from './EmployeeSopDialog';

// The personal checklist (not a group-level "someone already ticked it"
// estimate) is now the employee's single Start Day / End Day checkpoint.
// Attendance endpoints enforce the same policy for every attendance channel.
export default function AttendanceStatus() {
  const { userName } = useAuth();
  const [attendanceFlow, setAttendanceFlow] = useState([]);
  const [error, setError] = useState('');
  const [pendingAssignments, setPendingAssignments] = useState([]);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [sopOpen, setSopOpen] = useState(false);
  const [sopMode, setSopMode] = useState('day');
  const [submitting, setSubmitting] = useState(false);

  const loadAttendance = useCallback(async () => {
    if (!userName) return;
    try {
      const res = await axios.get(
        `/api/attendance/getTodayAttendance/${encodeURIComponent(userName)}`,
        { cache: false }
      );
      setAttendanceFlow(res?.data?.flow || []);
      setPendingAssignments(res?.data?.pendingAssignments || []);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load attendance.');
    }
  }, [userName]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const hasStarted = attendanceFlow.includes('In');
  const hasEnded = attendanceFlow.includes('Out');

  const openSop = (mode) => {
    setSopMode(mode);
    setSopOpen(true);
    setError('');
  };

  const closeSop = () => {
    setSopOpen(false);
    // Preserve the previous post-punch pending-assignment popup, but display
    // the shorter morning SOP first rather than opening two dialogs at once.
    if (sopMode === 'start' && pendingAssignments.length > 0) {
      setShowAssignmentDialog(true);
    }
  };

  const saveAttendance = async (type, sopEmergencyReason = '') => {
    if (submitting) return false;
    setSubmitting(true);
    try {
      setError('');
      const response = await axios.post('/api/attendance/addAttendance', {
        User_name: userName,
        Type: type,
        Status: type === 'Out' ? 'Completed' : 'Present',
        Time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        ...(sopEmergencyReason ? { sopEmergencyReason } : {}),
      });
      if (!response?.data?.success) throw new Error(response?.data?.message || 'Attendance update failed.');
      if (type === 'In') {
        setPendingAssignments(response?.data?.pendingAssignments || []);
        openSop('start');
      }
      if (type === 'Out') {
        toast.success(sopEmergencyReason ? 'Day ended; SOP exceptions recorded for review.' : 'Day ended. SOP checked.');
      }
      await loadAttendance();
      return true;
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Could not update attendance.';
      setError(message);
      if (type === 'In') toast.error(message);
      throw err;
    } finally { setSubmitting(false); }
  };

  if (!userName) return null;

  return (
    <>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Tooltip title={error || (attendanceFlow.length ? attendanceFlow.join(' → ') : 'Not checked in')}>
          <Chip size="small"
            label={hasStarted && !hasEnded ? 'On duty' : hasEnded ? 'Day done' : 'Not checked in'}
            color={error ? 'error' : hasStarted && !hasEnded ? 'success' : 'default'}
            variant={hasStarted ? 'filled' : 'outlined'}
            sx={{ height: 22, fontSize: '0.66rem', fontWeight: 600 }} />
        </Tooltip>
        {!hasStarted && <Button size="small" variant="contained" disabled={submitting}
          onClick={() => saveAttendance('In').catch(() => {})}
          sx={{ py: 0.2, px: 1, fontSize: '0.7rem', minHeight: 24, whiteSpace: 'nowrap' }}>
          Start day
        </Button>}
        {hasStarted && <Button size="small" color="primary" variant="outlined"
          onClick={() => openSop('day')}
          sx={{ py: 0.2, px: 1, fontSize: '0.7rem', minHeight: 24, whiteSpace: 'nowrap' }}>
          My SOP
        </Button>}
        {hasStarted && !hasEnded && <Button variant="outlined" size="small" disabled={submitting}
          onClick={() => openSop('close')}
          sx={{ py: 0.2, px: 1, fontSize: '0.7rem', minHeight: 24, whiteSpace: 'nowrap' }}>
          End day
        </Button>}
      </Stack>

      <EmployeeSopDialog
        open={sopOpen} mode={sopMode}
        onClose={closeSop}
        onPunchOut={(reason) => saveAttendance('Out', reason)}
      />

      <Dialog open={showAssignmentDialog} onClose={() => setShowAssignmentDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Pending assignments</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {pendingAssignments.length ? pendingAssignments.map((task) => (
              <Box key={`${task.source}-${task.id}`}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
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
