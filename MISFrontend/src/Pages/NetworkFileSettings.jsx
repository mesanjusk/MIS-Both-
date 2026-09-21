import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ComputerRoundedIcon from '@mui/icons-material/ComputerRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import toast from 'react-hot-toast';

import axios from '../apiClient';
import {
  copyPathToClipboard,
  launchMisFileUrl,
  normalizeWindowsPath,
} from '../utils/localFileLauncher';

const WINDOWS_OPENER_URL =
  'https://raw.githubusercontent.com/mesanjusk/MIS-Both-/main/tools/windows/Install-MISLocalFileOpener.ps1';

const INSTALL_COMMANDS = [
  {
    title: '1. Download the opener',
    command:
      'Invoke-WebRequest -Uri "https://raw.githubusercontent.com/mesanjusk/MIS-Both-/main/tools/windows/Install-MISLocalFileOpener.ps1" -OutFile "$HOME\\Downloads\\Install-MISLocalFileOpener.ps1"',
  },
  {
    title: '2. Confirm the file exists',
    command: 'Test-Path "$HOME\\Downloads\\Install-MISLocalFileOpener.ps1"',
    hint: 'This should return True.',
  },
  {
    title: '3. Unblock the downloaded script',
    command: 'Unblock-File "$HOME\\Downloads\\Install-MISLocalFileOpener.ps1"',
  },
  {
    title: '4. Install it',
    command:
      'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$HOME\\Downloads\\Install-MISLocalFileOpener.ps1"',
    hint: 'Install this once on every Windows PC that will use the Bills file/folder buttons.',
  },
];

const EMPTY = {
  serverLocalPath: '',
  networkShareRoot: '',
  driveAnchorFolderName: '',
  note: '',
};

