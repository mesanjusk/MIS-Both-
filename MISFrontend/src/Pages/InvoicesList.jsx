import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, IconButton,
  InputAdornment, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import axios from '../apiClient.js';
import { toast } from '../Components/Toast';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

function buildWhatsAppText(inv) {
  const lines = [
    `🧾 *INVOICE #${inv.orderNumber || '—'}*`,
    `📅 Date: ${inv.dateStr || ''}`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `🏪 *${inv.storeName || ''}*`,
    (inv.addressLines || []).filter(Boolean).join(', '),
    inv.phone ? `📞 ${inv.phone}` : '',
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 *Bill To:* ${inv.partyName || '—'}`,
    `📦 *Items:*`,
    ...(inv.items || []).map(
      (i) => `  • ${i.Item}${i.Remark ? ` (${i.Remark})` : ''} × ${i.Quantity} @ ₹${fmt(i.Rate)} = *₹${fmt(i.Amount)}*`
    ),
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 *Grand Total: ₹${fmt(inv.grandTotal)}*`,
    inv.upiId ? `💳 *Pay via UPI:* ${inv.upiId}` : '',
    `🔗 *View Invoice:* ${window.location.origin}/invoice/${inv.shareToken}`,
    ``,
    `_Thank you for your business!_ 🙏`,
  ].filter((l) => l !== undefined && l !== null);
  return lines.join('\n');
}

