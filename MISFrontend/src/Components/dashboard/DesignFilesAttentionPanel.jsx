import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import MarkChatUnreadRoundedIcon from '@mui/icons-material/MarkChatUnreadRounded';
import axios from '../../apiClient';
import WhatsAppQuickLogButton from './WhatsAppQuickLogButton';

const SEVERITY_COLOR = { ok: 'default', amber: 'warning', red: 'error' };

function formatDays(d) {
  if (d == null) return '—';
  return d < 1 ? `${Math.round(d * 24)}h` : `${d.toFixed(1)}d`;
}

function ProofStatusChip({ status }) {
  if (!status || status === 'none') return null;
  const map = {
    awaiting_response: { label: 'Awaiting customer reply', color: 'info' },
    changes_requested: { label: 'Changes requested', color: 'warning' },
    approved: { label: 'Proof approved', color: 'success' },
  };
  const cfg = map[status];
  if (!cfg) return null;
  return <Chip size="small" label={cfg.label} color={cfg.color} sx={{ fontSize: 11, height: 20 }} />;
}

function SendProofDialog({ file, onClose, onSent }) {
  const [mobile, setMobile] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!mobile.trim()) { setError('Mobile number is required'); return; }
    setSending(true); setError('');
    try {
      await axios.post('/api/design-files/send-proof', {
        fileId: file.driveFileId,
        fileName: file.fileName,
        orderUuid: file.orderUuid || null,
        orderNumber: file.orderNumber || null,
        customerUuid: file.customerUuid || null,
        customerName: file.customerName || null,
        mobileNumber: mobile.trim(),
        note: note.trim(),
      });
      onSent();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to send proof');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Send proof — {file.fileName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Customer mobile number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            fullWidth
            size="small"
            placeholder="9XXXXXXXXX"
          />
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            size="small"
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={sending} startIcon={sending ? <CircularProgress size={14} /> : <SendRoundedIcon />}>
          Send via WhatsApp
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FileRow({ file, onSendProof, onMarkResponse }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{ py: 0.75, px: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
    >
      <Chip
        size="small"
        label={formatDays(file.daysInStage)}
        color={SEVERITY_COLOR[file.severity] || 'default'}
        sx={{ fontSize: 11, height: 20, minWidth: 44 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap fontWeight={500}>{file.fileName || file.driveFileId}</Typography>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">{file.stageLabel}</Typography>
          {file.orderNumber && <Typography variant="caption" color="text.secondary">· Order #{file.orderNumber}</Typography>}
          {file.assignedToName && <Typography variant="caption" color="text.secondary">· {file.assignedToName}</Typography>}
          <ProofStatusChip status={file.proofStatus} />
        </Stack>
      </Box>
      <Tooltip title="Send design proof to customer">
        <IconButton size="small" onClick={() => onSendProof(file)}>
          <SendRoundedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      {file.proofStatus === 'awaiting_response' && (
        <>
          <Tooltip title="Record customer response">
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
              <MoreHorizRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
            <MenuItem onClick={() => { setMenuAnchor(null); onMarkResponse(file, 'approved'); }}>
              Customer approved
            </MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); onMarkResponse(file, 'changes_requested'); }}>
              Customer requested changes
            </MenuItem>
          </Menu>
        </>
      )}
    </Stack>
  );
}

function EnquiryRow({ enquiry, onReview }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ py: 0.75, px: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}>
      <MarkChatUnreadRoundedIcon sx={{ fontSize: 18, color: 'warning.main', mt: 0.3 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Typography variant="body2" fontWeight={500}>{enquiry.Customer_name} {enquiry.mobileNumber ? `(${enquiry.mobileNumber})` : ''}</Typography>
          <Chip
            size="small"
            label={enquiry.source === 'whatsapp_manual' ? 'Logged — regular number' : 'Auto-detected — API number'}
            sx={{ fontSize: 10, height: 16 }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>{enquiry.Remark}</Typography>
      </Box>
      <Stack direction="row" spacing={0.5}>
        <Button size="small" onClick={() => onReview(enquiry, 'converted')}>Convert</Button>
        <Button size="small" color="inherit" onClick={() => onReview(enquiry, 'dismissed')}>Dismiss</Button>
      </Stack>
    </Stack>
  );
}

export default function DesignFilesAttentionPanel() {
  const [files, setFiles] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pendingRes, enquiryRes] = await Promise.all([
        axios.get('/api/design-files/pending'),
        axios.get('/api/enquiry/unreviewed').catch(() => ({ data: { enquiries: [] } })),
      ]);
      setFiles(pendingRes.data?.files || []);
      setEnquiries(enquiryRes.data?.enquiries || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load attention items.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkResponse = async (file, outcome) => {
    try {
      await axios.post('/api/design-files/proof-response', { fileId: file.driveFileId, outcome });
      setToast({ message: 'Response recorded', severity: 'success' });
      load();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || err.message || 'Failed to record response', severity: 'error' });
    }
  };

  const handleReviewEnquiry = async (enquiry, status) => {
    try {
      await axios.put(`/api/enquiry/${enquiry._id}/review`, { status });
      setEnquiries((prev) => prev.filter((e) => e._id !== enquiry._id));
    } catch (err) {
      setToast({ message: err?.response?.data?.message || err.message || 'Failed to update enquiry', severity: 'error' });
    }
  };

  return (
    <Box sx={{ px: 1.5, py: 1 }}>
      {loading && <CircularProgress size={20} />}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <WarningAmberRoundedIcon sx={{ fontSize: 18 }} color="warning" />
        <Typography variant="subtitle2" fontWeight={700}>Not yet finalized ({files.length})</Typography>
      </Stack>
      {!loading && files.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>Nothing stuck right now.</Typography>
      )}
      <Stack divider={<Divider />} sx={{ mb: 2 }}>
        {files.map((f) => (
          <FileRow key={f.driveFileId} file={f} onSendProof={setProofFile} onMarkResponse={handleMarkResponse} />
        ))}
      </Stack>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <MarkChatUnreadRoundedIcon sx={{ fontSize: 18 }} color="warning" />
          <Typography variant="subtitle2" fontWeight={700}>New WhatsApp messages needing review ({enquiries.length})</Typography>
        </Stack>
        <WhatsAppQuickLogButton onLogged={load} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Auto-detected from the API number, plus anything staff log manually from the regular WhatsApp Business number.
      </Typography>
      {!loading && enquiries.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>None pending.</Typography>
      )}
      <Stack divider={<Divider />}>
        {enquiries.map((e) => (
          <EnquiryRow key={e._id} enquiry={e} onReview={handleReviewEnquiry} />
        ))}
      </Stack>

      {proofFile && (
        <SendProofDialog
          file={proofFile}
          onClose={() => setProofFile(null)}
          onSent={() => { setProofFile(null); setToast({ message: 'Proof sent', severity: 'success' }); load(); }}
        />
      )}

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast && <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert>}
      </Snackbar>
    </Box>
  );
}
