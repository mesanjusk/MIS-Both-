import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import axios from '../../apiClient';
import { ownerRoleLabel } from '../../constants/operations';

const PHASES = [
  ['morning', 'Morning'],
  ['during_day', 'During work'],
  ['evening', 'Closing'],
  ['any', 'Any time'],
];
const inPhase = (task, phase) => (task.timeOfDay || 'any') === phase;

export default function EmployeeSopDialog({ open, mode = 'day', onClose, onPunchOut }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('morning');
  const [editor, setEditor] = useState(null);
  const [reason, setReason] = useState('');
  const [recipient, setRecipient] = useState('Manager');
  const [showEmergency, setShowEmergency] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await axios.get('/api/sop/daily/me', { cache: false });
      if (!data?.success) throw new Error(data?.message || 'Could not load your checklist.');
      setStatus(data);
    } catch (err) {
      setStatus(null);
      setError(err?.response?.data?.message || err.message || 'Unable to load SOP. Retry.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    setPhase(mode === 'close' ? 'pending' : 'morning');
    setShowEmergency(false);
    setEmergencyReason('');
    setEditor(null);
    refresh();
  }, [open, mode, refresh]);

  const shownTasks = useMemo(() => {
    const tasks = status?.tasks || [];
    if (phase === 'all') return tasks;
    if (phase === 'pending') return tasks.filter((task) =>
      !status?.completionMap?.[task.sop_uuid]);
    return tasks.filter((task) => inPhase(task, phase));
  }, [status, phase]);

  const update = async (url, payload) => {
    setBusy(true); setError('');
    try {
      const { data } = await axios.post(url, payload);
      if (!data?.success) throw new Error(data?.message || 'Action failed.');
      setEditor(null); setReason(''); setRecipient('Manager');
      await refresh();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not save SOP update.');
    } finally { setBusy(false); }
  };

  const doEndDay = async (emergency = false) => {
    setBusy(true); setError('');
    try {
      const ok = await onPunchOut?.(emergency ? emergencyReason.trim() : '');
      if (!ok) throw new Error('Attendance could not be updated. Retry.');
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'End Day failed.');
      await refresh();
    } finally { setBusy(false); }
  };

  const completedCount = status?.completedCount || 0;
  const pendingCount = status?.blockingTasks?.length || 0;
  const total = status?.totalCount || 0;
  const exceptionCount = status?.exceptions?.length || 0;

  return (
    <Dialog open={Boolean(open)} onClose={busy ? undefined : onClose} fullWidth maxWidth="md"
      aria-labelledby="employee-sop-title">
      <DialogTitle id="employee-sop-title" sx={{ pb: 0.5 }}>
        {mode === 'start' ? 'Good morning — your SOP' : mode === 'close' ? 'Before you Punch Out' : 'My Daily SOP'}
        <Typography variant="body2" color="text.secondary">
          Only your assigned and applicable team tasks. MIS verifies attendance automatically.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
            <Chip size="small" label={`${completedCount}/${total} completed`} color="success" variant="outlined" />
            <Chip size="small" label={`${pendingCount} mandatory pending`}
              color={pendingCount ? 'warning' : 'success'} />
            {exceptionCount > 0 && <Chip size="small" color="warning" variant="outlined"
              label={`${exceptionCount} handed over · pending review`} />}
            <Box sx={{ flex: 1 }} />
            <Button size="small" startIcon={<RefreshRoundedIcon />} disabled={loading || busy}
              onClick={refresh}>Refresh</Button>
          </Stack>
          {loading && <CircularProgress size={20} />}
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {[
              ...(mode === 'close' ? [['pending', 'Needs attention']] : []),
              ...PHASES, ['all', 'All tasks'],
            ].map(([value, label]) => <Button key={value} size="small"
              variant={phase === value ? 'contained' : 'outlined'}
              disabled={loading || busy} onClick={() => setPhase(value)}>{label}</Button>)}
          </Stack>

          {status && !shownTasks.length && (
            <Alert severity="success">
              {phase === 'pending' ? 'No unresolved SOP tasks.' : 'No SOP tasks in this section today.'}
            </Alert>
          )}

          {shownTasks.map((task) => {
            const completion = status?.completionMap?.[task.sop_uuid];
            const handover = status?.handoverMap?.[task.sop_uuid];
            return (
              <Paper key={task.sop_uuid} variant="outlined" sx={{ p: 1.3, borderRadius: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={800}>{task.title}</Typography>
                    {task.description && <Typography variant="caption" color="text.secondary">{task.description}</Typography>}
                    <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                      <Chip size="small" label={task.isSkippable ? 'Optional' : 'Mandatory'}
                        color={task.isSkippable ? 'default' : 'warning'} variant="outlined" />
                      {task.scope === 'group' ? (
                        <Chip size="small" label="Team task" variant="outlined" />
                      ) : (
                        <>
                          <Chip size="small" color="secondary" variant="outlined"
                            label={task.responsibilityName || 'Responsibility'} />
                          <Chip size="small"
                            color={task.transferred ? 'warning' : 'success'}
                            variant={task.transferred ? 'filled' : 'outlined'}
                            label={task.effectiveOwner?.userName
                              ? `Owner now: ${task.effectiveOwner.userName} · ${ownerRoleLabel(task.effectiveOwner.role)}`
                              : task.transferred ? 'Backup responsibility' : 'My responsibility'} />
                        </>
                      )}
                      {completion && <Chip size="small" color="success" icon={<CheckCircleRoundedIcon />}
                        label={completion.autoVerified ? 'Auto-verified · Punch In'
                          : completion.skipped ? 'Not applicable' : 'Completed'} />}
                      {!completion && handover && <Chip size="small" color="warning"
                        label={`Handed over to ${handover.assignedTo} · pending review`} />}
                    </Stack>
                  </Box>
                  {!completion && !status?.hasEnded && status?.hasStarted && (
                    <Stack direction="row" gap={0.5} alignItems="center" flexWrap="wrap">
                      <Button size="small" variant="contained" disabled={busy}
                        onClick={() => update('/api/sop/complete', { sopUuid: task.sop_uuid })}>
                        Mark done
                      </Button>
                      {task.isSkippable && <Button size="small" disabled={busy}
                        onClick={() => { setEditor({ task, type: 'skip' }); setReason('No applicable work today'); }}>
                        N/A
                      </Button>}
                      <Button size="small" color="warning" disabled={busy}
                        onClick={() => { setEditor({ task, type: 'handover' }); setReason(''); setRecipient('Manager'); }}>
                        Blocked / Handover
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Paper>
            );
          })}

          {mode === 'close' && status && (
            <>
              <Divider />
              {status.canEndDay
                ? <Alert severity={exceptionCount ? 'warning' : 'success'}>
                  {exceptionCount
                    ? 'Every mandatory item is completed or has a documented handover. Your exceptions remain pending management review.'
                    : 'Mandatory SOP complete. You can Punch Out.'}
                </Alert>
                : <Alert severity="warning">
                  Complete or hand over the {pendingCount} mandatory outstanding SOP item(s) before Punch Out.
                </Alert>}
              {pendingCount > 0 && (
                <Box>
                  <Button size="small" color="warning" onClick={() => setShowEmergency((value) => !value)}
                    disabled={busy}>Emergency clock-out with reason</Button>
                  {showEmergency && <Stack gap={1} sx={{ mt: 1 }}>
                    <TextField size="small" fullWidth multiline minRows={2} label="Emergency reason (required)"
                      value={emergencyReason} onChange={(event) => setEmergencyReason(event.target.value)}
                      inputProps={{ maxLength: 1000 }} />
                    <Typography variant="caption" color="text.secondary">
                      Unfinished SOP will remain flagged for management, not marked completed.
                    </Typography>
                    <Button color="warning" variant="outlined" disabled={busy ||
                      emergencyReason.trim().length < 10 || emergencyReason.trim().length > 1000}
                      onClick={() => doEndDay(true)}>Record exception & Punch Out</Button>
                  </Stack>}
                </Box>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>
        <Button disabled={busy} onClick={onClose}>{mode === 'start' ? 'Continue to work' : 'Close'}</Button>
        {mode === 'close' && <Button variant="contained" color="success" disabled={loading || busy ||
          !status?.hasStarted || status?.hasEnded || !status?.canEndDay}
          onClick={() => doEndDay(false)}>Punch Out</Button>}
      </DialogActions>

      <Dialog open={Boolean(editor)} onClose={busy ? undefined : () => setEditor(null)}
        fullWidth maxWidth="xs" aria-labelledby="sop-handover-title">
        <DialogTitle id="sop-handover-title">{editor?.type === 'skip' ? 'Mark N/A' : 'Record blocker / handover'}</DialogTitle>
        <DialogContent>
          <Stack gap={1.5} sx={{ pt: 0.5 }}>
            <Typography variant="body2" fontWeight={700}>{editor?.task?.title}</Typography>
            <TextField label="Reason" multiline minRows={2} fullWidth size="small"
              value={reason} inputProps={{ maxLength: 1000 }}
              onChange={(event) => setReason(event.target.value)} />
            {editor?.type !== 'skip' && <TextField label="Assigned to" size="small" fullWidth
              value={recipient} inputProps={{ maxLength: 120 }}
              helperText="Who will take over this work? Manager is the default."
              onChange={(event) => setRecipient(event.target.value)} />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEditor(null)}>Cancel</Button>
          <Button variant="contained" disabled={busy ||
            reason.trim().length < (editor?.type === 'skip' ? 3 : 5) ||
            (editor?.type !== 'skip' && !recipient.trim())}
            onClick={() => update(editor?.type === 'skip' ? '/api/sop/skip' : '/api/sop/handover',
              editor?.type === 'skip' ? { sopUuid: editor.task.sop_uuid, skipReason: reason.trim() }
                : { sopUuid: editor.task.sop_uuid, reason: reason.trim(), assignedTo: recipient.trim() })}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
