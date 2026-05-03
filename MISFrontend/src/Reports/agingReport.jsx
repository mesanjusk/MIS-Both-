import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Paper,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import axios from '../apiClient';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function AgingReport() {
  const [rows, setRows] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(today());
  const [loading, setLoading] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/dashboard/customer-aging', { params: { fromDate, toDate } });
      setRows(Array.isArray(res?.data?.result) ? res.data.result : []);
    } catch (error) {
      console.error('Aging report failed:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRows(); }, []);

  const totals = useMemo(() => rows.reduce((acc, row) => ({
    total0to30: acc.total0to30 + Number(row.total0to30 || 0),
    total31to60: acc.total31to60 + Number(row.total31to60 || 0),
    total61to90: acc.total61to90 + Number(row.total61to90 || 0),
    total90plus: acc.total90plus + Number(row.total90plus || 0),
    grandTotal: acc.grandTotal + Number(row.grandTotal || 0),
  }), { total0to30: 0, total31to60: 0, total61to90: 0, total90plus: 0, grandTotal: 0 }), [rows]);

  const openWhatsApp = (row) => {
    const phone = String(row.mobile || '').replace(/\D/g, '');
    const text = encodeURIComponent(`Dear ${row.customerName}, you have Rs ${Number(row.grandTotal || 0).toLocaleString('en-IN')} overdue. Please clear dues.`);
    window.open(`https://wa.me/${phone || ''}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map((row) => ({
      Customer: row.customerName,
      Mobile: row.mobile,
      '0-30 Days': row.total0to30,
      '31-60 Days': row.total31to60,
      '61-90 Days': row.total61to90,
      '90+ Days': row.total90plus,
      'Grand Total': row.grandTotal,
      'Oldest Days': row.oldestOrderDays,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Aging Report');
    XLSX.writeFile(wb, 'Customer_Aging_Report.xlsx');
  };

  const bucketSx = (bg) => ({ bgcolor: bg, fontWeight: 700, whiteSpace: 'nowrap' });

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>Customer Aging Report</Typography>
          <Typography variant="body2" color="text.secondary">Customer-wise unpaid orders by age bucket.</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField size="small" label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <Button variant="contained" onClick={loadRows} disabled={loading}>Apply</Button>
          <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={exportExcel}>Excel</Button>
        </Stack>
      </Stack>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 1 }}>
          <TableContainer component={Paper} elevation={0} sx={{ maxHeight: '72vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">0-30 Days</TableCell>
                  <TableCell align="right">31-60 Days</TableCell>
                  <TableCell align="right">61-90 Days</TableCell>
                  <TableCell align="right">90+ Days</TableCell>
                  <TableCell align="right">Grand Total</TableCell>
                  <TableCell align="center">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.customerUuid || row.customerName} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{row.customerName}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.mobile || '-'} • Oldest {row.oldestOrderDays || 0} days</Typography>
                    </TableCell>
                    <TableCell align="right" sx={bucketSx('#ecfdf3')}>{money(row.total0to30)}</TableCell>
                    <TableCell align="right" sx={bucketSx('#fff8db')}>{money(row.total31to60)}</TableCell>
                    <TableCell align="right" sx={bucketSx('#fff1df')}>{money(row.total61to90)}</TableCell>
                    <TableCell align="right" sx={bucketSx('#ffe8e8')}>{money(row.total90plus)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>{money(row.grandTotal)}</TableCell>
                    <TableCell align="center"><Button size="small" startIcon={<WhatsAppIcon />} onClick={() => openWhatsApp(row)}>WhatsApp</Button></TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 900, bgcolor: 'grey.100' } }}>
                  <TableCell>TOTAL</TableCell>
                  <TableCell align="right">{money(totals.total0to30)}</TableCell>
                  <TableCell align="right">{money(totals.total31to60)}</TableCell>
                  <TableCell align="right">{money(totals.total61to90)}</TableCell>
                  <TableCell align="right">{money(totals.total90plus)}</TableCell>
                  <TableCell align="right">{money(totals.grandTotal)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}
