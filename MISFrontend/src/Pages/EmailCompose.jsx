import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Divider, IconButton, MenuItem,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AttachFileRoundedIcon    from '@mui/icons-material/AttachFileRounded';
import CloseRoundedIcon         from '@mui/icons-material/CloseRounded';
import SendRoundedIcon          from '@mui/icons-material/SendRounded';
import CheckCircleRoundedIcon   from '@mui/icons-material/CheckCircleRounded';
import ReceiptLongRoundedIcon   from '@mui/icons-material/ReceiptLongRounded';
import toast from 'react-hot-toast';
import axios from '../apiClient';
import { sendEmail, getGmailAccounts } from '../services/gmailService';
import { fetchVendorMasters } from '../services/vendorService';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

const LARGE_MB    = 24;
const MAX_FILES   = 20;

function parseFilename(name) {
  const nameOnly = name.replace(/\.[^.]+$/, '').trim();
  const parts    = nameOnly.split(/\s*-\s*/);
  if (parts.length < 3) return null;
  const sizeQty  = parts[1].trim();
  if (!sizeQty.includes('=')) return null;
  const eqIdx    = sizeQty.lastIndexOf('=');
  const qty      = parseInt(sizeQty.slice(eqIdx + 1), 10);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return {
    customer: parts[0].trim(),
    size:     sizeQty.slice(0, eqIdx).trim(),
    qty,
    item:     parts.slice(2).join(' - ').trim(),
  };
}

