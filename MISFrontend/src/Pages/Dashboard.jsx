import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Fab,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import AddCardRoundedIcon from '@mui/icons-material/AddCardRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import axios from '../apiClient';
import SummaryCard from '../components/dashboard/SummaryCard';
import AllAttandance from './AllAttandance';
import UserTask from './userTask';
import { useDashboardData } from '../hooks/useDashboardData';
import { useUserRole } from '../hooks/useUserRole';
import { useThemeConfig } from '../context/ThemeConfigContext.jsx';
import {
  DataTableWrapper,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  SectionCard,
} from '../components/ui';
import UpiCollectionSection from '../Components/dashboard/UpiCollectionSection';
import DesignFilesWidget from '../Components/dashboard/DesignFilesWidget';

const CONFIG_KEY = 'mis_dashboard_design_config_v2';
const CARD_IDS = ['outstanding', 'readyStuck', 'deliveredUnpaid', 'cash', 'newOrders', 'oldPending', 'delivery', 'revenue', 'receivable', 'enquiry', 'lowStock'];
const SECTION_IDS = ['attendance', 'assignedTasks', 'pendingOrders', 'followups', 'userWiseTasks', 'lowStockTable'];
const DEFAULT_CONFIG = {
  cards: CARD_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
  sections: SECTION_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
};

const toId = (order) => order?.Order_uuid || order?._id || order?.Order_id;
const todayDateKey = () => new Date().toISOString().split('T')[0];
const parseAmount = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const formatMoney = (value) => `₹${parseAmount(value).toLocaleString('en-IN')}`;
const normalizeDateValue = (value) => {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};
const formatTaskDate = (value) => {
  const dt = normalizeDateValue(value);
  if (!dt) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};
