import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import FingerprintRoundedIcon from '@mui/icons-material/FingerprintRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
  fetchAttendanceDevices,
  registerAttendanceDevice,
  updateAttendanceDevice,
  rotateAttendanceDeviceKey,
  fetchAttendanceDeviceEmployeeMappings,
  updateAttendanceDeviceEmployeeMapping,
} from '../../services/attendanceService';

const emptyForm = () => ({
  Name: '',
  SerialNumber: '',
  Location: '',
  Provider: '',
  Protocol: '',
  Settings: '',
});

const formatLastSeen = (value) => {
  if (!value) return 'Never connected';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function AttendanceDevicePanel() {
  const [devices, setDevices] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [mappingDrafts, setMappingDrafts] = useState({});
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [issuedKey, setIssuedKey] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [deviceResponse, mappingResponse] = await Promise.all([
        fetchAttendanceDevices(),
        fetchAttendanceDeviceEmployeeMappings(),
      ]);
      const nextDevices = deviceResponse?.data?.result || [];
      const nextMappings = mappingResponse?.data?.result || [];
      setDevices(nextDevices);
      setMappings(nextMappings);
      setMappingDrafts(Object.fromEntries(nextMappings.map((user) => [user.User_uuid, user.employeeId || ''])));
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load attendance device settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const mappedCount = useMemo(
    () => mappings.filter((user) => String(user.employeeId || '').trim()).length,
    [mappings]
  );

  const parseSettings = () => {
    const text = String(form.Settings || '').trim();
    if (!text) return {};
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('Settings must be a JSON object.');
    }
    return parsed;
  };

  const handleRegister = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    setIssuedKey(null);
    try {
      const Settings = parseSettings();
      const response = await registerAttendanceDevice({
        Name: form.Name.trim(),
        SerialNumber: form.SerialNumber.trim(),
        Location: form.Location.trim(),
        Provider: form.Provider.trim() || 'Generic',
        Protocol: form.Protocol.trim() || 'API',
        Settings,
      });
      const result = response?.data?.result;
      setIssuedKey({
        deviceId: result?.Device_uuid,
        serialNumber: result?.SerialNumber,
        key: response?.data?.deviceKey,
      });
      setMessage(response?.data?.message || 'Attendance device registered.');
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(err instanceof SyntaxError
        ? 'Settings JSON is invalid.'
        : (err?.response?.data?.message || err?.message || 'Unable to register attendance device.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEnabled = async (device, enabled) => {
    setError('');
    try {
      await updateAttendanceDevice(device.Device_uuid, { Enabled: enabled });
      setDevices((current) => current.map((item) =>
        item.Device_uuid === device.Device_uuid ? { ...item, Enabled: enabled } : item
      ));
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update attendance device.');
    }
  };

  const handleRotateKey = async (device) => {
    setError('');
    setMessage('');
    setIssuedKey(null);
    try {
      const response = await rotateAttendanceDeviceKey(device.Device_uuid);
      setIssuedKey({
        deviceId: device.Device_uuid,
        serialNumber: device.SerialNumber,
        key: response?.data?.deviceKey,
      });
      setMessage(response?.data?.message || 'Device key rotated.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to rotate device key.');
    }
  };

  const handleSaveMapping = async (user) => {
    setError('');
    setMessage('');
    const employeeId = String(mappingDrafts[user.User_uuid] || '').trim();
    try {
      const response = await updateAttendanceDeviceEmployeeMapping(user.User_uuid, employeeId);
      const updated = response?.data?.result;
      setMappings((current) => current.map((item) =>
        item.User_uuid === user.User_uuid ? { ...item, employeeId: updated?.employeeId || '' } : item
      ));
      setMessage(`${user.User_name} device code saved.`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to save employee device code.');
    }
  };

  return (
    <Paper variant="outlined" sx={{ mt: 2, p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <FingerprintRoundedIcon color="primary" />
              <Typography variant="h6" fontWeight={700}>Attendance Devices</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Biometric, face and RFID terminals use the same employee and attendance records as WhatsApp.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={`${devices.length} devices`} />
            <Chip size="small" label={`${mappedCount} staff mapped`} variant="outlined" />
            <Button startIcon={<RefreshRoundedIcon />} onClick={load} disabled={loading}>Reload</Button>
          </Stack>
        </Stack>

        {message ? <Alert severity="success">{message}</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        {issuedKey?.key ? (
          <Alert severity="warning" icon={<KeyRoundedIcon />}>
            <Typography variant="body2" fontWeight={700}>Save this device key now. It will not be shown again.</Typography>
            <Typography variant="caption" component="div" sx={{ mt: 0.5, wordBreak: 'break-all' }}>
              Device ID: {issuedKey.deviceId} · Serial: {issuedKey.serialNumber}
            </Typography>
            <Box component="code" sx={{ display: 'block', mt: 1, wordBreak: 'break-all' }}>{issuedKey.key}</Box>
          </Alert>
        ) : null}

        <Box>
          <Typography variant="subtitle1" fontWeight={700}>Register device</Typography>
          <Typography variant="caption" color="text.secondary">
            Provider and protocol are configuration values. Vendor punch codes can be mapped through Settings JSON.
          </Typography>
        </Box>

        <Grid container spacing={1.5}>
          <Grid item xs={12} md={4}>
            <TextField fullWidth size="small" label="Device name" value={form.Name}
              onChange={(e) => setForm((prev) => ({ ...prev, Name: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField fullWidth size="small" label="Serial number" value={form.SerialNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, SerialNumber: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField fullWidth size="small" label="Location / branch" value={form.Location}
              onChange={(e) => setForm((prev) => ({ ...prev, Location: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField fullWidth size="small" label="Provider" placeholder="Generic / OEM name" value={form.Provider}
              onChange={(e) => setForm((prev) => ({ ...prev, Provider: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField fullWidth size="small" label="Protocol" placeholder="API / ADMS / Push" value={form.Protocol}
              onChange={(e) => setForm((prev) => ({ ...prev, Protocol: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              label="Settings JSON (optional)"
              placeholder={'{"punchTypeMap":{"0":"In","1":"Out"}}'}
              value={form.Settings}
              onChange={(e) => setForm((prev) => ({ ...prev, Settings: e.target.value }))}
              helperText="Keep vendor-specific punch mappings here instead of hardcoding them in the app."
            />
          </Grid>
        </Grid>
        <Stack direction="row" justifyContent="flex-end">
          <Button
            variant="contained"
            startIcon={<FingerprintRoundedIcon />}
            onClick={handleRegister}
            disabled={saving || !form.Name.trim() || !form.SerialNumber.trim()}
          >
            {saving ? 'Registering…' : 'Register device'}
          </Button>
        </Stack>

        <Divider />

        <Box>
          <Typography variant="subtitle1" fontWeight={700}>Registered devices</Typography>
          <Typography variant="caption" color="text.secondary">
            Each machine has independent credentials and can be disabled without affecting WhatsApp attendance.
          </Typography>
        </Box>

        {loading ? (
          <Typography variant="body2" color="text.secondary">Loading devices…</Typography>
        ) : devices.length === 0 ? (
          <Alert severity="info">No attendance machines are registered yet.</Alert>
        ) : (
          <Grid container spacing={1.5}>
            {devices.map((device) => (
              <Grid item xs={12} md={6} key={device.Device_uuid}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, height: '100%' }}>
                  <Stack spacing={1.25}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                      <Box>
                        <Typography fontWeight={700}>{device.Name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {device.SerialNumber} · {device.Provider || 'Generic'} · {device.Protocol || 'API'}
                        </Typography>
                      </Box>
                      <Chip size="small" color={device.Enabled ? 'success' : 'default'} label={device.Enabled ? 'Enabled' : 'Disabled'} />
                    </Stack>
                    <Typography variant="body2">{device.Location || 'No branch/location set'}</Typography>
                    <Typography variant="caption" color="text.secondary">Last seen: {formatLastSeen(device.LastSeenAt)}</Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1}>
                      <FormControlLabel
                        control={<Switch size="small" checked={device.Enabled !== false} onChange={(e) => handleEnabled(device, e.target.checked)} />}
                        label="Accept punches"
                      />
                      <Button size="small" variant="outlined" startIcon={<KeyRoundedIcon />} onClick={() => handleRotateKey(device)}>
                        Rotate key
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}

        <Divider />

        <Box>
          <Typography variant="subtitle1" fontWeight={700}>Employee machine codes</Typography>
          <Typography variant="caption" color="text.secondary">
            This edits the existing Users.employeeId field. Leave blank for staff who use only WhatsApp/dashboard attendance.
          </Typography>
        </Box>

        <Stack spacing={1}>
          {mappings.map((user) => (
            <Paper key={user.User_uuid} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={700}>{user.User_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{user.User_group || 'No group'}</Typography>
                </Box>
                <TextField
                  size="small"
                  label="Employee code"
                  value={mappingDrafts[user.User_uuid] ?? ''}
                  onChange={(e) => setMappingDrafts((prev) => ({ ...prev, [user.User_uuid]: e.target.value }))}
                  sx={{ minWidth: { sm: 220 } }}
                />
                <Button variant="outlined" onClick={() => handleSaveMapping(user)}>Save</Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
