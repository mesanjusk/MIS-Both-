import { useEffect, useState, useCallback } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Stack, TextField, Tooltip, Typography,
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

// Daily SOP checklist for the signed-in user's role. Attendance
// (start/end day) lives next to the user's name in the top nav instead —
// this component is task-checklist only.
export default function UserTask() {
  const { userName, userGroup } = useAuth();
  const [error, setError] = useState('');

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

  useEffect(() => {
    loadSopStatus();
  }, [loadSopStatus]);

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

  if (!sopTasks.length && !error) return null;

  return (
    <Stack spacing={1} sx={{ p: { xs: 0.75, md: 1 } }}>
      {error && <Alert severity="error" sx={{ py: 0.5, fontSize: '0.78rem' }}>{error}</Alert>}

      {/* Skip reason dialog */}
      <Dialog open={Boolean(showSkipDialog)} onClose={() => { setShowSkipDialog(null); setSkipReason(''); }} maxWidth="xs" fullWidth>
        <DialogTitle>Skip this task?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Optionally provide a reason for skipping.
          </Typography>
          <TextField
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Reason (optional)"
            size="small"
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowSkipDialog(null); setSkipReason(''); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSkip} disabled={sopAction}>Skip</Button>
        </DialogActions>
      </Dialog>

      {!sopCanEndDay && sopBlockingTasks.length > 0 && (
        <Alert severity="warning" sx={{ py: 0.4, fontSize: '0.73rem' }}>
          {sopBlockingTasks.length} mandatory SOP task{sopBlockingTasks.length > 1 ? 's' : ''} pending before end day
        </Alert>
      )}

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
    </Stack>
  );
}