export default function InvoicesList() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [preview, setPreview] = useState(null);
  const LIMIT = 50;

  const load = useCallback(async (q = search, pg = page) => {
    setLoading(true);
    try {
      const res = await axios.get('/api/public-invoices', {
        params: { search: q, page: pg, limit: LIMIT },
      });
      if (res.data?.success) {
        setInvoices(res.data.result || []);
        setTotal(res.data.total || 0);
      }
    } catch {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load('', 1); }, [load]);

  const handleSearch = (e) => {
    const v = e.target.value;
    setSearch(v);
    setPage(1);
    load(v, 1);
  };

  const shareUrl = (inv) => `${window.location.origin}/invoice/${inv.shareToken}`;

  const copyLink = (inv) => {
    navigator.clipboard.writeText(shareUrl(inv))
      .then(() => toast.success('Link copied!'))
      .catch(() => toast.error('Copy failed'));
  };

  const openWhatsApp = (inv) => {
    const url = `https://wa.me/?text=${encodeURIComponent(`🧾 Invoice #${inv.orderNumber} — ${inv.partyName}\n${shareUrl(inv)}`)}`;
    window.open(url, '_blank');
  };

  const sendBaileysText = async (inv) => {
    const mobile = inv.customerMobile;
    if (!mobile) { toast.error('No mobile number stored with this invoice'); return; }
    const text = buildWhatsAppText(inv);
    try {
      await axios.post('/api/baileys/send-text', { to: mobile, text, contactName: inv.partyName });
      toast.success('Sent via Baileys!');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Baileys send failed');
    }
  };

  const shortDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5} mb={2}>
        <Box>
          <Typography variant="h6" fontWeight={800}>Invoices</Typography>
          <Typography variant="body2" color="text.secondary">{total} total — click any row to preview</Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Search order # or customer…"
          value={search}
          onChange={handleSearch}
          sx={{ minWidth: 240 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment>,
          }}
        />
      </Stack>

      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700 }}>Invoice #</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">No invoices found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <TableRow
                    key={inv._id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setPreview(inv)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={700} color="error.dark">
                        #{inv.orderNumber || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{inv.partyName || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{shortDate(inv.createdAt)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700}>₹{fmt(inv.grandTotal)}</Typography>
                    </TableCell>
                    <TableCell>
                      {inv.cloudinaryUrl ? (
                        <Chip label="PDF Ready" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      ) : (
                        <Chip label="Link Only" size="small" color="default" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Stack direction="row" spacing={0.25} justifyContent="center">
                        <Tooltip title="Preview Invoice">
                          <IconButton size="small" color="default" onClick={() => setPreview(inv)}>
                            <VisibilityRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Copy share link">
                          <IconButton size="small" color="primary" onClick={() => copyLink(inv)}>
                            <ContentCopyRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Share on WhatsApp (link)">
                          <IconButton size="small" color="success" onClick={() => openWhatsApp(inv)}>
                            <ShareRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Send formatted text via Baileys">
                          <IconButton size="small" color="info" onClick={() => sendBaileysText(inv)}>
                            <SendRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {inv.cloudinaryUrl && (
                          <Tooltip title="Open PDF">
                            <IconButton
                              size="small"
                              color="error"
                              component="a"
                              href={inv.cloudinaryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <WhatsAppIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {total > LIMIT && (
          <Stack direction="row" justifyContent="center" spacing={1} sx={{ py: 1.5 }}>
            <Button size="small" disabled={page === 1} onClick={() => { setPage(page - 1); load(search, page - 1); }}>Prev</Button>
            <Typography variant="body2" alignSelf="center">Page {page} of {Math.ceil(total / LIMIT)}</Typography>
            <Button size="small" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => { setPage(page + 1); load(search, page + 1); }}>Next</Button>
          </Stack>
        )}
      </Paper>

      {/* Preview Dialog */}
      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="xs" fullWidth>
        <Box sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
            <Typography variant="subtitle1" fontWeight={800}>Invoice #{preview?.orderNumber}</Typography>
            <IconButton size="small" onClick={() => setPreview(null)}>✕</IconButton>
          </Stack>

          {preview && (
            <Stack spacing={1}>
              {/* Info rows */}
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
                <Typography variant="body2"><b>Customer:</b> {preview.partyName}</Typography>
                <Typography variant="body2"><b>Date:</b> {preview.dateStr}</Typography>
                <Typography variant="body2"><b>Total:</b> ₹{fmt(preview.grandTotal)}</Typography>
              </Paper>

              {/* Items */}
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="caption" fontWeight={700} color="error.dark" display="block" mb={0.5}>Items</Typography>
                {(preview.items || []).map((it, i) => (
                  <Stack key={i} direction="row" justifyContent="space-between">
                    <Typography variant="caption">{it.Item} × {it.Quantity}</Typography>
                    <Typography variant="caption" fontWeight={600}>₹{fmt(it.Amount)}</Typography>
                  </Stack>
                ))}
                {(preview.extraCharges || []).filter((c) => Number(c.amount) > 0).map((c, i) => (
                  <Stack key={i} direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">{c.label}</Typography>
                    <Typography variant="caption">₹{fmt(c.amount)}</Typography>
                  </Stack>
                ))}
              </Paper>

              {/* Share link */}
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fff8f8' }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Share Link</Typography>
                <Typography variant="caption" sx={{ wordBreak: 'break-all', color: 'error.dark' }}>
                  {shareUrl(preview)}
                </Typography>
              </Paper>

              {/* Action buttons */}
              <Stack spacing={1}>
                <Button
                  fullWidth variant="contained" startIcon={<ContentCopyRoundedIcon />}
                  sx={{ bgcolor: '#1976d2', borderRadius: 2 }}
                  onClick={() => copyLink(preview)}
                >
                  Copy Link
                </Button>
                <Button
                  fullWidth variant="contained" startIcon={<ShareRoundedIcon />}
                  sx={{ bgcolor: '#25d366', borderRadius: 2 }}
                  onClick={() => openWhatsApp(preview)}
                >
                  Share on WhatsApp
                </Button>
                <Button
                  fullWidth variant="outlined" startIcon={<SendRoundedIcon />}
                  sx={{ borderRadius: 2 }}
                  onClick={() => sendBaileysText(preview)}
                >
                  Send via Baileys (Text)
                </Button>
                {preview.cloudinaryUrl && (
                  <Button
                    fullWidth variant="outlined" color="error" startIcon={<WhatsAppIcon />}
                    component="a" href={preview.cloudinaryUrl} target="_blank" rel="noopener noreferrer"
                    sx={{ borderRadius: 2 }}
                  >
                    Open PDF
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
        </Box>
      </Dialog>
    </Box>
  );
}
