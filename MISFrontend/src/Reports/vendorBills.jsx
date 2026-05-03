import { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { getWithFallback } from '../utils/api.js';
import { useNavigate, useLocation } from 'react-router-dom';
import BillUpdate from '../Reports/billUpdate';
import { ReportCardGrid, ReportFilterBar, ReportPageShell, ReportTableCard } from '../components/reports/ReportShell';
import { EmptyState, LoadingState } from '../components/ui';

export default function VendorBills() {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [searchOrder, setSearchOrder] = useState('');
  const [customers, setCustomers] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid');

  const ORDERS_BASES = ['/api/orders', '/order'];
  const CUSTOMERS_BASES = ['/api/customers', '/customer'];

  useEffect(() => {
    const userNameFromState = location.state?.id;
    const user = userNameFromState || localStorage.getItem('User_name');
    if (user) setLoggedInUser(user);
    else navigate('/login');
  }, [location.state, navigate]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [ordersRes, customersRes] = await Promise.all([
          getWithFallback(ORDERS_BASES.map((b) => `${b}/GetBillList`)),
          getWithFallback(CUSTOMERS_BASES.map((b) => `${b}/GetCustomersList`)),
        ]);
        setOrders(ordersRes?.data?.success ? ordersRes.data.result || [] : []);
        if (customersRes?.data?.success) {
          const customerMap = (customersRes.data.result || []).reduce((acc, c) => {
            if (c.Customer_uuid && c.Customer_name) acc[c.Customer_uuid] = c.Customer_name;
            return acc;
          }, {});
          setCustomers(customerMap);
        }
      } catch (error) {
        console.error('Error fetching vendor bills:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredOrders = useMemo(() => orders
    .map((order) => {
      const highestStatusTask = Array.isArray(order.Status) && order.Status.length > 0
        ? order.Status.reduce((prev, current) => (prev.Status_number > current.Status_number ? prev : current))
        : {};
      const customerName = customers[order.Customer_uuid] || 'Unknown';
      return { ...order, highestStatusTask, Customer_name: customerName };
    })
    .filter((order) => order.highestStatusTask.Assigned === loggedInUser && order.Customer_name.toLowerCase().includes(searchOrder.toLowerCase())), [orders, customers, loggedInUser, searchOrder]);

  const getFirstRemark = (order) => {
    if (!Array.isArray(order?.Items) || order.Items.length === 0) return '-';
    return String(order.Items[0]?.Remark || '-');
  };

  return (
    <ReportPageShell
      title="Vendor Bills"
      subtitle="Delivered orders assigned to you, ready for bill update."
      count={filteredOrders.length}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      actions={<Button variant="outlined" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>Print</Button>}
    >
      <ReportFilterBar><Grid item xs={12}><TextField fullWidth size="small" label="Search customer" value={searchOrder} onChange={(e) => setSearchOrder(e.target.value)} /></Grid></ReportFilterBar>
      {loading ? <LoadingState label="Loading vendor bills" /> : null}
      {!loading && filteredOrders.length === 0 ? <EmptyState title="No orders found" /> : null}
      {!loading && filteredOrders.length > 0 && viewMode === 'table' ? (
        <ReportTableCard><Table size="small"><TableHead><TableRow><TableCell sx={{ fontWeight: 800 }}>Order</TableCell><TableCell sx={{ fontWeight: 800 }}>Customer</TableCell><TableCell sx={{ fontWeight: 800 }}>Remark</TableCell><TableCell sx={{ fontWeight: 800 }}>Assigned</TableCell><TableCell sx={{ fontWeight: 800 }}>Delivery</TableCell><TableCell sx={{ fontWeight: 800 }}>Action</TableCell></TableRow></TableHead><TableBody>{filteredOrders.map((order) => (<TableRow hover key={order._id}><TableCell>#{order.Order_Number}</TableCell><TableCell>{order.Customer_name}</TableCell><TableCell>{getFirstRemark(order)}</TableCell><TableCell>{order.highestStatusTask?.Assigned || '-'}</TableCell><TableCell>{order.highestStatusTask?.Delivery_Date ? new Date(order.highestStatusTask.Delivery_Date).toLocaleDateString() : '-'}</TableCell><TableCell><Button size="small" startIcon={<EditRoundedIcon />} onClick={() => { setSelectedOrder(order); setShowEditModal(true); }}>Update</Button></TableCell></TableRow>))}</TableBody></Table></ReportTableCard>
      ) : null}
      {!loading && filteredOrders.length > 0 && viewMode === 'grid' ? (
        <ReportCardGrid>{filteredOrders.map((order) => (<Grid item xs={12} sm={6} lg={4} key={order._id}><Card elevation={0} sx={{ borderRadius: 3, height: '100%' }}><CardContent><Stack spacing={1.15}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="subtitle1" fontWeight={800}>#{order.Order_Number}</Typography><Typography variant="caption" color="text.secondary">{new Date(order.createdAt).toLocaleDateString()}</Typography></Stack><Typography variant="body2" fontWeight={700}>{order.Customer_name}</Typography><Typography variant="body2" color="text.secondary">{getFirstRemark(order)}</Typography><InfoRow label="Assigned" value={order.highestStatusTask?.Assigned || '-'} /><InfoRow label="Delivery" value={order.highestStatusTask?.Delivery_Date ? new Date(order.highestStatusTask.Delivery_Date).toLocaleDateString() : '-'} /><Button variant="contained" startIcon={<EditRoundedIcon />} onClick={() => { setSelectedOrder(order); setShowEditModal(true); }}>Update Bill</Button></Stack></CardContent></Card></Grid>))}</ReportCardGrid>
      ) : null}
      <Dialog open={showEditModal} onClose={() => setShowEditModal(false)} fullWidth maxWidth="md"><DialogContent sx={{ p: 1 }}><BillUpdate order={selectedOrder} onClose={() => setShowEditModal(false)} /></DialogContent></Dialog>
    </ReportPageShell>
  );
}

function InfoRow({ label, value }) {
  return <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={600}>{value}</Typography></Stack>;
}
