import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  Grid,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import {
  fetchWhatsAppAttendanceSettings,
  saveWhatsAppAttendanceSettings,
} from '../../services/vendorService';

const emptyCommand = () => ({
  key: '',
  label: '',
  aliases: '',
  attendanceType: '',
  nextAllowed: '',
  successMessage: '',
  duplicateMessage: '',
  invalidMessage: '',
  enabled: true,
});

const normalizeForUi = (config) => ({
  enabled: config?.enabled !== false,
  markUnknownNumbers: Boolean(config?.markUnknownNumbers),
  unknownNumberReply: config?.unknownNumberReply || '',
  duplicateReply: config?.duplicateReply || '',
  invalidTransitionReply: config?.invalidTransitionReply || '',
  commands: Array.isArray(config?.commands)
    ? config.commands.map((command) => ({
        ...command,
        aliases: Array.isArray(command.aliases) ? command.aliases.join(', ') : '',
        nextAllowed: Array.isArray(command.nextAllowed) ? command.nextAllowed.join(', ') : '',
      }))
    : [],
});

const denormalizeForApi = (form) => ({
  ...form,
  commands: (form.commands || []).map((command) => ({
    ...command,
    aliases: String(command.aliases || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    nextAllowed: String(command.nextAllowed || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  })),
});

export default function WhatsAppAttendanceSettings() {
  const [form, setForm] = useState(normalizeForUi({ commands: [] }));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const config = await fetchWhatsAppAttendanceSettings();
      setForm(normalizeForUi(config));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load WhatsApp attendance settings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const commandPreview = useMemo(
    () =>
      (form.commands || [])
        .filter((command) => command.enabled)
        .map((command) => `${command.label || command.key}: ${command.aliases}`)
        .join(' • '),
    [form.commands]
  );

  const updateCommand = (index, patch) => {
    setForm((prev) => ({
      ...prev,
      commands: prev.commands.map((command, currentIndex) =>
        currentIndex === index ? { ...command, ...patch } : command
      ),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await saveWhatsAppAttendanceSettings(denormalizeForApi(form));
      setForm(normalizeForUi(saved));
      setMessage('WhatsApp attendance settings saved successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            WhatsApp attendance automation
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure all command words from database. Nothing is hardcoded after this setup.
          </Typography>
        </Box>

        {message ? <Alert severity="success">{message}</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <FormControlLabel
            control={<Switch checked={form.enabled} onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))} />}
            label="Enable WhatsApp attendance"
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.markUnknownNumbers}
                onChange={(e) => setForm((prev) => ({ ...prev, markUnknownNumbers: e.target.checked }))}
              />
            }
            label="Reply to unknown numbers"
          />
        </Stack>

        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Unknown number reply"
              value={form.unknownNumberReply}
              onChange={(e) => setForm((prev) => ({ ...prev, unknownNumberReply: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Duplicate action reply"
              value={form.duplicateReply}
              onChange={(e) => setForm((prev) => ({ ...prev, duplicateReply: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Invalid transition reply"
              value={form.invalidTransitionReply}
              onChange={(e) => setForm((prev) => ({ ...prev, invalidTransitionReply: e.target.value }))}
            />
          </Grid>
        </Grid>

        <Divider />

        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Command mapping
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Active commands: {commandPreview || 'No commands configured yet'}
            </Typography>
          </Box>
          <Button
            startIcon={<AddRoundedIcon />}
            onClick={() => setForm((prev) => ({ ...prev, commands: [...prev.commands, emptyCommand()] }))}
          >
            Add command
          </Button>
        </Stack>

        <Stack spacing={2}>
          {(form.commands || []).map((command, index) => (
            <Paper key={`${command.key || 'command'}-${index}`} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
                  <TextField
                    label="Key"
                    value={command.key}
                    onChange={(e) => updateCommand(index, { key: e.target.value })}
                    sx={{ minWidth: 140 }}
                  />
                  <TextField
                    label="Label"
                    value={command.label}
                    onChange={(e) => updateCommand(index, { label: e.target.value })}
                    sx={{ minWidth: 180 }}
                  />
                  <TextField
                    label="Attendance type"
                    value={command.attendanceType}
                    onChange={(e) => updateCommand(index, { attendanceType: e.target.value })}
                    sx={{ minWidth: 180 }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={command.enabled}
                        onChange={(e) => updateCommand(index, { enabled: e.target.checked })}
                      />
                    }
                    label="Enabled"
                  />
                  <Button
                    color="error"
                    startIcon={<DeleteOutlineRoundedIcon />}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        commands: prev.commands.filter((_, currentIndex) => currentIndex !== index),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </Stack>

                <Grid container spacing={1.5}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Aliases"
                      helperText="Comma separated. Example: hi, start"
                      value={command.aliases}
                      onChange={(e) => updateCommand(index, { aliases: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Next allowed attendance types"
                      helperText="Comma separated. Example: Lunch Out, Out"
                      value={command.nextAllowed}
                      onChange={(e) => updateCommand(index, { nextAllowed: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Success message"
                      value={command.successMessage}
                      onChange={(e) => updateCommand(index, { successMessage: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Duplicate message"
                      value={command.duplicateMessage}
                      onChange={(e) => updateCommand(index, { duplicateMessage: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Invalid message"
                      value={command.invalidMessage}
                      onChange={(e) => updateCommand(index, { invalidMessage: e.target.value })}
                    />
                  </Grid>
                </Grid>
              </Stack>
            </Paper>
          ))}
        </Stack>

        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={load} disabled={isLoading || isSaving}>
            Reload
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving ? 'Saving...' : 'Save settings'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
