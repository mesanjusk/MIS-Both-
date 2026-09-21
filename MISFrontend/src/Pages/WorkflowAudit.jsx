import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import RuleRoundedIcon from '@mui/icons-material/RuleRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import axios from '../apiClient';
import DeliveryDateSidebar from '../Components/reports/DeliveryDateSidebar';

const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusMeta = {
  pass: { label: 'Pass', color: 'success' },
  warning: { label: 'Warning', color: 'warning' },
  fail: { label: 'Fail', color: 'error' },
  pending: { label: 'Pending', color: 'default' },
};

function MatchChip({ ok, yes = '✓', no = '—', title }) {
  return (
    <Tooltip title={title || ''}>
      <Chip
        size="small"
        label={ok ? yes : no}
        color={ok ? 'success' : 'default'}
        variant={ok ? 'filled' : 'outlined'}
        sx={{ height: 20, minWidth: 34, fontSize: 9.5, fontWeight: 800 }}
      />
    </Tooltip>
  );
}

export default function WorkflowAudit() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/workflow-audit', {
        params: {
          ...(selectedDate ? { date: selectedDate } : {}),
          ...(refresh ? { refresh: true } : {}),
        },
      });
      setRows(res.data?.success && Array.isArray(res.data.result) ? res.data.result : []);
      setSummary(res.data?.summary || {});
      setDates(Array.isArray(res.data?.dates) ? res.data.dates : []);
    } catch (err) {
      setRows([]);
      setError(err?.response?.data?.message || err.message || 'Workflow audit failed');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load(false);
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!q) return true;
      return [
        row.orderNumber,
        row.customerName,
        row.final?.fileName,
        row.printing?.folderName,
        row.printing?.vendorName,
        row.purchaseOrder?.vendorName,
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [rows, statusFilter, search]);

  const availableDates = useMemo(() => dates.map((item) => item.date), [dates]);
  const dateCountMap = useMemo(() => {
    const map = {};
    dates.forEach((item) => { map[item.date] = Number(item.count || 0); });
    return map;
  }, [dates]);

  const visibleSummary = useMemo(() => {
    const base = { total: 0, pass: 0, warning: 0, fail: 0, pending: 0, twoWayMatched: 0, threeWayMatched: 0, poMatched: 0 };
    filteredRows.forEach((row) => {
      base.total += 1;
      base[row.status] = (base[row.status] || 0) + 1;
      if (row.matches?.twoWay) base.twoWayMatched += 1;
      if (row.matches?.threeWay) base.threeWayMatched += 1;
      if (row.matches?.po) base.poMatched += 1;
    });
    return base;
  }, [filteredRows]);

  return (
    <Box sx={{ display: 'flex', gap: 2, minHeight: '80vh', p: { xs: 0.5, md: 1 } }}>
      <DeliveryDateSidebar
        title="Workflow Audit"
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        availableDates={availableDates}
        dateCountMap={dateCountMap}
        allCount={Number(summary.total || 0)}
        loading={loading}
        countLabel="orders"
        formatDate={fmtDate}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', md: 'center' }}
          sx={{ mb: 1.25 }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={900}>Workflow Audit</Typography>
            <Typography variant="body2" color="text.secondary">
              Final ↔ Printing ↔ MIS Order ↔ Vendor PO ↔ Post Press
            </Typography>
          </Box>

          <TextField
            size="small"
            placeholder="Order / customer / vendor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: { xs: '100%', md: 220 } }}
          />

          <TextField
            select
            size="small"
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ width: { xs: '100%', md: 125 } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="pass">Pass</MenuItem>
            <MenuItem value="warning">Warning</MenuItem>
            <MenuItem value="fail">Fail</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
          </TextField>

          <Tooltip title="Re-scan Drive and re-run reconciliation">
            <IconButton onClick={() => load(true)} disabled={loading}>
              {loading ? <CircularProgress size={18} /> : <RefreshRoundedIcon />}
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.25 }}>
          {[
            { label: 'Audited', value: visibleSummary.total, Icon: RuleRoundedIcon },
            { label: '2-Way', value: `${visibleSummary.twoWayMatched}/${visibleSummary.total}`, Icon: FolderRoundedIcon },
            { label: '3-Way', value: `${visibleSummary.threeWayMatched}/${visibleSummary.total}`, Icon: VerifiedRoundedIcon },
            { label: 'Pass', value: visibleSummary.pass, Icon: VerifiedRoundedIcon },
            { label: 'Warnings', value: visibleSummary.warning, Icon: WarningAmberRoundedIcon },
            { label: 'Failures', value: visibleSummary.fail, Icon: ErrorOutlineRoundedIcon },
          ].map(({ label, value, Icon }) => (
            <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 2.5 }}>
              <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="h6" fontWeight={900}>{value}</Typography>
                  </Box>
                  <Icon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {error ? (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
            <Typography color="error.main">{error}</Typography>
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: '66vh' }}>
              <Table
                size="small"
                stickyHeader
                sx={{ '& .MuiTableCell-root': { px: 0.7, py: 0.55, verticalAlign: 'middle' } }}
              >
                <TableHead>
                  <TableRow>
                    {!selectedDate && <TableCell sx={{ fontWeight: 800, width: 78 }}>Date</TableCell>}
                    <TableCell sx={{ fontWeight: 800, width: 58 }}>Order</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Customer</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: 54 }}>Final</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: 62 }}>Print</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: 58 }}>MIS</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: 62 }}>2-Way</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: 62 }}>3-Way</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: 52 }}>
                      <Tooltip title="Vendor Purchase Order"><ReceiptLongRoundedIcon sx={{ fontSize: 18 }} /></Tooltip>
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: 62 }}>
                      <Tooltip title="Post Press"><BuildRoundedIcon sx={{ fontSize: 18 }} /></Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 800, minWidth: 180 }}>Issues</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: 76 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && !filteredRows.length ? (
                    <TableRow>
                      <TableCell colSpan={selectedDate ? 11 : 12} align="center" sx={{ py: 5 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : !filteredRows.length ? (
                    <TableRow>
                      <TableCell colSpan={selectedDate ? 11 : 12} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No audit rows for this selection.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => {
                      const meta = statusMeta[row.status] || statusMeta.pending;
                      const issues = Array.isArray(row.issues) ? row.issues : [];
                      return (
                        <TableRow key={`${row.date}-${row.orderNumber}`} hover>
                          {!selectedDate && <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 11 }}>{fmtDate(row.date)}</TableCell>}
                          <TableCell>
                            <Typography variant="body2" fontWeight={900}>#{row.orderNumber}</Typography>
                          </TableCell>
                          <TableCell>
                            <Tooltip title={row.printing?.folderName || row.final?.fileName || ''}>
                              <Box>
                                <Typography variant="body2" fontWeight={700} noWrap sx={{ maxWidth: 160 }}>
                                  {row.customerName || row.printing?.customerName || row.final?.customerName || '—'}
                                </Typography>
                                {row.printing?.vendorName ? (
                                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 160 }}>
                                    Vendor: {row.printing.vendorName}
                                  </Typography>
                                ) : null}
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell align="center">
                            <MatchChip ok={row.final?.exists} title={row.final?.fileName || 'Final file missing'} />
                          </TableCell>
                          <TableCell align="center">
                            <MatchChip ok={row.printing?.exists} title={row.printing?.folderName || 'Printing folder missing'} />
                          </TableCell>
                          <TableCell align="center">
                            <MatchChip ok={Boolean(row.orderUuid)} title={row.orderUuid ? `MIS stage: ${row.orderStage}` : 'MIS order missing'} />
                          </TableCell>
                          <TableCell align="center">
                            <MatchChip ok={row.matches?.twoWay} yes="2✓" no="2✕" title="Final ↔ Printing order-number match" />
                          </TableCell>
                          <TableCell align="center">
                            <MatchChip ok={row.matches?.threeWay && row.matches?.names} yes="3✓" no="3✕" title="Final ↔ Printing ↔ MIS order/customer match" />
                          </TableCell>
                          <TableCell align="center">
                            <MatchChip
                              ok={row.matches?.po}
                              yes={row.purchaseOrder?.poNumber ? `#${row.purchaseOrder.poNumber}` : '✓'}
                              no="—"
                              title={row.purchaseOrder?.exists
                                ? `PO vendor: ${row.purchaseOrder.vendorName || '—'}`
                                : 'PO not linked to exact Printing folder'}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              size="small"
                              label={row.postPress?.count
                                ? `${row.postPress.completed}/${row.postPress.count}`
                                : '0'}
                              color={row.matches?.postPress ? 'success' : 'warning'}
                              variant="outlined"
                              sx={{ height: 20, minWidth: 34, fontSize: 9.5 }}
                            />
                          </TableCell>
                          <TableCell>
                            {issues.length ? (
                              <Tooltip title={issues.map((issue) => issue.message).join(' • ')}>
                                <Typography
                                  variant="caption"
                                  color={issues.some((issue) => issue.severity === 'error') ? 'error.main' : 'warning.dark'}
                                  noWrap
                                  sx={{ maxWidth: 240, display: 'block' }}
                                >
                                  {issues.map((issue) => issue.message).join(' • ')}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography variant="caption" color="success.main">All checks passed</Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              size="small"
                              label={meta.label}
                              color={meta.color}
                              variant={row.status === 'pass' ? 'filled' : 'outlined'}
                              sx={{ height: 21, fontSize: 9.5, fontWeight: 800 }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          2-Way = Final ↔ Printing. 3-Way = Final ↔ Printing ↔ MIS customer order.
          PO and Post Press are then checked against the same order UUID/number and Printing folder.
        </Typography>
      </Box>
    </Box>
  );
}
