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
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import { deleteCustomer, fetchCustomers } from '../services/customerService.js';
import EditCustomer from './editCustomer';
import AddCustomer from '../Pages/addCustomer';
import { ReportCardGrid, ReportFilterBar, ReportPageShell, ReportTableCard } from '../components/reports/ReportShell';
import { EmptyState, LoadingState } from '../components/ui';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-IN');
};

export default function CustomerReport() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('Customer_name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [userGroup, setUserGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table');

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const group = localStorage.getItem('User_group');
      setUserGroup(group || '');
      const res = await fetchCustomers();
      const rows = res?.data?.success ? res.data.result || [] : [];
      setCustomers(rows.sort((a, b) => String(a.Customer_name || '').localeCompare(String(b.Customer_name || ''))));
    } catch (error) {
      console.error('Error fetching customer list:', error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleSort = (field, forcedOrder = null) => {
    const newOrder = forcedOrder || (sortField === field && sortOrder === 'asc' ? 'desc' : 'asc');
    setSortField(field);
    setSortOrder(newOrder);
    setCustomers((prev) =>
      [...prev].sort((a, b) => {
        const aField = a[field] || '';
        const bField = b[field] || '';
        if (field === 'LastInteraction') {
          return newOrder === 'asc' ? new Date(aField) - new Date(bField) : new Date(bField) - new Date(aField);
        }
        return newOrder === 'asc'
          ? String(aField).localeCompare(String(bField))
          : String(bField).localeCompare(String(aField));
      }),
    );
  };

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return customers.filter((c) =>
      [c.Customer_name, c.Mobile_number, c.Customer_group, c.Status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [customers, searchTerm]);

  const handleDeleteConfirm = async () => {
    if (!selectedCustomer?._id) return;
    try {
      const deleteResponse = await deleteCustomer(selectedCustomer._id);
      if (deleteResponse?.data?.success) {
        setCustomers((prev) => prev.filter((c) => c._id !== selectedCustomer._id));
      }
    } catch (error) {
      console.error('Error deleting customer:', error);
    } finally {
      setShowDeleteModal(false);
    }
  };

  return (
    <ReportPageShell
      title="Customers Report"
      subtitle="Search, sort, print, and open customer records in table or card view."
      count={filteredCustomers.length}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      actions={
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setShowAddModal(true)}>
            Add Customer
          </Button>
        </Stack>
      }
    >
      <ReportFilterBar>
        <Grid item xs={12} md={7}>
          <TextField
            fullWidth
            size="small"
            label="Search customer"
            placeholder="Name, mobile, group, status"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </Grid>
        <Grid item xs={6} md={2}>
          <TextField
            select
            fullWidth
            size="small"
            label="Sort by"
            value={sortField}
            onChange={(event) => handleSort(event.target.value)}
            SelectProps={{ native: true }}
          >
            <option value="Customer_name">Customer Name</option>
            <option value="Mobile_number">Mobile</option>
            <option value="Customer_group">Group</option>
            <option value="Status">Status</option>
            <option value="LastInteraction">Last Interaction</option>
          </TextField>
        </Grid>
        <Grid item xs={6} md={3}>
          <TextField
            select
            fullWidth
            size="small"
            label="Order"
            value={sortOrder}
            onChange={(event) => {
              handleSort(sortField, event.target.value);
            }}
            SelectProps={{ native: true }}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </TextField>
        </Grid>
      </ReportFilterBar>

      {loading ? <LoadingState label="Loading customers" /> : null}
      {!loading && filteredCustomers.length === 0 ? <EmptyState title="No matching customers" /> : null}

      {!loading && filteredCustomers.length > 0 && viewMode === 'table' ? (
        <ReportTableCard>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Customer_name', 'Mobile_number', 'Customer_group', 'Status', 'LastInteraction', 'Tags'].map((header) => (
                  <TableCell key={header} onClick={() => handleSort(header)} sx={{ fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {header.replace(/_/g, ' ')} {sortField === header ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </TableCell>
                ))}
                {userGroup === 'Admin User' ? <TableCell sx={{ fontWeight: 800 }}>Actions</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer._id} hover>
                  <TableCell>
                    <Button size="small" onClick={() => { setSelectedCustomerId(customer._id); setShowEditModal(true); }}>
                      {customer.Customer_name}
                    </Button>
                  </TableCell>
                  <TableCell>{customer.Mobile_number || '-'}</TableCell>
                  <TableCell>{customer.Customer_group || '-'}</TableCell>
                  <TableCell>{customer.Status || '-'}</TableCell>
                  <TableCell>{formatDate(customer.LastInteraction)}</TableCell>
                  <TableCell>{Array.isArray(customer.Tags) ? customer.Tags.join(', ') : '-'}</TableCell>
                  {userGroup === 'Admin User' ? (
                    <TableCell>
                      {customer.isUsed ? (
                        <LockRoundedIcon fontSize="small" color="disabled" />
                      ) : (
                        <IconButton size="small" color="error" onClick={() => { setSelectedCustomer(customer); setShowDeleteModal(true); }}>
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportTableCard>
      ) : null}

      {!loading && filteredCustomers.length > 0 && viewMode === 'grid' ? (
        <ReportCardGrid>
          {filteredCustomers.map((customer) => (
            <Grid item xs={12} sm={6} lg={4} key={customer._id}>
              <Card elevation={0} sx={{ height: '100%', borderRadius: 3 }}>
                <CardContent>
                  <Stack spacing={1.1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <BoxLikeButton label={customer.Customer_name} onClick={() => { setSelectedCustomerId(customer._id); setShowEditModal(true); }} />
                      <IconButton size="small" onClick={() => { setSelectedCustomerId(customer._id); setShowEditModal(true); }}>
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{customer.Mobile_number || '-'}</Typography>
                    <InfoRow label="Group" value={customer.Customer_group || '-'} />
                    <InfoRow label="Status" value={customer.Status || '-'} />
                    <InfoRow label="Last Interaction" value={formatDate(customer.LastInteraction)} />
                    <InfoRow label="Tags" value={Array.isArray(customer.Tags) ? customer.Tags.join(', ') : '-'} />
                    {userGroup === 'Admin User' ? (
                      customer.isUsed ? (
                        <Button variant="outlined" color="inherit" startIcon={<LockRoundedIcon />} disabled>
                          Linked record
                        </Button>
                      ) : (
                        <Button variant="outlined" color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => { setSelectedCustomer(customer); setShowDeleteModal(true); }}>
                          Delete
                        </Button>
                      )
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </ReportCardGrid>
      ) : null}

      <Dialog open={showEditModal} onClose={() => setShowEditModal(false)} fullWidth maxWidth="md">
        <DialogContent sx={{ p: 1 }}>
          <EditCustomer customerId={selectedCustomerId} closeModal={() => { setShowEditModal(false); loadCustomers(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={showAddModal} onClose={() => setShowAddModal(false)} fullWidth maxWidth="md">
        <DialogContent sx={{ p: 1 }}>
          <AddCustomer closeModal={() => { setShowAddModal(false); loadCustomers(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
        <DialogTitle>Delete customer</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Are you sure you want to delete {selectedCustomer?.Customer_name || 'this customer'}?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm}>Delete</Button>
        </DialogActions>
      </Dialog>
    </ReportPageShell>
  );
}

function InfoRow({ label, value }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600} textAlign="right">{value}</Typography>
    </Stack>
  );
}

function BoxLikeButton({ label, onClick }) {
  return (
    <Button variant="text" onClick={onClick} sx={{ p: 0, justifyContent: 'flex-start', textAlign: 'left' }}>
      <Typography variant="subtitle1" fontWeight={800}>{label}</Typography>
    </Button>
  );
}