export default function NetworkFileSettings() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    axios.get('/api/network-files/settings')
      .then((res) => {
        if (!alive) return;
        setForm({ ...EMPTY, ...(res.data?.result || {}) });
      })
      .catch((err) => {
        if (!alive) return;
        toast.error(err?.response?.data?.message || 'Could not load network file settings.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, []);

  const normalizedShare = useMemo(
    () => normalizeWindowsPath(form.networkShareRoot),
    [form.networkShareRoot]
  );

  const update = (key) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        serverLocalPath: normalizeWindowsPath(form.serverLocalPath),
        networkShareRoot: normalizeWindowsPath(form.networkShareRoot),
        driveAnchorFolderName: String(form.driveAnchorFolderName || '').trim(),
        note: String(form.note || '').trim(),
      };
      const res = await axios.put('/api/network-files/settings', payload);
      const next = { ...EMPTY, ...(res.data?.result || payload) };
      setForm(next);
      window.dispatchEvent(new CustomEvent('network-file-settings-updated', { detail: next }));
      toast.success('Network file settings saved.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save network file settings.');
    } finally {
      setSaving(false);
    }
  };

  const copyShare = async () => {
    if (!normalizedShare) {
      toast.error('Save the network share path first.');
      return;
    }
    const copied = await copyPathToClipboard(normalizedShare);
    toast[copied ? 'success' : 'error'](copied ? 'Network path copied.' : 'Could not copy the path.');
  };

  const copyCommand = async (command) => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success('Command copied.');
    } catch {
      toast.error('Could not copy command.');
    }
  };

  const downloadWindowsOpener = async () => {
    try {
      const response = await fetch(WINDOWS_OPENER_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const scriptText = await response.text();
      const blob = new Blob([scriptText], { type: 'text/plain;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'Install-MISLocalFileOpener.ps1';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success('Windows opener downloaded to your browser downloads.');
    } catch (err) {
      toast.error('Automatic download failed. Use the PowerShell download command shown below.');
    }
  };

  const testOpen = async () => {
    if (!normalizedShare) {
      toast.error('Save the network share path first.');
      return;
    }
    await copyPathToClipboard(normalizedShare);
    launchMisFileUrl(normalizedShare);
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: 980, mx: 'auto' }}>
      <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 1.5, md: 2.5 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
          <ComputerRoundedIcon color="primary" />
          <Box>
            <Typography variant="h5" fontWeight={900}>Network File Settings</Typography>
            <Typography variant="body2" color="text.secondary">
              Central folder used by the Bills file/folder buttons on every PC.
            </Typography>
          </Box>
        </Stack>

        <Alert severity="info" sx={{ mb: 2 }}>
          Your Wi-Fi name <strong>skmain</strong> is only the network/SSID. Do not enter it as the server.
          Use the Windows computer name (preferred) or the active LAN IPv4 address of the PC that stores the shared folder.
        </Alert>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Stack spacing={2}>
            <TextField
              label="Server local folder"
              value={form.serverLocalPath}
              onChange={update('serverLocalPath')}
              placeholder="E:\Daily Work\1 Month"
              helperText="Folder as it exists on the server PC. This is stored for reference; LAN PCs use the UNC path below."
              fullWidth
            />

            <TextField
              label="Network shared folder (UNC path)"
              value={form.networkShareRoot}
              onChange={update('networkShareRoot')}
              placeholder="\\SERVER-PC\DailyWork\1 Month"
              helperText="This is the actual path Bills will open. Prefer the server computer name instead of an IP so DHCP/IP changes do not break it."
              fullWidth
            />

            <TextField
              label="Google Drive anchor folder"
              value={form.driveAnchorFolderName}
              onChange={update('driveAnchorFolderName')}
              placeholder="1 Month"
              helperText="Set this to the Drive folder that corresponds to the UNC root. For your current setup, use 1 Month."
              fullWidth
            />

            <TextField
              label="Note (optional)"
              value={form.note}
              onChange={update('note')}
              placeholder="Example: Daily Work is shared from the SKMAIN office PC"
              minRows={2}
              multiline
              fullWidth
            />

            <Divider />

            <Alert severity="warning">
              Windows sharing still has to be enabled on the server folder. A local path such as
              <strong> E:\Daily Work\1 Month</strong> does not automatically become
              <strong> \\SERVER-PC\DailyWork\1 Month</strong>; the parent folder must first be shared in Windows with that share name.
            </Alert>

            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={800}>What to send/check on the server PC</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Open Command Prompt and run <strong>hostname</strong>. That computer name is preferred.
                If you want to use an IP, run <strong>ipconfig</strong> and use the IPv4 address under the active
                Wi-Fi adapter connected to skmain — normally 192.168.x.x or 10.x.x.x, not 169.254.x.x.
              </Typography>
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />}
                onClick={save}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Settings'}
              </Button>
              <Button variant="outlined" startIcon={<ContentCopyRoundedIcon />} onClick={copyShare}>
                Copy Network Path
              </Button>
              <Button variant="outlined" startIcon={<FolderOpenRoundedIcon />} onClick={testOpen}>
                Test Open Folder
              </Button>
              <Button
                variant="text"
                startIcon={<DownloadRoundedIcon />}
                onClick={downloadWindowsOpener}
              >
                Download Windows Opener (.ps1)
              </Button>
            </Stack>

            <Paper variant="outlined" sx={{ p: { xs: 1.25, md: 1.75 }, borderRadius: 2.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <TerminalRoundedIcon color="primary" fontSize="small" />
                <Box>
                  <Typography variant="subtitle1" fontWeight={900}>Windows Opener — one-time installation</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Do this once on each Windows PC that will open Bills files. Open Windows PowerShell and run these commands one by one.
                  </Typography>
                </Box>
              </Stack>

              <Stack spacing={1}>
                {INSTALL_COMMANDS.map((step) => (
                  <Box key={step.title}>
                    <Typography variant="body2" fontWeight={800} sx={{ mb: 0.45 }}>{step.title}</Typography>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={0.75}
                      alignItems={{ xs: 'stretch', sm: 'center' }}
                    >
                      <Box
                        component="code"
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          p: 1,
                          borderRadius: 1.5,
                          bgcolor: 'action.hover',
                          border: '1px solid',
                          borderColor: 'divider',
                          fontSize: '0.76rem',
                          overflowX: 'auto',
                          whiteSpace: 'pre',
                        }}
                      >
                        {step.command}
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopyRoundedIcon />}
                        onClick={() => copyCommand(step.command)}
                        sx={{ flexShrink: 0 }}
                      >
                        Copy
                      </Button>
                    </Stack>
                    {step.hint ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>
                        {step.hint}
                      </Typography>
                    ) : null}
                  </Box>
                ))}
              </Stack>

              <Alert severity="success" sx={{ mt: 1.5 }}>
                After installation, click <strong>Test Open Folder</strong>. Chrome/Edge may ask whether to open
                <strong> MIS Local File Opener</strong>; choose <strong>Open</strong>. Then test a file/folder button in Bills Report.
              </Alert>
            </Paper>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
