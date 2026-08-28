import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, Divider, FormControl, FormControlLabel, Grid,
  InputLabel, MenuItem, Select, Stack, Switch, TextField, Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import {
  PageContainer, SectionCard, LoadingState, ErrorState, EmptyState,
} from '../Components/ui';
import { WEEK_DAYS, attendanceColor, stateColor, ownerRoleLabel } from '../constants/operations';
import { useAuth } from '../context/AuthContext';
import {
  fetchUserOperations, saveUserOperations, fetchOperationsSettings, setUserOperationalState,
} from '../services/operationsService';

/**
 * Dashboard → Users → Select User → User Profile → Operational Assignment.
 *
 * Priority, role, department, hours and eligibility are all plain configuration
 * saved to the user record — changing P1 here takes effect everywhere on the
 * next page load, with no deployment.
 */
export default function UserOperationsProfile() {
  const { userUuid } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useAuth();
  const canEdit = isAdmin || isSuperAdmin;

  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [swapPriority, setSwapPriority] = useState(true);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profileRes, settingsRes] = await Promise.all([
        fetchUserOperations(userUuid),
        fetchOperationsSettings(),
      ]);
      const result = profileRes.data?.result;
      setProfile(result);
      setSettings(settingsRes.data?.result);
      const operations = result?.operations || {};
      setForm({
        priority: operations.priority || '',
        roleTitle: operations.roleTitle || '',
        department: operations.department || '',
        backupEligible: operations.backupEligible !== false,
        alwaysAvailable: operations.alwaysAvailable === true,
        active: operations.active !== false,
        workingDays: Array.isArray(operations.workingDays) ? operations.workingDays : [],
        startTime: operations.startTime || '',
        endTime: operations.endTime || '',
        breakStart: operations.breakStart || '',
        breakEnd: operations.breakEnd || '',
      });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userUuid]);

  useEffect(() => { load(); }, [load]);

  const setField = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDay = (day) => () => {
    setForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((entry) => entry !== day)
        : [...prev.workingDays, day].sort((a, b) => a - b),
    }));
  };

  /** Pick up the role title configured against the chosen priority code. */
  const onPriorityChange = (event) => {
    const code = event.target.value;
    const level = (settings?.priorityLevels || []).find((entry) => entry.code === code);
    setForm((prev) => ({
      ...prev,
      priority: code,
      roleTitle: prev.roleTitle || level?.defaultRoleTitle || '',
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await saveUserOperations(userUuid, { operations: form, swapPriority, reason });
      const swapped = res.data?.swapped;
      setSuccess(
        swapped
          ? `Saved. ${swapped.User_name} moved from ${swapped.from || '—'} to ${swapped.to || '—'}.`
          : 'Operational assignment saved.',
      );
      setReason('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const changeState = async (status) => {
    setError('');
    try {
      await setUserOperationalState(userUuid, { status, currentTask: '' });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not change state');
    }
  };

  if (loading || !form) {
    return (
      <PageContainer title="User Profile">
        {error ? <ErrorState message={error} /> : <LoadingState label="Loading profile..." />}
      </PageContainer>
    );
  }

  const availability = profile?.availability || {};

  return (
    <PageContainer
      title={profile?.name || profile?.User_name || 'User Profile'}
      subtitle="Operational assignment, working hours and responsibility coverage"
      actions={(
        <Button size="small" startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>
      )}
    >
      {error ? <ErrorState message={error} /> : null}
      {success ? <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert> : null}
      {!canEdit ? <Typography variant="caption" color="text.secondary">Read-only</Typography> : null}

      <SectionCard title="Account">
        <Grid container spacing={1}>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Name</Typography>
            <Typography variant="body2">{profile?.name || profile?.User_name}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Login</Typography>
            <Typography variant="body2">{profile?.User_name}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Access role</Typography>
            <Typography variant="body2">{profile?.User_group || '—'}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Attendance today</Typography>
            <Box>
              <Chip size="small" color={attendanceColor(availability.attendanceStatus)} label={availability.attendanceStatus || '—'} />
              {availability.inTime ? (
                <Typography variant="caption" sx={{ ml: 1 }}>In {availability.inTime}</Typography>
              ) : null}
            </Box>
          </Grid>
          <Grid item xs={12} sm={8}>
            <Typography variant="caption" color="text.secondary">Operational state</Typography>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {(settings?.operationalStates || []).map((state) => (
                <Chip
                  key={state}
                  size="small"
                  clickable={canEdit}
                  onClick={canEdit ? () => changeState(state) : undefined}
                  color={availability.operationalState === state ? stateColor(state) : 'default'}
                  variant={availability.operationalState === state ? 'filled' : 'outlined'}
                  label={state}
                />
              ))}
            </Stack>
            {availability.currentTask ? (
              <Typography variant="caption">Current task: {availability.currentTask}</Typography>
            ) : null}
          </Grid>
        </Grid>
      </SectionCard>

      <SectionCard
        title="Operational Assignment"
        subtitle="Stored as configuration — no code change is needed to move a priority between users"
      >
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl size="small" fullWidth disabled={!canEdit}>
              <InputLabel>Operational Priority</InputLabel>
              <Select label="Operational Priority" value={form.priority} onChange={onPriorityChange}>
                <MenuItem value="">— None —</MenuItem>
                {(settings?.priorityLevels || []).map((level) => (
                  <MenuItem key={level.code} value={level.code}>{level.label || level.code}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={5}>
            <TextField
              label="Primary Role"
              size="small"
              fullWidth
              disabled={!canEdit}
              value={form.roleTitle}
              onChange={setField('roleTitle')}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <FormControl size="small" fullWidth disabled={!canEdit}>
              <InputLabel>Department</InputLabel>
              <Select label="Department" value={form.department} onChange={setField('department')}>
                <MenuItem value="">— None —</MenuItem>
                {(settings?.departments || []).map((department) => (
                  <MenuItem key={department} value={department}>{department}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControlLabel
              control={<Switch checked={form.backupEligible} onChange={setField('backupEligible')} disabled={!canEdit} />}
              label="Backup Eligible"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControlLabel
              control={<Switch checked={form.active} onChange={setField('active')} disabled={!canEdit} />}
              label="Active"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={(
                <Switch
                  checked={form.alwaysAvailable}
                  onChange={setField('alwaysAvailable')}
                  disabled={!canEdit}
                />
              )}
              label="Always available (holds work without marking attendance)"
            />
            <Typography variant="caption" color="text.secondary" display="block">
              For an owner or manager who takes tasks without clocking in. Being marked Busy or
              Outside still passes inside-store work to the next backup.
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={<Checkbox checked={swapPriority} onChange={(event) => setSwapPriority(event.target.checked)} disabled={!canEdit} />}
              label="Swap with whoever currently holds this priority"
            />
          </Grid>
        </Grid>
      </SectionCard>

      <SectionCard title="Working Hours" subtitle="Leave a field blank to inherit the store setting">
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">Working Days</Typography>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {WEEK_DAYS.map((day) => (
                <Chip
                  key={day.value}
                  size="small"
                  label={day.label}
                  clickable={canEdit}
                  onClick={canEdit ? toggleDay(day.value) : undefined}
                  color={form.workingDays.includes(day.value) ? 'primary' : 'default'}
                  variant={form.workingDays.includes(day.value) ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
            {!form.workingDays.length ? (
              <Typography variant="caption" color="text.secondary">
                None selected — the store working days apply
                {settings?.store?.workingDays
                  ? ` (${settings.store.workingDays.map((day) => WEEK_DAYS[day]?.label).join(', ')})`
                  : ''}.
              </Typography>
            ) : null}
          </Grid>
          {[
            ['startTime', 'Start Time'],
            ['endTime', 'End Time'],
            ['breakStart', 'Break Start'],
            ['breakEnd', 'Break End'],
          ].map(([field, label]) => (
            <Grid item xs={6} sm={3} key={field}>
              <TextField
                label={label}
                size="small"
                type="time"
                fullWidth
                disabled={!canEdit}
                value={form[field]}
                onChange={setField(field)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          ))}
        </Grid>
      </SectionCard>

      {canEdit ? (
        <SectionCard>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
            <TextField
              label="Reason for change (optional, recorded in audit history)"
              size="small"
              fullWidth
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button variant="contained" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Stack>
        </SectionCard>
      ) : null}

      <SectionCard title="Responsibilities">
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2">Primary</Typography>
            <Divider sx={{ my: 0.5 }} />
            {profile?.primaryResponsibilities?.length ? (
              profile.primaryResponsibilities.map((item) => (
                <Typography key={item.responsibility_uuid} variant="body2">• {item.name}</Typography>
              ))
            ) : <EmptyState title="None" />}
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2">Backup</Typography>
            <Divider sx={{ my: 0.5 }} />
            {profile?.backupResponsibilities?.length ? (
              profile.backupResponsibilities.map((item) => (
                <Typography key={item.responsibility_uuid} variant="body2">• {item.name}</Typography>
              ))
            ) : <EmptyState title="None" />}
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2">Owned right now</Typography>
            <Divider sx={{ my: 0.5 }} />
            {profile?.activeNow?.length ? (
              profile.activeNow.map((item) => (
                <Typography key={item.responsibility_uuid} variant="body2">
                  • {item.name}{' '}
                  <Chip size="small" variant="outlined" label={ownerRoleLabel(item.currentOwner?.role)} />
                </Typography>
              ))
            ) : <EmptyState title="Nothing active" />}
          </Grid>
        </Grid>
      </SectionCard>
    </PageContainer>
  );
}