export default function EmailCompose() {
  const [vendors, setVendors]       = useState([]);
  const [accounts, setAccounts]     = useState([]);
  const [files, setFiles]           = useState([]);
  const [sending, setSending]       = useState(false);
  const [result, setResult]         = useState(null);
  const [form, setForm]             = useState({
    toEmail: '', toName: '', vendorUuid: '', gmailAccountId: '', subject: '', bodyText: '',
  });
  const fileInputRef = useRef();
  const navigate     = useNavigate();

  const load = useCallback(async () => {
    try {
      const [vendorRows, accRes] = await Promise.all([fetchVendorMasters(), getGmailAccounts()]);
      setVendors(Array.isArray(vendorRows) ? vendorRows : []);
      setAccounts(Array.isArray(accRes?.result) ? accRes.result.filter((a) => a.isActive && a.isConnected) : []);
    } catch {
      toast.error('Failed to load data');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleVendorChange = (vendorUuid) => {
    const vendor = vendors.find((v) => v.Vendor_uuid === vendorUuid);
    setForm((p) => ({
      ...p,
      vendorUuid,
      toEmail: vendor?.Email || p.toEmail,
      toName:  vendor?.Vendor_name || p.toName,
    }));
  };

  const handleFiles = (incoming) => {
    const next = [...files];
    for (const f of incoming) {
      if (next.length >= MAX_FILES) break;
      if (!next.find((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
  };

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleSend = async () => {
    if (!form.toEmail || !form.subject) {
      toast.error('Recipient email and subject are required');
      return;
    }
    if (accounts.length === 0) {
      toast.error('No Gmail account connected. Go to Gmail Accounts to add one.');
      return;
    }

    setSending(true);
    try {
      const fd = new FormData();
      fd.append('toEmail',        form.toEmail);
      fd.append('toName',         form.toName);
      fd.append('vendorUuid',     form.vendorUuid);
      fd.append('subject',        form.subject);
      fd.append('bodyText',       form.bodyText);
      fd.append('gmailAccountId', form.gmailAccountId);
      files.forEach((f) => fd.append('files', f));

      const res = await sendEmail(fd);
      setResult(res);
      toast.success(res.message || 'Email sent!');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setResult(null);
    setFiles([]);
    setForm({ toEmail: '', toName: '', vendorUuid: '', gmailAccountId: '', subject: '', bodyText: '' });
  };

  // Success screen
  if (result) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600 }}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}>
          <CheckCircleRoundedIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
          <Typography variant="h5" fontWeight={900} gutterBottom>Email Sent!</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{result.message}</Typography>

          {result.poCreated && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2, bgcolor: 'warning.50', borderColor: 'warning.main' }}>
              <Stack direction="row" alignItems="center" spacing={1} justifyContent="center">
                <ReceiptLongRoundedIcon color="warning" />
                <Typography fontWeight={700} color="warning.dark">
                  Draft PO #{result.poNumber} auto-created
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Pricing is set to ₹1 (placeholder). Admin must update actual amount.
              </Typography>
            </Paper>
          )}

          <Stack direction="row" spacing={1} justifyContent="center">
            <Button variant="outlined" onClick={reset}>Compose Another</Button>
            <Button variant="contained" onClick={() => navigate(ROUTES.EMAIL_HISTORY)}>View History</Button>
            {result.poCreated && (
              <Button variant="outlined" color="warning" onClick={() => navigate(ROUTES.PURCHASE_ORDERS)}>
                Update PO
              </Button>
            )}
          </Stack>
        </Paper>
      </Box>
    );
  }

  const largeMbFiles = files.filter((f) => f.size >= LARGE_MB * 1024 * 1024);
  const parsed       = files.map((f) => ({ name: f.name, info: parseFilename(f.name) }));
  const allParsed    = parsed.every((p) => p.info !== null);

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 700 }}>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>Send Email to Vendor</Typography>

      {accounts.length === 0 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2, borderColor: 'error.main', bgcolor: 'error.50' }}>
          <Typography color="error" fontWeight={700}>No Gmail account connected.</Typography>
          <Button size="small" sx={{ mt: 0.5 }} onClick={() => navigate(ROUTES.GMAIL_ACCOUNTS)}>
            Go to Gmail Accounts →
          </Button>
        </Paper>
      )}

      <Stack spacing={2}>
        {/* Vendor selector */}
        <TextField
          select label="Vendor (optional — auto-fills email)" size="small"
          value={form.vendorUuid}
          onChange={(e) => handleVendorChange(e.target.value)}
          fullWidth
        >
          <MenuItem value="">— Select vendor —</MenuItem>
          {vendors.map((v) => (
            <MenuItem key={v.Vendor_uuid} value={v.Vendor_uuid}>{v.Vendor_name}</MenuItem>
          ))}
        </TextField>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            label="Recipient Email *" size="small" type="email"
            value={form.toEmail} onChange={(e) => setForm((p) => ({ ...p, toEmail: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Recipient Name" size="small"
            value={form.toName} onChange={(e) => setForm((p) => ({ ...p, toName: e.target.value }))}
            fullWidth
          />
        </Stack>

        <TextField
          select label="Send from (Gmail account)" size="small"
          value={form.gmailAccountId}
          onChange={(e) => setForm((p) => ({ ...p, gmailAccountId: e.target.value }))}
          fullWidth
          helperText="Leave blank to auto-select the account with available quota"
        >
          <MenuItem value="">Auto-select</MenuItem>
          {accounts.map((a) => (
            <MenuItem key={a.accountId} value={a.accountId}>
              {a.email} ({a.dailySentCount}/{a.dailyLimit} sent today)
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Subject *" size="small"
          value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
          fullWidth
        />

        <TextField
          label="Message body" multiline minRows={4}
          value={form.bodyText} onChange={(e) => setForm((p) => ({ ...p, bodyText: e.target.value }))}
          fullWidth
          placeholder="Write your message here. Download links for large files will be appended automatically."
        />

        {/* File picker */}
        <Box>
          <input
            ref={fileInputRef} type="file" multiple hidden
            onChange={(e) => { handleFiles(Array.from(e.target.files)); e.target.value = ''; }}
          />
          <Button
            variant="outlined" startIcon={<AttachFileRoundedIcon />} size="small"
            onClick={() => fileInputRef.current?.click()}
          >
            Attach Files
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            Files ≥{LARGE_MB}MB will be uploaded to Google Drive and a download link sent.
          </Typography>
        </Box>

        {/* File list */}
        {files.length > 0 && (
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Typography variant="caption" fontWeight={700} sx={{ mb: 0.5, display: 'block' }}>
              Attachments ({files.length})
            </Typography>
            <Stack spacing={0.5}>
              {files.map((f, idx) => {
                const isLarge = f.size >= LARGE_MB * 1024 * 1024;
                const info    = parseFilename(f.name);
                return (
                  <Stack key={idx} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" noWrap sx={{ display: 'block' }}>{f.name}</Typography>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        <Chip size="small" label={`${(f.size / 1024 / 1024).toFixed(1)} MB`} />
                        {isLarge && <Chip size="small" color="warning" label="→ Drive link" />}
                        {info
                          ? <Chip size="small" color="success" label={`${info.customer} | ${info.size} | ×${info.qty} | ${info.item}`} />
                          : <Chip size="small" color="default" label="filename not parseable" />
                        }
                      </Stack>
                    </Box>
                    <IconButton size="small" onClick={() => removeFile(idx)}>
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
          </Paper>
        )}

        {/* Auto-PO preview */}
        {form.vendorUuid && files.length > 0 && (
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: allParsed ? 'success.main' : 'warning.main' }}>
            <Typography variant="caption" fontWeight={700} color={allParsed ? 'success.dark' : 'warning.dark'}>
              {allParsed
                ? '✓ All filenames parsed — Draft PO will be auto-created on send'
                : '⚠ Some filenames could not be parsed — only parsed files will be added to auto-PO'}
            </Typography>
            {parsed.filter((p) => p.info).map((p, i) => (
              <Typography key={i} variant="caption" display="block" color="text.secondary" sx={{ ml: 1 }}>
                • {p.info.item} ({p.info.size}) × {p.info.qty} — for {p.info.customer}
              </Typography>
            ))}
            {parsed.filter((p) => !p.info).map((p, i) => (
              <Typography key={i} variant="caption" display="block" color="error" sx={{ ml: 1 }}>
                ✗ {p.name} — expected format: "Customer - Size=Qty - Item"
              </Typography>
            ))}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              PO will use ₹1 as placeholder pricing. Admin updates actual amount later.
            </Typography>
          </Paper>
        )}

        <Divider />

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained" startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
            onClick={handleSend} disabled={sending || accounts.length === 0}
            sx={{ minWidth: 140 }}
          >
            {sending ? 'Sending...' : 'Send Email'}
          </Button>
          <Button variant="outlined" onClick={() => navigate(ROUTES.EMAIL_HISTORY)}>
            View History
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
