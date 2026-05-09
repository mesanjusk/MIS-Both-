import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Collapse, IconButton, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreRoundedIcon  from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon  from '@mui/icons-material/ExpandLessRounded';
import OpenInNewRoundedIcon   from '@mui/icons-material/OpenInNewRounded';
import SendRoundedIcon        from '@mui/icons-material/SendRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import toast from 'react-hot-toast';
import { getEmailHistory } from '../services/gmailService';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const mb  = (b) => b ? `${(b / 1024 / 1024).toFixed(1)} MB` : '';

function AttachmentRow({ att }) {
  const parsed = att.parseSuccess;
  return (
    <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mb: 0.3 }}>
      <Typography variant="caption" sx={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
        {att.originalName} {att.fileSize ? `(${mb(att.fileSize)})` : ''}
      </Typography>
      {att.storageMethod === 'google_drive' && att.driveShareableLink && (
        <Tooltip title="Open Drive link">
          <IconButton size="small" href={att.driveShareableLink} target="_blank" rel="noreferrer">
            <OpenInNewRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {parsed && (
        <Chip
          size="small"
          label={`${att.parsedCustomer} | ${att.parsedSize} ×${att.parsedQty} | ${att.parsedItem}`}
          color="success" variant="outlined"
        />
      )}
    </Stack>
  );
}

function HistoryRow({ row }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <TableRow hover sx={{ '& td': { verticalAlign: 'middle' } }}>
        <TableCell>
          <Typography variant="caption">{fmt(row.sentAt)}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="caption">{row.fromEmail}</Typography>
        </TableCell>
        <TableCell>
          <Box>
            <Typography variant="body2" fontWeight={600} noWrap>{row.toName || row.toEmail}</Typography>
            {row.toName && <Typography variant="caption" color="text.secondary">{row.toEmail}</Typography>}
          </Box>
        </TableCell>
        <TableCell>
          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{row.subject}</Typography>
        </TableCell>
        <TableCell align="center">
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip size="small" label={row.attachments?.length || 0} />
            {row.attachments?.some((a) => a.storageMethod === 'google_drive') && (
              <Tooltip title="Contains Drive link(s)">
                <OpenInNewRoundedIcon fontSize="small" color="info" />
              </Tooltip>
            )}
          </Stack>
        </TableCell>
        <TableCell>
          {row.poUuid
            ? (
              <Tooltip title="Auto-created Draft PO">
                <Chip
                  size="small" color="warning" variant="outlined"
                  icon={<ReceiptLongRoundedIcon />}
                  label="PO created"
                  onClick={() => navigate(ROUTES.PURCHASE_ORDERS)}
                  sx={{ cursor: 'pointer' }}
                />
              </Tooltip>
            )
            : <Typography variant="caption" color="text.disabled">—</Typography>
          }
        </TableCell>
        <TableCell>
          <Chip size="small" label={row.status} color={row.status === 'sent' ? 'success' : 'error'} />
        </TableCell>
        <TableCell>
          <IconButton size="small" onClick={() => setOpen((p) => !p)}>
            {open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={8} sx={{ p: 0, border: 0 }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ p: 1.5, bgcolor: 'action.hover' }}>
              {row.bodyText && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" fontWeight={700}>Message body</Typography>
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
                    {row.bodyText}
                  </Typography>
                </Box>
              )}
              {row.attachments?.length > 0 && (
                <Box>
                  <Typography variant="caption" fontWeight={700}>Attachments</Typography>
                  {row.attachments.map((att, i) => <AttachmentRow key={i} att={att} />)}
                </Box>
              )}
              {row.lastError && (
                <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
                  Error: {row.lastError}
                </Typography>
              )}
              <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
                Gmail Message ID: {row.gmailMessageId || '—'} | Sent by: {row.sentBy}
              </Typography>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function EmailHistory() {
  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [filters, setFilters] = useState({ toEmail: '', status: '', fromDate: '', toDate: '', subject: '' });
  const navigate = useNavigate();
  const LIMIT = 30;

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const res = await getEmailHistory({ page: pg, limit: LIMIT, ...filters });
      setRows(Array.isArray(res?.result) ? res.result : []);
      setTotal(res?.total || 0);
      setPage(pg);
    } catch {
      toast.error('Failed to load email history');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(1); }, [load]);

  const applyFilters = () => load(1);
  const clearFilters = () => {
    setFilters({ toEmail: '', status: '', fromDate: '', toDate: '', subject: '' });
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={900}>Email History</Typography>
        <Button variant="contained" startIcon={<SendRoundedIcon />} onClick={() => navigate(ROUTES.EMAIL_COMPOSE)}>
          Compose Email
        </Button>
      </Stack>

      {/* Filters */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap">
        <TextField
          size="small" label="Recipient email" value={filters.toEmail}
          onChange={(e) => setFilters((p) => ({ ...p, toEmail: e.target.value }))}
          sx={{ minWidth: 200 }}
        />
        <TextField
          size="small" label="Subject" value={filters.subject}
          onChange={(e) => setFilters((p) => ({ ...p, subject: e.target.value }))}
          sx={{ minWidth: 180 }}
        />
        <TextField select size="small" label="Status" value={filters.status}
          onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))} sx={{ minWidth: 130 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="sent">Sent</MenuItem>
          <MenuItem value="failed">Failed</MenuItem>
        </TextField>
        <TextField size="small" type="date" label="From" value={filters.fromDate}
          onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
          InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To" value={filters.toDate}
          onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
          InputLabelProps={{ shrink: true }} />
        <Button variant="contained" onClick={applyFilters} size="small">Search</Button>
        <Button variant="outlined" onClick={clearFilters} size="small">Clear</Button>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {total} email{total !== 1 ? 's' : ''} found
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No emails found. Try adjusting your filters.</Typography>
          <Button sx={{ mt: 1 }} onClick={() => navigate(ROUTES.EMAIL_COMPOSE)}>Send your first email</Button>
        </Paper>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell>Sent At</TableCell>
                  <TableCell>From</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell align="center">Files</TableCell>
                  <TableCell>Auto PO</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => <HistoryRow key={row.emailId || row._id} row={row} />)}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          {total > LIMIT && (
            <Stack direction="row" justifyContent="center" spacing={1} sx={{ mt: 2 }}>
              <Button size="small" disabled={page <= 1} onClick={() => load(page - 1)}>Prev</Button>
              <Typography variant="body2" sx={{ alignSelf: 'center' }}>
                Page {page} of {Math.ceil(total / LIMIT)}
              </Typography>
              <Button size="small" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => load(page + 1)}>Next</Button>
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