const formatFollowupDate = (value) => {
  const dt = normalizeDateValue(value);
  if (!dt) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const isOverdueOrWithinNextDays = (value, days = 3) => {
  const date = normalizeDateValue(value);
  if (!date) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  end.setHours(23, 59, 59, 999);
  return date < start || (date >= start && date <= end);
};
const normalizePaymentFollowup = (item = {}) => {
  const followupDate = item?.followup_date || item?.Followup_date || item?.FollowupDate || item?.deadline || item?.Deadline || item?.date || item?.Date || null;
  return {
    id: item?._id || item?.followup_uuid || item?.Followup_uuid || `${item?.customer_name || item?.Customer_name || item?.Customer || 'followup'}-${followupDate || 'na'}`,
    customerName: item?.customer_name || item?.Customer_name || item?.Customer || item?.customer || '',
    amount: Number(item?.amount ?? item?.Amount ?? 0),
    title: item?.title || item?.Title || '',
    remark: item?.remark || item?.Remark || '',
    followupDate,
    status: item?.status || item?.Status || 'pending',
  };
};

function readConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return {
      cards: { ...DEFAULT_CONFIG.cards, ...(stored.cards || {}) },
      sections: { ...DEFAULT_CONFIG.sections, ...(stored.sections || {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function OrderList({ items, emptyLabel }) {
  if (!items?.length) return <EmptyState title={emptyLabel} />;
  return (
    <Stack spacing={0.6}>
      {items.map((order) => (
        <Box key={toId(order)} sx={{ p: 0.9, border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 1.5, bgcolor: 'background.paper' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.75}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>{order?.Customer_name || order?.customerName || 'Unknown'}</Typography>
              <Typography variant="caption" color="text.secondary">Order #{order?.Order_Number || '-'}</Typography>
            </Box>
            <Chip label={order?.highestStatusTask?.Task || order?.stage || 'Other'} color="primary" size="small" variant="outlined" />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function SmallScrollableTable({ columns, rows, emptyLabel, renderRow, maxHeight = 320 }) {
  return (
    <DataTableWrapper>
      <Box sx={{ maxHeight, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>{columns.map((column) => <TableCell key={column.key} align={column.align || 'left'} sx={{ whiteSpace: 'nowrap', py: 0.8 }}>{column.label}</TableCell>)}</TableRow>
          </TableHead>
          <TableBody>
            {!rows?.length ? (
              <TableRow><TableCell colSpan={columns.length} align="center" sx={{ py: 3 }}><Typography variant="body2" color="text.secondary">{emptyLabel}</Typography></TableCell></TableRow>
            ) : rows.map(renderRow)}
          </TableBody>
        </Table>
      </Box>
    </DataTableWrapper>
  );
}

export default function Dashboard() {
  const roleInfo = useUserRole();
  const { themeKey, setThemeKey, themeOptions } = useThemeConfig();
  const [summaryApi, setSummaryApi] = useState({});
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [followups, setFollowups] = useState([]);
  const [followupsLoading, setFollowupsLoading] = useState(true);
  const [upiDialogOpen, setUpiDialogOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [designConfig, setDesignConfig] = useState(readConfig);
  const [opsSummary, setOpsSummary] = useState({ outstanding: {}, stuck: {}, cash: {} });
  const [stockItems, setStockItems] = useState([]);

  const data = useDashboardData({ role: roleInfo?.role, userName: roleInfo?.userName, isAdmin: roleInfo?.isAdmin });

  const updateDesignConfig = (type, id, checked) => {
    setDesignConfig((prev) => {
      const next = { ...prev, [type]: { ...prev[type], [id]: checked } };
      saveConfig(next);
      return next;
    });
  };

  const resetDesign = () => {
    saveConfig(DEFAULT_CONFIG);
    setDesignConfig(DEFAULT_CONFIG);
  };

  useEffect(() => {
    let mounted = true;
    const fetchOperationalSummary = async () => {
      try {
        const [outstandingRes, stuckRes, cashRes, stockRes] = await Promise.all([
          axios.get('/api/dashboard/outstanding-summary').catch(() => ({ data: {} })),
          axios.get('/api/dashboard/stuck-orders').catch(() => ({ data: {} })),
          axios.get('/api/dashboard/cash-book-summary').catch(() => ({ data: {} })),
          axios.get('/api/stock/summary').catch(() => ({ data: { items: [] } })),
        ]);
        if (!mounted) return;
        setOpsSummary({ outstanding: outstandingRes?.data || {}, stuck: stuckRes?.data || {}, cash: cashRes?.data || {} });
        setStockItems(Array.isArray(stockRes?.data?.items) ? stockRes.data.items : []);
      } catch (error) {
        console.error('Operational dashboard summary failed:', error);
        if (mounted) setOpsSummary({ outstanding: {}, stuck: {}, cash: {} });
      }
    };
    fetchOperationalSummary();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchSummary = async () => {
      try {
        setSummaryLoading(true);
        const res = await axios.get('/api/dashboard/summary', {
          params: { userName: roleInfo?.userName || '', isAdmin: Boolean(roleInfo?.isAdmin), role: roleInfo?.role || '' },
        });
        if (mounted) setSummaryApi(res?.data?.result || {});
      } catch {
        if (mounted) setSummaryApi({});
      } finally {
        if (mounted) setSummaryLoading(false);
      }
    };
    if (roleInfo?.userName || roleInfo?.isAdmin) fetchSummary();
    return () => { mounted = false; };
  }, [roleInfo?.isAdmin, roleInfo?.role, roleInfo?.userName]);

  useEffect(() => {
    let mounted = true;
    // Fixed: use correct /api/ prefix — backend mounts at /api/paymentfollowup
    // Only one correct endpoint exists: GET /api/paymentfollowup/list
    const fetchFollowups = async () => {
      setFollowupsLoading(true);
      try {
        const res = await axios.get('/api/paymentfollowup/list');
        const apiRows = Array.isArray(res?.data?.result)
          ? res.data.result
          : Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res?.data)
          ? res.data
          : [];
        if (mounted) setFollowups(apiRows.map(normalizePaymentFollowup));
      } catch {
        // Silently fail — followups are non-critical, dashboard still loads
        if (mounted) setFollowups([]);
      } finally {
        if (mounted) setFollowupsLoading(false);
      }
    };
    fetchFollowups();
    return () => { mounted = false; };
  }, []);

  const oldPendingOrders = useMemo(() => {
    const today = todayDateKey();
    return (data?.activeOrders || []).filter((order) => {
      const createdAt = order?.highestStatusTask?.CreatedAt;
      if (!createdAt) return true;
      const dt = normalizeDateValue(createdAt);
      if (!dt) return true;
      return dt.toISOString().split('T')[0] !== today;
    }).length;
  }, [data?.activeOrders]);

  const lowStock = useMemo(() => stockItems.filter((i) => Number(i.currentQty || 0) <= Number(i.reorderLevel || 5)), [stockItems]);
  const assignedTasks = useMemo(() => Array.isArray(summaryApi?.assignedTasks) ? summaryApi.assignedTasks : [], [summaryApi]);
  const followupRows = useMemo(() => (followups || []).filter((item) => isOverdueOrWithinNextDays(item?.followupDate, 3)).sort((a, b) => (normalizeDateValue(a?.followupDate)?.getTime() || 0) - (normalizeDateValue(b?.followupDate)?.getTime() || 0)), [followups]);
  const userWiseTaskRows = useMemo(() => Array.isArray(summaryApi?.userWiseAssignedTasks) ? summaryApi.userWiseAssignedTasks : [], [summaryApi]);

  const summaryCards = useMemo(() => [
    { id: 'outstanding', title: 'Total Outstanding', value: formatMoney(opsSummary?.outstanding?.totalOutstandingAmount || opsSummary?.outstanding?.totalOutstanding || 0), icon: CurrencyRupeeRoundedIcon, variant: 'danger' },
    { id: 'readyStuck', title: 'Ready Stuck', value: opsSummary?.stuck?.readyNotDelivered?.length || 0, icon: LocalShippingRoundedIcon, variant: 'warning' },
    { id: 'deliveredUnpaid', title: 'Delivered Unpaid', value: opsSummary?.stuck?.deliveredNotPaid?.length || 0, icon: CreditCardRoundedIcon, variant: 'warning' },
    { id: 'cash', title: 'Cash Balance', value: formatMoney(opsSummary?.cash?.closingBalance || 0), icon: ReceiptLongRoundedIcon, variant: 'success' },
    { id: 'newOrders', title: 'New Orders', value: summaryApi?.todayOrdersCount ?? 0, icon: AssignmentRoundedIcon, variant: 'primary' },
    { id: 'oldPending', title: 'Old Pending', value: oldPendingOrders, icon: AutorenewRoundedIcon, variant: 'warning' },
    { id: 'delivery', title: 'Delivery Today', value: summaryApi?.todayDelivery ?? 0, icon: LocalShippingRoundedIcon, variant: 'success' },
    { id: 'revenue', title: 'Revenue Today', value: formatMoney(summaryApi?.todayRevenue || 0), icon: CurrencyRupeeRoundedIcon, variant: 'success' },
    { id: 'receivable', title: 'Receivable', value: formatMoney(summaryApi?.pendingPayments || 0), icon: CreditCardRoundedIcon, variant: 'warning' },
    { id: 'enquiry', title: 'Enquiry Today', value: summaryApi?.todayEnquiry ?? 0, icon: SupportAgentRoundedIcon, variant: 'primary' },
    { id: 'lowStock', title: 'Low Stock', value: lowStock.length, icon: Inventory2RoundedIcon, variant: lowStock.length ? 'danger' : 'success' },
  ], [lowStock.length, oldPendingOrders, opsSummary, summaryApi]);

  const loading = data?.isOrdersLoading || data?.isTasksLoading;

  return (
    <PageContainer>
      {(loading || summaryLoading || followupsLoading) ? <LinearProgress sx={{ borderRadius: 1, mb: 0.75 }} /> : null}
      {data?.loadError ? <ErrorState message={data.loadError} /> : null}

      <Card elevation={0} sx={{ borderRadius: 3, mb: 1, overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 1.2, md: 1.8 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={1.2}>
            <Box>
              <Typography variant="h5" fontWeight={900}>Business Dashboard</Typography>
              <Typography variant="body2" color="text.secondary">
                Live printing workflow, accounting alerts, dispatch, followups and stock — {new Date().toLocaleDateString('en-IN')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button variant="outlined" startIcon={<TuneRoundedIcon />} onClick={() => setDesignOpen(true)}>Dashboard Design</Button>
              <Button variant="contained" href="/orders/new">New Order</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={0.9} sx={{ mb: 0.9 }}>
        {summaryCards.filter((card) => designConfig.cards[card.id]).map((card) => (
          <Grid key={card.id} item xs={6} sm={4} md={3} lg={2}>
            <SummaryCard {...card} trend="" sx={{ '& .MuiCard-root, &': { borderRadius: 2 } }} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={0.9} sx={{ mb: 0.9 }}>
        <Grid item xs={12}>
          <DesignFilesWidget />
        </Grid>
      </Grid>

      <Grid container spacing={0.9} sx={{ mb: 0.9 }}>
        {designConfig.sections.attendance ? (
          <Grid item xs={12} lg={5}>
            <SectionCard title={roleInfo?.isAdmin ? 'Attendance' : 'My Attendance'} contentSx={{ p: 0.8 }}>
              {roleInfo?.isAdmin ? <AllAttandance /> : <UserTask />}
            </SectionCard>
          </Grid>
        ) : null}
        {designConfig.sections.assignedTasks ? (
          <Grid item xs={12} lg={designConfig.sections.attendance ? 7 : 12}>
            <SectionCard title={roleInfo?.isAdmin ? 'All Assigned Tasks' : 'My Assigned Tasks'} contentSx={{ p: 0.8 }}>
              {summaryLoading ? <LoadingState label="Loading assigned tasks" /> : (
                <SmallScrollableTable
                  columns={[{ key: 'task', label: 'Task' }, { key: 'type', label: 'Type' }, { key: 'user', label: 'User' }, { key: 'deadline', label: 'Deadline' }]}
                  rows={assignedTasks}
                  emptyLabel="No assigned tasks found."
                  maxHeight={280}
                  renderRow={(task) => (
                    <TableRow key={`${task?.source}-${task?.id}`} hover>
                      <TableCell><Typography variant="body2" fontWeight={600} noWrap>{task?.title || 'Untitled Task'}</Typography>{task?.subtitle ? <Typography variant="caption" color="text.secondary" noWrap>{task.subtitle}</Typography> : null}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{task?.source || '—'}</TableCell>
                      <TableCell>{task?.assignedTo || '—'}</TableCell>
                      <TableCell>{formatTaskDate(task?.dueDate)}</TableCell>
                    </TableRow>
                  )}
                />
              )}
            </SectionCard>
          </Grid>
        ) : null}
      </Grid>

      <Grid container spacing={0.9} sx={{ mb: 0.9 }}>
        {designConfig.sections.pendingOrders ? (
          <Grid item xs={12} lg={7}>
            <SectionCard title="Pending Orders" contentSx={{ p: 0.8 }}>
              {loading ? <LoadingState label="Loading pending orders" /> : <OrderList items={data?.myPendingOrders} emptyLabel={roleInfo?.isAdmin ? 'No pending orders available.' : 'No pending orders assigned.'} />}
            </SectionCard>
          </Grid>
        ) : null}
        {designConfig.sections.followups ? (
          <Grid item xs={12} lg={designConfig.sections.pendingOrders ? 5 : 12}>
            <SectionCard title="Payment Followups" contentSx={{ p: 0.8 }} action={<Button size="small" variant="outlined" startIcon={<ReceiptLongRoundedIcon fontSize="small" />} href="/accounts/followups" sx={{ minHeight: 30, px: 1 }}>Open</Button>}>
              {followupsLoading ? <LoadingState label="Loading payment followup" /> : (
                <SmallScrollableTable
                  columns={[{ key: 'customer', label: 'Customer' }, { key: 'amount', label: 'Amount', align: 'right' }, { key: 'date', label: 'Date' }]}
                  rows={followupRows}
                  emptyLabel="No overdue or near-term payment followups."
                  maxHeight={280}
                  renderRow={(item) => (
                    <TableRow key={item?.id} hover>
                      <TableCell><Typography variant="body2" fontWeight={600} noWrap>{item?.customerName || '—'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{item?.title || item?.remark || 'Follow-up'}</Typography></TableCell>
                      <TableCell align="right">{formatMoney(item?.amount)}</TableCell>
                      <TableCell>{formatFollowupDate(item?.followupDate)}</TableCell>
                    </TableRow>
                  )}
                />
              )}
            </SectionCard>
          </Grid>
        ) : null}
      </Grid>

      <Grid container spacing={0.9}>
        {roleInfo?.isAdmin && designConfig.sections.userWiseTasks ? (
          <Grid item xs={12} lg={designConfig.sections.lowStockTable ? 7 : 12}>
            <SectionCard title="User Wise Assigned Tasks" contentSx={{ p: 0.8 }}>
              {summaryLoading ? <LoadingState label="Loading user wise assigned task summary" /> : (
                <SmallScrollableTable
                  columns={[{ key: 'user', label: 'User' }, { key: 'group', label: 'Group' }, { key: 'orderTasks', label: 'Order', align: 'right' }, { key: 'userTasks', label: 'Usertask', align: 'right' }, { key: 'total', label: 'Total', align: 'right' }]}
                  rows={userWiseTaskRows}
                  emptyLabel="No pending assigned tasks found."
                  maxHeight={240}
                  renderRow={(row) => <TableRow key={row.user} hover><TableCell><Typography variant="body2" fontWeight={600} noWrap>{row.user}</Typography></TableCell><TableCell>{row.group || '—'}</TableCell><TableCell align="right">{row.orderTasks}</TableCell><TableCell align="right">{row.userTasks}</TableCell><TableCell align="right"><Chip size="small" label={row.total} color="primary" variant="outlined" sx={{ height: 22 }} /></TableCell></TableRow>}
                />
              )}
            </SectionCard>
          </Grid>
        ) : null}
        {designConfig.sections.lowStockTable ? (
          <Grid item xs={12} lg={roleInfo?.isAdmin && designConfig.sections.userWiseTasks ? 5 : 12}>
            <SectionCard title="Inventory — Low Stock" contentSx={{ p: 0.8 }}>
              <SmallScrollableTable
                columns={[{ key: 'item', label: 'Item' }, { key: 'qty', label: 'Current Qty', align: 'right' }, { key: 'reorder', label: 'Reorder', align: 'right' }, { key: 'status', label: 'Status' }]}
                rows={lowStock}
                emptyLabel="All stock levels are adequate."
                maxHeight={240}
                renderRow={(item) => <TableRow key={item.itemUuid} hover><TableCell>{item.itemName}</TableCell><TableCell align="right">{item.currentQty} {item.unit}</TableCell><TableCell align="right">{item.reorderLevel || 5}</TableCell><TableCell><Chip size="small" color="error" label="Low" /></TableCell></TableRow>}
              />
            </SectionCard>
          </Grid>
        ) : null}
      </Grid>

      <Fab color="primary" variant="extended" onClick={() => setUpiDialogOpen(true)} sx={{ position: 'fixed', right: { xs: 16, md: 78 }, bottom: { xs: 92, md: 28 }, zIndex: 1250, borderRadius: 999, px: 1.6, gap: 0.7 }}>
        <AddCardRoundedIcon fontSize="small" /> Add UPI
      </Fab>

      <Dialog open={upiDialogOpen} onClose={() => setUpiDialogOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ py: 1.2 }}>UPI Collections</DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1, md: 1.5 } }}><UpiCollectionSection /></DialogContent>
      </Dialog>

      <Drawer anchor="right" open={designOpen} onClose={() => setDesignOpen(false)} PaperProps={{ sx: { width: { xs: '92vw', sm: 420 }, p: 2 } }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h6" fontWeight={900}>Dashboard Design</Typography>
            <Typography variant="body2" color="text.secondary">Show or hide live cards/tables and change the frontend colour theme instantly.</Typography>
          </Box>
          <FormControl size="small" fullWidth>
            <InputLabel>Colour Theme</InputLabel>
            <Select label="Colour Theme" value={themeKey} onChange={(e) => setThemeKey(e.target.value)}>
              {Object.entries(themeOptions).map(([key, option]) => <MenuItem value={key} key={key}>{option.label}</MenuItem>)}
            </Select>
          </FormControl>
          <Divider />
          <Typography variant="subtitle2">Cards Section</Typography>
          {summaryCards.map((card) => <FormControlLabel key={card.id} control={<Switch checked={Boolean(designConfig.cards[card.id])} onChange={(e) => updateDesignConfig('cards', card.id, e.target.checked)} />} label={card.title} />)}
          <Divider />
          <Typography variant="subtitle2">Table / Panel Section</Typography>
          {[
            ['attendance', roleInfo?.isAdmin ? 'Attendance' : 'My Attendance'],
            ['assignedTasks', roleInfo?.isAdmin ? 'All Assigned Tasks' : 'My Assigned Tasks'],
            ['pendingOrders', 'Pending Orders'],
            ['followups', 'Payment Followups'],
            ['userWiseTasks', 'User Wise Assigned Tasks'],
            ['lowStockTable', 'Inventory — Low Stock'],
          ].map(([id, label]) => <FormControlLabel key={id} control={<Switch checked={Boolean(designConfig.sections[id])} onChange={(e) => updateDesignConfig('sections', id, e.target.checked)} />} label={label} />)}
          <Divider />
          <Button variant="outlined" onClick={resetDesign}>Reset Dashboard Design</Button>
        </Stack>
      </Drawer>
    </PageContainer>
  );
}
