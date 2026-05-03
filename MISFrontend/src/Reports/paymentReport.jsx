import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import axios from '../apiClient.js';
import EditPayment from './editPayment';
import AddPayment from '../Pages/addPayment';
import { ReportCardGrid, ReportFilterBar, ReportPageShell, ReportTableCard } from '../components/reports/ReportShell';
import { EmptyState, LoadingState } from '../components/ui';

export default function PaymentReport() {
  const [payments, setPayments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [userGroup, setUserGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table');

  const loadPayments = async () => {
    setLoading(true);
    try {
      setUserGroup(localStorage.getItem('User_group') || '');
      const res = await axios.get('/api/payment_mode/GetPaymentList');
      const rows = res?.data?.success ? res.data.result || [] : [];
      setPayments(rows.sort((a, b) => String(a.Payment_name || '').localeCompare(String(b.Payment_name || ''))));
    } catch (error) {
      console.error('Error fetching payments list:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPayments(); }, []);

  const filtered = useMemo(
    () => payments.filter((payment) => String(payment.Payment_name || '').toLowerCase().includes(searchTerm.toLowerCase())),
    [payments, searchTerm],
  );

  const handleDeleteConfirm = async () => {
    if (!selectedPayment?._id && !selectedPayment?.Payment_mode_uuid) return;
    try {
      const paymentDeleteId = selectedPayment.Payment_mode_uuid || selectedPayment._id;
      const res = await axios.delete(`/payment_mode/DeletePayment/${paymentDeleteId}`);
      if (res?.data?.success) {
        setPayments((prev) => prev.filter((item) => item._id !== selectedPayment._id));
      }
    } catch (error) {
      console.error('Error deleting payment:', error);
    } finally {
      setShowDeleteModal(false);
    }
  };

  return (
    <ReportPageShell
      title="Payment Modes"
      subtitle="Maintain payment mode masters with card or table view."
      count={filtered.length}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      actions={
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>Print</Button>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setShowAddModal(true)}>Add Payment</Button>
        </Stack>
      }
    >
      <ReportFilterBar>
        <Grid item xs={12}>
          <TextField fullWidth size="small" label="Search payment name" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </Grid>
      </ReportFilterBar>

      {loading ? <LoadingState label="Loading payment modes" /> : null}
      {!loading && filtered.length === 0 ? <EmptyState title="No payment modes found" /> : null}

      {!loading && filtered.length > 0 && viewMode === 'table' ? (
        <ReportTableCard>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>Payment Name</TableCell>
                {userGroup === 'Admin User' ? <TableCell sx={{ fontWeight: 800 }}>Actions</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((payment) => (
                <TableRow key={payment._id} hover>
                  <TableCell>
                    <Button size="small" onClick={() => { setSelectedPaymentId(payment._id); setShowEditModal(true); }}>{payment.Payment_name}</Button>
                  </TableCell>
                  {userGroup === 'Admin User' ? (
                    <TableCell>
                      <IconButton size="small" color="error" onClick={() => { setSelectedPayment(payment); setShowDeleteModal(true); }}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportTableCard>
      ) : null}

      {!loading && filtered.length > 0 && viewMode === 'grid' ? (
        <ReportCardGrid>
          {filtered.map((payment) => (
            <Grid item xs={12} sm={6} md={4} key={payment._id}>
              <Card elevation={0} sx={{ borderRadius: 3, height: '100%' }}>
                <CardContent>
                  <Stack spacing={1.2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle1" fontWeight={800}>{payment.Payment_name}</Typography>
                      <IconButton size="small" onClick={() => { setSelectedPaymentId(payment._id); setShowEditModal(true); }}>
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">Payment UUID: {payment.Payment_mode_uuid || '-'}</Typography>
                    {userGroup === 'Admin User' ? (
                      <Button variant="outlined" color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => { setSelectedPayment(payment); setShowDeleteModal(true); }}>
                        Delete
                      </Button>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </ReportCardGrid>
      ) : null}

      <Dialog open={showEditModal} onClose={() => setShowEditModal(false)} fullWidth maxWidth="sm">
        <DialogContent sx={{ p: 1 }}>
          <EditPayment paymentId={selectedPaymentId} closeModal={() => { setShowEditModal(false); loadPayments(); }} />
        </DialogContent>
      </Dialog>
      <Dialog open={showAddModal} onClose={() => setShowAddModal(false)} fullWidth maxWidth="sm">
        <DialogContent sx={{ p: 1 }}>
          <AddPayment closeModal={() => { setShowAddModal(false); loadPayments(); }} />
        </DialogContent>
      </Dialog>
      <Dialog open={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
        <DialogTitle>Delete payment mode</DialogTitle>
        <DialogContent><Typography variant="body2">Delete {selectedPayment?.Payment_name || 'this payment mode'}?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>Delete</Button>
        </DialogActions>
      </Dialog>
    </ReportPageShell>
  );
}
