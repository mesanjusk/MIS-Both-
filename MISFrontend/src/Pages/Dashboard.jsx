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
  Avatar,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
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
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import CalendarTodayRoundedIcon from '@mui/icons-material/CalendarTodayRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import axios from '../apiClient';
import SummaryCard from '../Components/dashboard/SummaryCard';
import AllAttandance from './AllAttandance';
import UserTask from './userTask';
import { useDashboardData } from '../hooks/useDashboardData';
import { useUserRole } from '../hooks/useUserRole';
import { useThemeConfig } from '../context/ThemeConfigContext.jsx';
import {
  EmptyState,
  ErrorState,
  LoadingState,
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
const parseAmount = (value) => { const num = Number(value); return Number.isFinite(num) ? num : 0; };
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
  } catch { return DEFAULT_CONFIG; }
}
function saveConfig(config) { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }

/* ─── Section Panel ─────────────────────────────────────────────────────── */
function SectionPanel({ title, icon: Icon, action, children, accent = 'primary', noPad = false }) {
  return (
    <Card
      elevation={0}
      sx={(theme) => ({
        height: '100%',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2.5,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      })}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={(theme) => ({
          px: 2,
          py: 1.25,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: (t) => alpha(t.palette[accent]?.main || t.palette.primary.main, 0.04),
          minHeight: 52,
        })}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          {Icon ? (
            <Box
              sx={(theme) => ({
                width: 30,
                height: 30,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(theme.palette[accent]?.main || theme.palette.primary.main, 0.1),
                color: theme.palette[accent]?.main || theme.palette.primary.main,
              })}
            >
              <Icon sx={{ fontSize: 17 }} />
            </Box>
          ) : null}
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: 'text.primary' }}>
            {title}
          </Typography>
        </Stack>
        {action || null}
      </Stack>
      <Box sx={{ flex: 1, overflow: 'hidden', ...(noPad ? {} : { p: { xs: 1.25, md: 1.5 } }) }}>
        {children}
      </Box>
    </Card>
  );
}

