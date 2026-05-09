import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Divider, IconButton, LinearProgress,
  ListSubheader, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AttachFileRoundedIcon  from '@mui/icons-material/AttachFileRounded';
import CloseRoundedIcon       from '@mui/icons-material/CloseRounded';
import SendRoundedIcon        from '@mui/icons-material/SendRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import toast from 'react-hot-toast';
import { sendEmail } from '../services/gmailService';
import { fetchVendorMasters } from '../services/vendorService';
import { fetchCustomers } from '../services/customerService';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

const LARGE_MB  = 24;
const MAX_FILES = 20;

function parseFilename(name) {
  const nameOnly = name.replace(/\.[^.]+$/, '').trim();
  const parts    = nameOnly.split(/\s*-\s*/);
  if (parts.length < 3) return null;
  const sizeQty = parts[1].trim();
  if (!sizeQty.includes('=')) return null;
  const eqIdx = sizeQty.lastIndexOf('=');
  const qty   = parseInt(sizeQty.slice(eqIdx + 1), 10);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return {
    customer: parts[0].trim(),
    size:     sizeQty.slice(0, eqIdx).trim(),
    qty,
    item:     parts.slice(2).join(' - ').trim(),
  };
}

export default function EmailCompose() {
  const [vendors, setVendors]                 = useState([]);
  const [customerVendors, setCustomerVendors] = useState([]);
  const [files, setFiles]                     = useState([]);
  const [sending, setSending]                 = useState(false);
  const [progress, setProgress]               = useState(0);
  const [result, setResult]                   = useState(null);
  const [form, setForm] = useState({ recipientKey: '', vendorUuid: '', toEmail: '', subject: '', bodyText: '' });
  const fileInputRef = useRef();
  const navigate     = useNavigate();

  const load = useCallback(async () => {
    try {
      const [vendorRows, customerRes] = await Promise.all([
        fetchVendorMasters(),
        fetchCustomers(),
      ]);
      setVendors(Array.isArray(vendorRows) ? vendorRows : []);
      const allCustomers = customerRes?.data?.result || [];
      setCustomerVendors(
        allCustomers.filter((c) => Array.isArray(c.PartyRoles) && c.PartyRoles.includes('vendor'))
      );
    } catch {
      toast.error('Failed to load recipients');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRecipientChange = (key) => {
    let email = '';
    let uuid  = '';
    if (key.startsWith('v_')) {
      const vendor = vendors.find((v) => v.Vendor_uuid === key.slice(2));
      email = vendor?.Email || '';
      uuid  = vendor?.Vendor_uuid || '';
    } else if (key.startsWith('c_')) {
      const cust = customerVendors.find((c) => c.Customer_uuid === key.slice(2));
      email = cust?.Email || '';
      uuid  = cust?.Customer_uuid || '';
    }
    setForm((p) => ({ ...p, recipientKey: key, vendorUuid: uuid, toEmail: email || p.toEmail }));
  };

  const handleFiles = (incoming) => {
    setFiles((prev) => {
      const next = [...prev];
      for (const f of incoming) {
        if (next.length >= MAX_FILES) break;
        if (!next.find((x) => x.name === f.name && x.size === f.size)) next.push(f);
      }
      return next;
    });
  };

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleSend = async () => {
    if (!form.toEmail || !form.subject) {
      toast.error('Recipient email and subject are required');
      return;
    }

    setSending(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('toEmail',    form.toEmail);
      fd.append('vendorUuid', form.vendorUuid);
      fd.append('subject',    form.subject);
      fd.append('bodyText',   form.bodyText);
      files.forEach((f) => fd.append('files', f));

      const res = await sendEmail(fd, setProgress);
      setResult(res);
      toast.success(res.message || 'Email sent!');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Send failed');
    } finally {
      setSending(false);
      setProgress(0);
    }
  };

  const reset = () => {
    setResult(null);
    setFiles([]);
    setForm({ recipientKey: '', vendorUuid: '', toEmail: '', subject: '', bodyText: '' });
  };

  // ── Success screen ──────────────────────────────────────────────────────────
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
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {result.autoPoNote}
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

  const parsed       = files.map((f) => ({ name: f.name, info: parseFilename(f.name) }));
  const largeMbFiles = files.filter((f) => f.size >= LARGE_MB * 1024 * 1024);

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 700 }}>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>Send Email to Vendor</Typography>

      <Stack spacing={2}>
        {/* Recipient selector — Vendor accounts + Customer-Vendors */}
        <TextField
          select label="Select Recipient *" size="small"
          value={form.recipientKey}
          onChange={(e) => handleRecipientChange(e.target.value)}
          fullWidth
          helperText="Email auto-fills if saved on the vendor/customer record"
          SelectProps={{ MenuProps: { PaperProps: { style: { maxHeight: 360 } } } }}
        >
          <MenuItem value="">— Select recipient —</MenuItem>

          {vendors.length > 0 && (
            <ListSubheader disableSticky sx={{ lineHeight: '28px', fontWeight: 700, fontSize: 11 }}>
              VENDOR ACCOUNTS
            </ListSubheader>
          )}
          {vendors.map((v) => (
            <MenuItem key={`v_${v.Vendor_uuid}`} value={`v_${v.Vendor_uuid}`}>
              {v.Vendor_name}{v.Email ? ` — ${v.Email}` : ''}
            </MenuItem>
          ))}

          {customerVendors.length > 0 && (
            <ListSubheader disableSticky sx={{ lineHeight: '28px', fontWeight: 700, fontSize: 11 }}>
              CUSTOMER VENDORS
            </ListSubheader>
          )}
          {customerVendors.map((c) => (
            <MenuItem key={`c_${c.Customer_uuid}`} value={`c_${c.Customer_uuid}`}>
              {c.Customer_name}{c.Email ? ` — ${c.Email}` : ''}
            </MenuItem>
          ))}
        </TextField>

        {/* Recipient email — auto-filled from selection, editable */}
        <TextField
          label="Recipient Email *" size="small" type="email"
          value={form.toEmail}
          onChange={(e) => setForm((p) => ({ ...p, toEmail: e.target.value }))}
          fullWidth
        />

        <TextField
          label="Subject *" size="small"
          value={form.subject}
          onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
          fullWidth
        />

        <TextField
          label="Message body" multiline minRows={4}
          value={form.bodyText}
          onChange={(e) => setForm((p) => ({ ...p, bodyText: e.target.value }))}
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
            Attach Design Files
          </Button>
          {largeMbFiles.length > 0 && (
            <Typography variant="caption" color="info.main" sx={{ ml: 1 }}>
              {largeMbFiles.length} file{largeMbFiles.length > 1 ? 's' : ''} over 24 MB — will be sent via Google Drive link
            </Typography>
          )}
        </Box>

        {/* File list */}
        {files.length > 0 && (
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Typography variant="caption" fontWeight={700} sx={{ mb: 0.5, display: 'block' }}>
              Attachments ({files.length})
            </Typography>
            <Stack spacing={0.6}>
              {files.map((f, idx) => {
                const isLarge = f.size >= LARGE_MB * 1024 * 1024;
                const info    = parseFilename(f.name);
                return (
                  <Stack key={idx} direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" noWrap sx={{ display: 'block' }}>{f.name}</Typography>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.3 }}>
                        <Chip size="small" label={`${(f.size / 1024 / 1024).toFixed(1)} MB`} />
                        {isLarge && <Chip size="small" color="info" label="→ Drive link" />}
                        {info
                          ? <Chip size="small" color="success" label={`${info.customer} | ${info.size} ×${info.qty} | ${info.item}`} />
                          : <Chip size="small" color="warning" label="Suspense PO item" />
                        }
                      </Stack>
                    </Box>
                    <IconButton size="small" onClick={() => removeFile(idx)} sx={{ mt: 0.5 }}>
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
          </Paper>
        )}

        {/* Auto-PO preview */}
        {form.vendorUuid && (
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: 'primary.light' }}>
            <Typography variant="caption" fontWeight={700} color="primary.dark">
              Purchase Order preview (auto-created on send)
            </Typography>
            {files.length === 0 && (
              <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 1 }}>
                • Suspense — qty 1 — ₹1 placeholder
              </Typography>
            )}
            {parsed.map((p, i) => (
              <Typography key={i} variant="caption" display="block" color="text.secondary" sx={{ ml: 1 }}>
                {p.info
                  ? `• ${p.info.item} (${p.info.size}) × ${p.info.qty} — for ${p.info.customer} — ₹1 placeholder`
                  : `• Suspense (${p.name}) — qty 1 — ₹1 placeholder`
                }
              </Typography>
            ))}
            <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
              Admin must update actual pricing in Purchase Orders.
            </Typography>
          </Paper>
        )}

        {/* Upload progress bar */}
        {sending && (
          <Box>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {progress < 100 ? 'Uploading files...' : 'Processing on server...'}
              </Typography>
              <Typography variant="caption" color="text.secondary">{progress}%</Typography>
            </Stack>
            <LinearProgress variant={progress < 100 ? 'determinate' : 'indeterminate'} value={progress} />
          </Box>
        )}

        <Divider />

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
            onClick={handleSend}
            disabled={sending}
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