/* ─── Order List ────────────────────────────────────────────────────────── */
function OrderList({ items, emptyLabel }) {
  if (!items?.length) return <EmptyState title={emptyLabel} />;
  return (
    <Stack spacing={0.75}>
      {items.map((order) => (
        <Box
          key={toId(order)}
          sx={(theme) => ({
            p: 1.25,
            borderRadius: 1.5,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
            transition: 'background-color 0.15s ease',
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
          })}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
              <Avatar
                sx={(theme) => ({
                  width: 32,
                  height: 32,
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  color: 'primary.main',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                })}
              >
                {(order?.Customer_name || order?.customerName || '?')[0].toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} noWrap>
                  {order?.Customer_name || order?.customerName || 'Unknown'}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  Order #{order?.Order_Number || '-'}
                </Typography>
              </Box>
            </Stack>
            <Chip
              label={order?.highestStatusTask?.Task || order?.stage || 'Other'}
              color="primary"
              size="small"
              variant="outlined"
              sx={{ borderRadius: 1, fontWeight: 600, fontSize: '0.68rem' }}
            />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

/* ─── Scrollable Table ──────────────────────────────────────────────────── */
function PanelTable({ columns, rows, emptyLabel, renderRow, maxHeight = 300 }) {
  return (
    <Box sx={{ maxHeight, overflow: 'auto' }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell
                key={col.key}
                align={col.align || 'left'}
                sx={(theme) => ({
                  whiteSpace: 'nowrap',
                  py: 1,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  bgcolor: alpha(theme.palette.background.default, 0.9),
                  color: 'text.secondary',
                  borderBottom: `2px solid ${theme.palette.divider}`,
                })}
              >
                {col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {!rows?.length ? (
            <TableRow>
              <TableCell colSpan={columns.length} align="center" sx={{ py: 4 }}>
                <Typography variant="body2" color="text.secondary">{emptyLabel}</Typography>
              </TableCell>
            </TableRow>
          ) : rows.map(renderRow)}
        </TableBody>
      </Table>
    </Box>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────────────────── */
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
  const resetDesign = () => { saveConfig(DEFAULT_CONFIG); setDesignConfig(DEFAULT_CONFIG); };

  useEffect(() => {
    let mounted = true;
    (async () => {
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
      } catch { if (mounted) setOpsSummary({ outstanding: {}, stuck: {}, cash: {} }); }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setSummaryLoading(true);
        const res = await axios.get('/api/dashboard/summary', {
          params: { userName: roleInfo?.userName || '', isAdmin: Boolean(roleInfo?.isAdmin), role: roleInfo?.role || '' },
        });
        if (mounted) setSummaryApi(res?.data?.result || {});
      } catch { if (mounted) setSummaryApi({}); }
      finally { if (mounted) setSummaryLoading(false); }
    })();
    return () => { mounted = false; };
  }, [roleInfo?.isAdmin, roleInfo?.role, roleInfo?.userName]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setFollowupsLoading(true);
      try {
        const res = await axios.get('/api/paymentfollowup/list');
        const apiRows = Array.isArray(res?.data?.result) ? res.data.result
          : Array.isArray(res?.data?.data) ? res.data.data
          : Array.isArray(res?.data) ? res.data : [];
        if (mounted) setFollowups(apiRows.map(normalizePaymentFollowup));
      } catch { if (mounted) setFollowups([]); }
      finally { if (mounted) setFollowupsLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const oldPendingOrders = useMemo(() => {
    const today = todayDateKey();
    return (data?.activeOrders || []).filter((order) => {
      const dt = normalizeDateValue(order?.highestStatusTask?.CreatedAt);
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
    { id: 'revenue', title: 'Revenue Today', value: formatMoney(summaryApi?.todayRevenue || 0), icon: TrendingUpRoundedIcon, variant: 'success' },
    { id: 'receivable', title: 'Receivable', value: formatMoney(summaryApi?.pendingPayments || 0), icon: CreditCardRoundedIcon, variant: 'warning' },
    { id: 'enquiry', title: 'Enquiry Today', value: summaryApi?.todayEnquiry ?? 0, icon: SupportAgentRoundedIcon, variant: 'primary' },
    { id: 'lowStock', title: 'Low Stock', value: lowStock.length, icon: Inventory2RoundedIcon, variant: lowStock.length ? 'danger' : 'success' },
  ], [lowStock.length, oldPendingOrders, opsSummary, summaryApi]);

  const loading = data?.isOrdersLoading || data?.isTasksLoading;
  const anyLoading = loading || summaryLoading || followupsLoading;

  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const visibleCards = summaryCards.filter((c) => designConfig.cards[c.id]);

  return (
    <Stack spacing={2} sx={{ px: { xs: 0.25, sm: 0.5 }, pb: 2, minWidth: 0 }}>

      {/* Loading bar */}
      {anyLoading ? <LinearProgress sx={{ borderRadius: 1, mx: -0.5 }} /> : null}
      {data?.loadError ? <ErrorState message={data.loadError} /> : null}

      {/* ── Header ───────────────────────────────────────────────────── */}
      <Card
        elevation={0}
        sx={(theme) => ({
          borderRadius: 2.5,
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 60%, ${alpha(theme.palette.primary.light, 0.85)} 100%)`,
          color: '#fff',
        })}
      >
        <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={1.5}
          >
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <DashboardRoundedIcon sx={{ fontSize: 26, color: '#fff' }} />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={900} sx={{ color: '#fff', lineHeight: 1.2 }}>
                  Business Dashboard
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.3 }}>
                  <CalendarTodayRoundedIcon sx={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
                    {todayLabel}
                  </Typography>
                </Stack>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                variant="outlined"
                startIcon={<TuneRoundedIcon />}
                onClick={() => setDesignOpen(true)}
                size="small"
                sx={{
                  color: '#fff',
                  borderColor: 'rgba(255,255,255,0.45)',
                  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                Customize
              </Button>
              <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                href="/orders/new"
                size="small"
                sx={{
                  bgcolor: '#fff',
                  color: 'primary.main',
                  fontWeight: 700,
                  '&:hover': { bgcolor: 'grey.100' },
                  boxShadow: 'none',
                }}
              >
                New Order
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      {visibleCards.length > 0 ? (
        <Grid container spacing={1.25}>
          {visibleCards.map((card) => (
            <Grid key={card.id} item xs={6} sm={4} md={3} lg={2}>
              <SummaryCard {...card} />
            </Grid>
          ))}
        </Grid>
      ) : null}

      {/* ── Design Files Widget ──────────────────────────────────────── */}
      <DesignFilesWidget />

      {/* ── Attendance + Assigned Tasks ───────────────────────────────── */}
      {(designConfig.sections.attendance || designConfig.sections.assignedTasks) ? (
        <Grid container spacing={1.5}>
          {designConfig.sections.attendance ? (
            <Grid item xs={12} lg={designConfig.sections.assignedTasks ? 5 : 12}>
              <SectionPanel
                title={roleInfo?.isAdmin ? 'Attendance Overview' : 'My Attendance'}
                icon={PeopleRoundedIcon}
                accent="primary"
              >
                {roleInfo?.isAdmin ? <AllAttandance /> : <UserTask />}
              </SectionPanel>
            </Grid>
          ) : null}
          {designConfig.sections.assignedTasks ? (
            <Grid item xs={12} lg={designConfig.sections.attendance ? 7 : 12}>
              <SectionPanel
                title={roleInfo?.isAdmin ? 'All Assigned Tasks' : 'My Assigned Tasks'}
                icon={AssignmentRoundedIcon}
                accent="primary"
                noPad
              >
                {summaryLoading ? (
                  <Box sx={{ p: 2 }}><LoadingState label="Loading assigned tasks" /></Box>
                ) : (
                  <PanelTable
                    columns={[
                      { key: 'task', label: 'Task' },
                      { key: 'type', label: 'Type' },
                      { key: 'user', label: 'User' },
                      { key: 'deadline', label: 'Deadline' },
                    ]}
                    rows={assignedTasks}
                    emptyLabel="No assigned tasks found."
                    maxHeight={300}
                    renderRow={(task) => (
                      <TableRow
                        key={`${task?.source}-${task?.id}`}
                        hover
                        sx={(theme) => ({ '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) } })}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap>{task?.title || 'Untitled Task'}</Typography>
                          {task?.subtitle ? <Typography variant="caption" color="text.secondary" noWrap>{task.subtitle}</Typography> : null}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={task?.source || '—'}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.68rem', height: 20, textTransform: 'capitalize', borderRadius: 1 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>{task?.assignedTo || '—'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                            {formatTaskDate(task?.dueDate)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  />
                )}
              </SectionPanel>
            </Grid>
          ) : null}
        </Grid>
      ) : null}

      {/* ── Pending Orders + Payment Followups ───────────────────────── */}
      {(designConfig.sections.pendingOrders || designConfig.sections.followups) ? (
        <Grid container spacing={1.5}>
          {designConfig.sections.pendingOrders ? (
            <Grid item xs={12} lg={designConfig.sections.followups ? 7 : 12}>
              <SectionPanel
                title="Pending Orders"
                icon={PendingActionsRoundedIcon}
                accent="warning"
              >
                {loading ? (
                  <LoadingState label="Loading pending orders" />
                ) : (
                  <Box sx={{ maxHeight: 340, overflow: 'auto' }}>
                    <OrderList
                      items={data?.myPendingOrders}
                      emptyLabel={roleInfo?.isAdmin ? 'No pending orders available.' : 'No pending orders assigned.'}
                    />
                  </Box>
                )}
              </SectionPanel>
            </Grid>
          ) : null}
          {designConfig.sections.followups ? (
            <Grid item xs={12} lg={designConfig.sections.pendingOrders ? 5 : 12}>
              <SectionPanel
                title="Payment Followups"
                icon={ReceiptLongRoundedIcon}
                accent="error"
                action={
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ReceiptLongRoundedIcon sx={{ fontSize: '14px !important' }} />}
                    href="/accounts/followups"
                    sx={{ fontSize: '0.72rem', py: 0.4, px: 1, minHeight: 28 }}
                  >
                    View All
                  </Button>
                }
                noPad
              >
                {followupsLoading ? (
                  <Box sx={{ p: 2 }}><LoadingState label="Loading payment followups" /></Box>
                ) : (
                  <PanelTable
                    columns={[
                      { key: 'customer', label: 'Customer' },
                      { key: 'amount', label: 'Amount', align: 'right' },
                      { key: 'date', label: 'Date' },
                    ]}
                    rows={followupRows}
                    emptyLabel="No overdue or near-term payment followups."
                    maxHeight={300}
                    renderRow={(item) => (
                      <TableRow
                        key={item?.id}
                        hover
                        sx={(theme) => ({ '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.04) } })}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap>{item?.customerName || '—'}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>{item?.title || item?.remark || 'Follow-up'}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} sx={(theme) => ({ color: theme.palette.error.main })}>
                            {formatMoney(item?.amount)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {formatFollowupDate(item?.followupDate)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  />
                )}
              </SectionPanel>
            </Grid>
          ) : null}
        </Grid>
      ) : null}

      {/* ── User Wise Tasks + Low Stock ───────────────────────────────── */}
      {(roleInfo?.isAdmin && designConfig.sections.userWiseTasks) || designConfig.sections.lowStockTable ? (
        <Grid container spacing={1.5}>
          {roleInfo?.isAdmin && designConfig.sections.userWiseTasks ? (
            <Grid item xs={12} lg={designConfig.sections.lowStockTable ? 7 : 12}>
              <SectionPanel
                title="User-Wise Assigned Tasks"
                icon={PeopleRoundedIcon}
                accent="success"
                noPad
              >
                {summaryLoading ? (
                  <Box sx={{ p: 2 }}><LoadingState label="Loading user wise task summary" /></Box>
                ) : (
                  <PanelTable
                    columns={[
                      { key: 'user', label: 'User' },
                      { key: 'group', label: 'Group' },
                      { key: 'orderTasks', label: 'Orders', align: 'right' },
                      { key: 'userTasks', label: 'Tasks', align: 'right' },
                      { key: 'total', label: 'Total', align: 'right' },
                    ]}
                    rows={userWiseTaskRows}
                    emptyLabel="No pending assigned tasks found."
                    maxHeight={260}
                    renderRow={(row) => (
                      <TableRow
                        key={row.user}
                        hover
                        sx={(theme) => ({ '&:hover': { bgcolor: alpha(theme.palette.success.main, 0.04) } })}
                      >
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Avatar
                              sx={(theme) => ({
                                width: 28,
                                height: 28,
                                bgcolor: alpha(theme.palette.success.main, 0.12),
                                color: 'success.main',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                              })}
                            >
                              {(row.user || '?')[0].toUpperCase()}
                            </Avatar>
                            <Typography variant="body2" fontWeight={700} noWrap>{row.user}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">{row.group || '—'}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">{row.orderTasks}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">{row.userTasks}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            size="small"
                            label={row.total}
                            color="success"
                            variant="outlined"
                            sx={{ height: 22, fontWeight: 800, borderRadius: 1 }}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  />
                )}
              </SectionPanel>
            </Grid>
          ) : null}
          {designConfig.sections.lowStockTable ? (
            <Grid item xs={12} lg={(roleInfo?.isAdmin && designConfig.sections.userWiseTasks) ? 5 : 12}>
              <SectionPanel
                title="Inventory — Low Stock"
                icon={Inventory2RoundedIcon}
                accent={lowStock.length ? 'error' : 'success'}
                noPad
              >
                <PanelTable
                  columns={[
                    { key: 'item', label: 'Item' },
                    { key: 'qty', label: 'Current Qty', align: 'right' },
                    { key: 'reorder', label: 'Reorder', align: 'right' },
                    { key: 'status', label: 'Status' },
                  ]}
                  rows={lowStock}
                  emptyLabel="All stock levels are adequate."
                  maxHeight={260}
                  renderRow={(item) => (
                    <TableRow key={item.itemUuid} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{item.itemName}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} sx={{ color: 'error.main' }}>
                          {item.currentQty} {item.unit}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">{item.reorderLevel || 5}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color="error"
                          label="Low Stock"
                          sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, borderRadius: 1 }}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                />
              </SectionPanel>
            </Grid>
          ) : null}
        </Grid>
      ) : null}

      {/* ── UPI FAB ───────────────────────────────────────────────────── */}
      <Fab
        color="primary"
        variant="extended"
        onClick={() => setUpiDialogOpen(true)}
        sx={{
          position: 'fixed',
          right: { xs: 16, md: 78 },
          bottom: { xs: 92, md: 28 },
          zIndex: 1250,
          borderRadius: 999,
          px: 2,
          gap: 0.75,
          fontWeight: 700,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}
      >
        <AddCardRoundedIcon fontSize="small" />
        Add UPI
      </Fab>

      {/* ── UPI Dialog ───────────────────────────────────────────────── */}
      <Dialog open={upiDialogOpen} onClose={() => setUpiDialogOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ py: 1.5, fontWeight: 700 }}>UPI Collections</DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1, md: 1.5 } }}>
          <UpiCollectionSection />
        </DialogContent>
      </Dialog>

      {/* ── Customize Drawer ─────────────────────────────────────────── */}
      <Drawer
        anchor="right"
        open={designOpen}
        onClose={() => setDesignOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '92vw', sm: 400 },
            p: 0,
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Drawer header */}
        <Box
          sx={(theme) => ({
            px: 2.5,
            py: 2,
            background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
            color: '#fff',
          })}
        >
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <TuneRoundedIcon sx={{ fontSize: 22 }} />
            <Box>
              <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#fff' }}>
                Customize Dashboard
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                Show / hide cards and sections
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
          <Stack spacing={2}>
            {/* Theme picker */}
            <FormControl size="small" fullWidth>
              <InputLabel>Colour Theme</InputLabel>
              <Select label="Colour Theme" value={themeKey} onChange={(e) => setThemeKey(e.target.value)}>
                {Object.entries(themeOptions).map(([key, option]) => (
                  <MenuItem value={key} key={key}>{option.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Divider />

            {/* Cards toggles */}
            <Box>
              <Typography variant="overline" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 1.2 }}>
                KPI Cards
              </Typography>
              <Stack sx={{ mt: 0.75 }}>
                {summaryCards.map((card) => (
                  <FormControlLabel
                    key={card.id}
                    control={
                      <Switch
                        size="small"
                        checked={Boolean(designConfig.cards[card.id])}
                        onChange={(e) => updateDesignConfig('cards', card.id, e.target.checked)}
                      />
                    }
                    label={<Typography variant="body2">{card.title}</Typography>}
                    sx={{ py: 0.25 }}
                  />
                ))}
              </Stack>
            </Box>

            <Divider />

            {/* Sections toggles */}
            <Box>
              <Typography variant="overline" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 1.2 }}>
                Sections
              </Typography>
              <Stack sx={{ mt: 0.75 }}>
                {[
                  ['attendance', roleInfo?.isAdmin ? 'Attendance Overview' : 'My Attendance'],
                  ['assignedTasks', roleInfo?.isAdmin ? 'All Assigned Tasks' : 'My Assigned Tasks'],
                  ['pendingOrders', 'Pending Orders'],
                  ['followups', 'Payment Followups'],
                  ['userWiseTasks', 'User-Wise Assigned Tasks'],
                  ['lowStockTable', 'Inventory — Low Stock'],
                ].map(([id, label]) => (
                  <FormControlLabel
                    key={id}
                    control={
                      <Switch
                        size="small"
                        checked={Boolean(designConfig.sections[id])}
                        onChange={(e) => updateDesignConfig('sections', id, e.target.checked)}
                      />
                    }
                    label={<Typography variant="body2">{label}</Typography>}
                    sx={{ py: 0.25 }}
                  />
                ))}
              </Stack>
            </Box>

            <Divider />
            <Button variant="outlined" color="inherit" onClick={resetDesign} fullWidth>
              Reset to Default
            </Button>
          </Stack>
        </Box>
      </Drawer>
    </Stack>
  );
}
