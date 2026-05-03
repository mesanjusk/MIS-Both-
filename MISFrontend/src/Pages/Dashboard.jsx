import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
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
import { alpha } from '@mui/material/styles';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import axios from '../apiClient';
import SummaryCard from '../Components/dashboard/SummaryCard';
import AllAttandance from './AllAttandance';
import UserTask from './userTask';
import { useDashboardData } from '../hooks/useDashboardData';
import { useUserRole } from '../hooks/useUserRole';
import { useThemeConfig } from '../context/ThemeConfigContext.jsx';
import { EmptyState, ErrorState, LoadingState } from '../Components/ui';
import UpiCollectionSection from '../Components/dashboard/UpiCollectionSection';
import DesignFilesWidget from '../Components/dashboard/DesignFilesWidget';
import { useDashboardCustomize } from './Layout';

/* ─── Config ───────────────────────────────────────────────────────────── */
const CONFIG_KEY = 'mis_dashboard_design_config_v2';
const PANEL_SIZES_KEY = 'mis_resize_sizes_v1';
const CARD_IDS = ['outstanding', 'readyStuck', 'deliveredUnpaid', 'cash', 'newOrders', 'oldPending', 'delivery', 'revenue', 'receivable', 'enquiry', 'lowStock'];
const SECTION_IDS = ['attendance', 'assignedTasks', 'pendingOrders', 'followups', 'userWiseTasks', 'lowStockTable'];
const DEFAULT_CONFIG = {
  cards: CARD_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
  sections: SECTION_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */
const toId = (o) => o?.Order_uuid || o?._id || o?.Order_id;
const todayDateKey = () => new Date().toISOString().split('T')[0];
const parseAmount = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const formatMoney = (v) => `₹${parseAmount(v).toLocaleString('en-IN')}`;
const normalizeDateValue = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const formatTaskDate = (v) => {
  const d = normalizeDateValue(v);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
};
const formatFollowupDate = (v) => {
  const d = normalizeDateValue(v);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};
const isOverdueOrSoon = (v, days = 3) => {
  const d = normalizeDateValue(v);
  if (!d) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  end.setHours(23, 59, 59, 999);
  return d < start || (d >= start && d <= end);
};
const normalizeFollowup = (item = {}) => {
  const followupDate = item?.followup_date || item?.Followup_date || item?.FollowupDate || item?.deadline || item?.Deadline || item?.date || item?.Date || null;
  return {
    id: item?._id || item?.followup_uuid || `${item?.customer_name || 'fu'}-${followupDate || 'na'}`,
    customerName: item?.customer_name || item?.Customer_name || item?.Customer || '',
    amount: Number(item?.amount ?? item?.Amount ?? 0),
    title: item?.title || item?.Title || '',
    remark: item?.remark || item?.Remark || '',
    followupDate,
    status: item?.status || item?.Status || 'pending',
  };
};

function readConfig() {
  try {
    const s = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return {
      cards: { ...DEFAULT_CONFIG.cards, ...(s.cards || {}) },
      sections: { ...DEFAULT_CONFIG.sections, ...(s.sections || {}) },
    };
  } catch { return DEFAULT_CONFIG; }
}
const saveConfig = (c) => localStorage.setItem(CONFIG_KEY, JSON.stringify(c));

/* ─── Resize hook ───────────────────────────────────────────────────────── */
function loadSizes() { try { return JSON.parse(localStorage.getItem(PANEL_SIZES_KEY)) || {}; } catch { return {}; } }
function saveSizes(key, w) { localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify({ ...loadSizes(), [key]: w })); }

function useResizableRow(rowKey, count) {
  const [weights, setWeights] = useState(() => {
    const s = loadSizes()[rowKey];
    return (s && s.length === count) ? s : Array(count).fill(1);
  });
  const ref = useRef(null);

  const startDrag = useCallback((idx) => (e) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const totalW = el.getBoundingClientRect().width;
    const startX = e.clientX;
    const base = [...weights];
    const total = base.reduce((a, b) => a + b, 0);
    const onMove = (ev) => {
      const dw = ((ev.clientX - startX) / totalW) * total;
      setWeights((prev) => {
        const next = [...prev];
        next[idx] = Math.max(0.15, base[idx] + dw);
        next[idx + 1] = Math.max(0.15, base[idx + 1] - dw);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setWeights((cur) => { saveSizes(rowKey, cur); return cur; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [rowKey, weights]);

  return { weights, ref, startDrag };
}

/* ─── Resize handle ─────────────────────────────────────────────────────── */
function ResizeHandle({ onMouseDown }) {
  return (
    <Box
      onMouseDown={onMouseDown}
      sx={{
        width: 8,
        flexShrink: 0,
        cursor: 'col-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        '&:hover .bar, &:active .bar': { bgcolor: 'primary.main', opacity: 0.5 },
      }}
    >
      <Box className="bar" sx={{ width: 3, height: 32, borderRadius: 2, bgcolor: 'divider', transition: 'background-color 0.15s' }} />
    </Box>
  );
}

/* ─── Section panel ─────────────────────────────────────────────────────── */
function SectionPanel({ title, icon: Icon, action, children, accent = 'primary', noPad = false }) {
  return (
    <Card
      elevation={0}
      sx={(t) => ({
        height: '100%',
        border: `1px solid ${t.palette.divider}`,
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
        sx={(t) => ({
          px: 1.75,
          py: 0.9,
          borderBottom: `1px solid ${t.palette.divider}`,
          bgcolor: alpha(t.palette[accent]?.main || t.palette.primary.main, 0.04),
          minHeight: 44,
          flexShrink: 0,
        })}
      >
        <Stack direction="row" alignItems="center" spacing={0.85}>
          {Icon ? (
            <Box sx={(t) => ({
              width: 26, height: 26, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: alpha(t.palette[accent]?.main || t.palette.primary.main, 0.1),
              color: t.palette[accent]?.main || t.palette.primary.main,
            })}>
              <Icon sx={{ fontSize: 15 }} />
            </Box>
          ) : null}
          <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.8rem' }}>
            {title}
          </Typography>
        </Stack>
        {action || null}
      </Stack>
      <Box sx={{ flex: 1, overflow: 'auto', ...(noPad ? {} : { p: 1.25 }) }}>
        {children}
      </Box>
    </Card>
  );
}

/* ─── Order list ────────────────────────────────────────────────────────── */
function OrderList({ items, emptyLabel }) {
  if (!items?.length) return <EmptyState title={emptyLabel} />;
  return (
    <Stack spacing={0.6}>
      {items.map((o) => (
        <Box key={toId(o)} sx={(t) => ({
          p: 1, borderRadius: 1.5, border: `1px solid ${t.palette.divider}`,
          '&:hover': { bgcolor: alpha(t.palette.primary.main, 0.04) },
        })}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
              <Avatar sx={(t) => ({ width: 26, height: 26, bgcolor: alpha(t.palette.primary.main, 0.1), color: 'primary.main', fontSize: '0.68rem', fontWeight: 800 })}>
                {(o?.Customer_name || o?.customerName || '?')[0].toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} noWrap sx={{ fontSize: '0.76rem' }}>
                  {o?.Customer_name || o?.customerName || 'Unknown'}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>#{o?.Order_Number || '-'}</Typography>
              </Box>
            </Stack>
            <Chip label={o?.highestStatusTask?.Task || o?.stage || 'Other'} color="primary" size="small" variant="outlined"
              sx={{ borderRadius: 1, fontWeight: 600, fontSize: '0.63rem', height: 18 }} />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

/* ─── Panel table ───────────────────────────────────────────────────────── */
function PanelTable({ columns, rows, emptyLabel, renderRow }) {
  return (
    <Table stickyHeader size="small">
      <TableHead>
        <TableRow>
          {columns.map((col) => (
            <TableCell key={col.key} align={col.align || 'left'} sx={(t) => ({
              whiteSpace: 'nowrap', py: 0.65, fontSize: '0.65rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 0.4,
              bgcolor: alpha(t.palette.background.default, 0.95),
              color: 'text.secondary', borderBottom: `2px solid ${t.palette.divider}`,
            })}>
              {col.label}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {!rows?.length ? (
          <TableRow>
            <TableCell colSpan={columns.length} align="center" sx={{ py: 3 }}>
              <Typography variant="body2" color="text.secondary">{emptyLabel}</Typography>
            </TableCell>
          </TableRow>
        ) : rows.map(renderRow)}
      </TableBody>
    </Table>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const roleInfo = useUserRole();
  const { themeKey, setThemeKey, themeOptions } = useThemeConfig();
  const ctx = useDashboardCustomize();

  /* State */
  const [summaryApi, setSummaryApi] = useState({});
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [followups, setFollowups] = useState([]);
  const [followupsLoading, setFollowupsLoading] = useState(true);
  const [designConfig, setDesignConfig] = useState(readConfig);
  const [opsSummary, setOpsSummary] = useState({ outstanding: {}, stuck: {}, cash: {} });
  const [stockItems, setStockItems] = useState([]);
  const [designFilesExpanded, setDesignFilesExpanded] = useState(false);

  /* Customize drawer — synced with layout context */
  const designOpen = ctx ? ctx.customizeOpen : false;
  const openDesign = useCallback(() => ctx?.openCustomize?.(), [ctx]);
  const closeDesign = useCallback(() => ctx?.closeCustomize?.(), [ctx]);

  /* UPI dialog — synced with layout context */
  const upiOpen = ctx ? ctx.upiOpen : false;
  const closeUpi = useCallback(() => ctx?.closeUpi?.(), [ctx]);

  const data = useDashboardData({ role: roleInfo?.role, userName: roleInfo?.userName, isAdmin: roleInfo?.isAdmin });

  const updateDesignConfig = (type, id, checked) =>
    setDesignConfig((prev) => { const next = { ...prev, [type]: { ...prev[type], [id]: checked } }; saveConfig(next); return next; });
  const resetDesign = () => { saveConfig(DEFAULT_CONFIG); setDesignConfig(DEFAULT_CONFIG); };

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const [outR, stuckR, cashR, stockR] = await Promise.all([
          axios.get('/api/dashboard/outstanding-summary').catch(() => ({ data: {} })),
          axios.get('/api/dashboard/stuck-orders').catch(() => ({ data: {} })),
          axios.get('/api/dashboard/cash-book-summary').catch(() => ({ data: {} })),
          axios.get('/api/stock/summary').catch(() => ({ data: { items: [] } })),
        ]);
        if (!ok) return;
        setOpsSummary({ outstanding: outR?.data || {}, stuck: stuckR?.data || {}, cash: cashR?.data || {} });
        setStockItems(Array.isArray(stockR?.data?.items) ? stockR.data.items : []);
      } catch { if (ok) setOpsSummary({ outstanding: {}, stuck: {}, cash: {} }); }
    })();
    return () => { ok = false; };
  }, []);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        setSummaryLoading(true);
        const res = await axios.get('/api/dashboard/summary', {
          params: { userName: roleInfo?.userName || '', isAdmin: Boolean(roleInfo?.isAdmin), role: roleInfo?.role || '' },
        });
        if (ok) setSummaryApi(res?.data?.result || {});
      } catch { if (ok) setSummaryApi({}); }
      finally { if (ok) setSummaryLoading(false); }
    })();
    return () => { ok = false; };
  }, [roleInfo?.isAdmin, roleInfo?.role, roleInfo?.userName]);

  useEffect(() => {
    let ok = true;
    (async () => {
      setFollowupsLoading(true);
      try {
        const res = await axios.get('/api/paymentfollowup/list');
        const rows = Array.isArray(res?.data?.result) ? res.data.result : Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : [];
        if (ok) setFollowups(rows.map(normalizeFollowup));
      } catch { if (ok) setFollowups([]); }
      finally { if (ok) setFollowupsLoading(false); }
    })();
    return () => { ok = false; };
  }, []);

  /* Derived data */
  const oldPendingOrders = useMemo(() => {
    const today = todayDateKey();
    return (data?.activeOrders || []).filter((o) => {
      const d = normalizeDateValue(o?.highestStatusTask?.CreatedAt);
      return !d || d.toISOString().split('T')[0] !== today;
    }).length;
  }, [data?.activeOrders]);

  const lowStock = useMemo(() => stockItems.filter((i) => Number(i.currentQty || 0) <= Number(i.reorderLevel || 5)), [stockItems]);
  const assignedTasks = useMemo(() => Array.isArray(summaryApi?.assignedTasks) ? summaryApi.assignedTasks : [], [summaryApi]);
  const followupRows = useMemo(() => (followups || []).filter((i) => isOverdueOrSoon(i?.followupDate, 3))
    .sort((a, b) => (normalizeDateValue(a?.followupDate)?.getTime() || 0) - (normalizeDateValue(b?.followupDate)?.getTime() || 0)), [followups]);
  const userWiseTaskRows = useMemo(() => Array.isArray(summaryApi?.userWiseAssignedTasks) ? summaryApi.userWiseAssignedTasks : [], [summaryApi]);

  const summaryCards = useMemo(() => [
    { id: 'outstanding', title: 'Outstanding', value: formatMoney(opsSummary?.outstanding?.totalOutstandingAmount || opsSummary?.outstanding?.totalOutstanding || 0), icon: CurrencyRupeeRoundedIcon, variant: 'danger' },
    { id: 'readyStuck', title: 'Ready Stuck', value: opsSummary?.stuck?.readyNotDelivered?.length || 0, icon: LocalShippingRoundedIcon, variant: 'warning' },
    { id: 'deliveredUnpaid', title: 'Unpaid Dlvrd', value: opsSummary?.stuck?.deliveredNotPaid?.length || 0, icon: CreditCardRoundedIcon, variant: 'warning' },
    { id: 'cash', title: 'Cash Balance', value: formatMoney(opsSummary?.cash?.closingBalance || 0), icon: ReceiptLongRoundedIcon, variant: 'success' },
    { id: 'newOrders', title: 'New Orders', value: summaryApi?.todayOrdersCount ?? 0, icon: AssignmentRoundedIcon, variant: 'primary' },
    { id: 'oldPending', title: 'Old Pending', value: oldPendingOrders, icon: AutorenewRoundedIcon, variant: 'warning' },
    { id: 'delivery', title: 'Delivery Today', value: summaryApi?.todayDelivery ?? 0, icon: LocalShippingRoundedIcon, variant: 'success' },
    { id: 'revenue', title: 'Revenue Today', value: formatMoney(summaryApi?.todayRevenue || 0), icon: TrendingUpRoundedIcon, variant: 'success' },
    { id: 'receivable', title: 'Receivable', value: formatMoney(summaryApi?.pendingPayments || 0), icon: CreditCardRoundedIcon, variant: 'warning' },
    { id: 'enquiry', title: 'Enquiry Today', value: summaryApi?.todayEnquiry ?? 0, icon: SupportAgentRoundedIcon, variant: 'primary' },
    { id: 'lowStock', title: 'Low Stock', value: lowStock.length, icon: Inventory2RoundedIcon, variant: lowStock.length ? 'danger' : 'success' },
  ], [lowStock.length, oldPendingOrders, opsSummary, summaryApi]);

  const anyLoading = (data?.isOrdersLoading || data?.isTasksLoading) || summaryLoading || followupsLoading;
  const visibleCards = summaryCards.filter((c) => designConfig.cards[c.id]);

  /* Resize rows */
  const row1 = useResizableRow('row1', 2);
  const row2 = useResizableRow('row2', 2);
  const row3 = useResizableRow('row3', 2);

  const showRow1 = designConfig.sections.attendance || designConfig.sections.assignedTasks;
  const showRow2 = designConfig.sections.pendingOrders || designConfig.sections.followups;
  const showRow3 = (roleInfo?.isAdmin && designConfig.sections.userWiseTasks) || designConfig.sections.lowStockTable;

  const PANEL_ROW_HEIGHT = 240;
  const PANEL_GAP = 8;

  return (
    <Box sx={{ px: { xs: 0.5, sm: 0.75 }, pb: 2, minWidth: 0 }}>

      {/* ── Loading ─────────────────────────────────────────────────── */}
      {anyLoading ? <LinearProgress sx={{ borderRadius: 1, mb: 1 }} /> : null}
      {data?.loadError ? <ErrorState message={data.loadError} /> : null}

      {/* ── Compact header ──────────────────────────────────────────── */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25, px: 0.25 }}>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box sx={{ width: 32, height: 32, borderRadius: 1.75, bgcolor: (t) => alpha(t.palette.primary.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
            <DashboardRoundedIcon sx={{ fontSize: 17 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.15 }}>Business Dashboard</Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </Typography>
          </Box>
        </Stack>
        <Button size="small" variant="outlined" startIcon={<TuneRoundedIcon sx={{ fontSize: '14px !important' }} />}
          onClick={openDesign}
          sx={{ fontSize: '0.72rem', py: 0.35, px: 1.1, minHeight: 28, borderRadius: 1.5, textTransform: 'none' }}>
          Customize
        </Button>
      </Stack>

      {/* ── KPI Cards ───────────────────────────────────────────────── */}
      {visibleCards.length > 0 ? (
        <Grid container spacing={0.85} sx={{ mb: 1.25 }}>
          {visibleCards.map((card) => (
            <Grid key={card.id} item xs={6} sm={4} md={3} lg={2}>
              <SummaryCard {...card} />
            </Grid>
          ))}
        </Grid>
      ) : null}

      {/* ── Design Files — collapsible accordion strip ───────────────── */}
      <Box
        sx={(t) => ({
          mb: 1.25,
          border: `1px solid ${t.palette.divider}`,
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        })}
      >
        <ButtonBase
          onClick={() => setDesignFilesExpanded((p) => !p)}
          sx={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.75,
            py: 0.85,
            '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.04) },
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <FolderOpenRoundedIcon sx={{ fontSize: 17, color: 'primary.main' }} />
            <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.8rem' }}>
              Design Files — Today
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Chip size="small" label="Click to expand" variant="outlined"
              sx={{ fontSize: '0.62rem', height: 18, borderRadius: 1, display: designFilesExpanded ? 'none' : 'flex' }} />
            {designFilesExpanded
              ? <ExpandLessRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              : <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
          </Stack>
        </ButtonBase>
        <Collapse in={designFilesExpanded} timeout="auto">
          <Divider />
          <DesignFilesWidget />
        </Collapse>
      </Box>

      {/* ── Panel rows ──────────────────────────────────────────────── */}
      <Stack spacing={`${PANEL_GAP}px`}>

        {/* Row 1: Attendance | Assigned Tasks */}
        {showRow1 ? (
          <Box ref={row1.ref} sx={{ display: 'flex', height: PANEL_ROW_HEIGHT, alignItems: 'stretch' }}>
            {designConfig.sections.attendance ? (
              <Box sx={{ flex: designConfig.sections.assignedTasks ? row1.weights[0] : 1, minWidth: 0 }}>
                <SectionPanel title={roleInfo?.isAdmin ? 'Attendance Overview' : 'My Attendance'} icon={PeopleRoundedIcon} accent="primary">
                  {roleInfo?.isAdmin ? <AllAttandance /> : <UserTask />}
                </SectionPanel>
              </Box>
            ) : null}
            {designConfig.sections.attendance && designConfig.sections.assignedTasks ? (
              <ResizeHandle onMouseDown={row1.startDrag(0)} />
            ) : null}
            {designConfig.sections.assignedTasks ? (
              <Box sx={{ flex: designConfig.sections.attendance ? row1.weights[1] : 1, minWidth: 0 }}>
                <SectionPanel title={roleInfo?.isAdmin ? 'All Assigned Tasks' : 'My Tasks'} icon={AssignmentRoundedIcon} accent="primary" noPad>
                  {summaryLoading ? <Box sx={{ p: 2 }}><LoadingState label="Loading tasks" /></Box> : (
                    <PanelTable
                      columns={[{ key: 't', label: 'Task' }, { key: 'ty', label: 'Type' }, { key: 'u', label: 'User' }, { key: 'd', label: 'Due' }]}
                      rows={assignedTasks}
                      emptyLabel="No assigned tasks."
                      renderRow={(task) => (
                        <TableRow key={`${task?.source}-${task?.id}`} hover sx={(t) => ({ '&:hover': { bgcolor: alpha(t.palette.primary.main, 0.04) } })}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: '0.76rem' }}>{task?.title || 'Untitled'}</Typography>
                            {task?.subtitle ? <Typography variant="caption" color="text.secondary" noWrap>{task.subtitle}</Typography> : null}
                          </TableCell>
                          <TableCell><Chip label={task?.source || '—'} size="small" variant="outlined" sx={{ fontSize: '0.62rem', height: 16, borderRadius: 1 }} /></TableCell>
                          <TableCell><Typography variant="body2" noWrap sx={{ fontSize: '0.76rem' }}>{task?.assignedTo || '—'}</Typography></TableCell>
                          <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{formatTaskDate(task?.dueDate)}</Typography></TableCell>
                        </TableRow>
                      )}
                    />
                  )}
                </SectionPanel>
              </Box>
            ) : null}
          </Box>
        ) : null}

        {/* Row 2: Pending Orders | Payment Followups */}
        {showRow2 ? (
          <Box ref={row2.ref} sx={{ display: 'flex', height: PANEL_ROW_HEIGHT, alignItems: 'stretch' }}>
            {designConfig.sections.pendingOrders ? (
              <Box sx={{ flex: designConfig.sections.followups ? row2.weights[0] : 1, minWidth: 0 }}>
                <SectionPanel title="Pending Orders" icon={PendingActionsRoundedIcon} accent="warning">
                  {data?.isOrdersLoading ? <LoadingState label="Loading orders" /> : (
                    <OrderList items={data?.myPendingOrders} emptyLabel={roleInfo?.isAdmin ? 'No pending orders.' : 'No orders assigned.'} />
                  )}
                </SectionPanel>
              </Box>
            ) : null}
            {designConfig.sections.pendingOrders && designConfig.sections.followups ? (
              <ResizeHandle onMouseDown={row2.startDrag(0)} />
            ) : null}
            {designConfig.sections.followups ? (
              <Box sx={{ flex: designConfig.sections.pendingOrders ? row2.weights[1] : 1, minWidth: 0 }}>
                <SectionPanel title="Payment Followups" icon={ReceiptLongRoundedIcon} accent="error" noPad
                  action={<Button size="small" variant="outlined" href="/accounts/followups" sx={{ fontSize: '0.65rem', py: 0.25, px: 0.75, minHeight: 22 }}>View All</Button>}
                >
                  {followupsLoading ? <Box sx={{ p: 2 }}><LoadingState label="Loading followups" /></Box> : (
                    <PanelTable
                      columns={[{ key: 'c', label: 'Customer' }, { key: 'a', label: 'Amount', align: 'right' }, { key: 'd', label: 'Date' }]}
                      rows={followupRows}
                      emptyLabel="No overdue followups."
                      renderRow={(item) => (
                        <TableRow key={item?.id} hover sx={(t) => ({ '&:hover': { bgcolor: alpha(t.palette.error.main, 0.04) } })}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: '0.76rem' }}>{item?.customerName || '—'}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>{item?.title || item?.remark || 'Follow-up'}</Typography>
                          </TableCell>
                          <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={(t) => ({ color: t.palette.error.main, fontSize: '0.76rem' })}>{formatMoney(item?.amount)}</Typography></TableCell>
                          <TableCell><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{formatFollowupDate(item?.followupDate)}</Typography></TableCell>
                        </TableRow>
                      )}
                    />
                  )}
                </SectionPanel>
              </Box>
            ) : null}
          </Box>
        ) : null}

        {/* Row 3: User-Wise Tasks | Low Stock */}
        {showRow3 ? (
          <Box ref={row3.ref} sx={{ display: 'flex', height: PANEL_ROW_HEIGHT, alignItems: 'stretch' }}>
            {roleInfo?.isAdmin && designConfig.sections.userWiseTasks ? (
              <Box sx={{ flex: designConfig.sections.lowStockTable ? row3.weights[0] : 1, minWidth: 0 }}>
                <SectionPanel title="User-Wise Tasks" icon={PeopleRoundedIcon} accent="success" noPad>
                  {summaryLoading ? <Box sx={{ p: 2 }}><LoadingState label="Loading" /></Box> : (
                    <PanelTable
                      columns={[{ key: 'u', label: 'User' }, { key: 'g', label: 'Group' }, { key: 'o', label: 'Orders', align: 'right' }, { key: 't', label: 'Tasks', align: 'right' }, { key: 'tot', label: 'Total', align: 'right' }]}
                      rows={userWiseTaskRows}
                      emptyLabel="No pending tasks."
                      renderRow={(row) => (
                        <TableRow key={row.user} hover sx={(t) => ({ '&:hover': { bgcolor: alpha(t.palette.success.main, 0.04) } })}>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={0.75}>
                              <Avatar sx={(t) => ({ width: 22, height: 22, bgcolor: alpha(t.palette.success.main, 0.12), color: 'success.main', fontSize: '0.6rem', fontWeight: 800 })}>{(row.user || '?')[0].toUpperCase()}</Avatar>
                              <Typography variant="body2" fontWeight={700} noWrap sx={{ fontSize: '0.76rem' }}>{row.user}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell><Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.76rem' }}>{row.group || '—'}</Typography></TableCell>
                          <TableCell align="right"><Typography variant="body2" sx={{ fontSize: '0.76rem' }}>{row.orderTasks}</Typography></TableCell>
                          <TableCell align="right"><Typography variant="body2" sx={{ fontSize: '0.76rem' }}>{row.userTasks}</Typography></TableCell>
                          <TableCell align="right"><Chip size="small" label={row.total} color="success" variant="outlined" sx={{ height: 18, fontWeight: 800, borderRadius: 1, fontSize: '0.65rem' }} /></TableCell>
                        </TableRow>
                      )}
                    />
                  )}
                </SectionPanel>
              </Box>
            ) : null}
            {roleInfo?.isAdmin && designConfig.sections.userWiseTasks && designConfig.sections.lowStockTable ? (
              <ResizeHandle onMouseDown={row3.startDrag(0)} />
            ) : null}
            {designConfig.sections.lowStockTable ? (
              <Box sx={{ flex: (roleInfo?.isAdmin && designConfig.sections.userWiseTasks) ? row3.weights[1] : 1, minWidth: 0 }}>
                <SectionPanel title="Low Stock Inventory" icon={Inventory2RoundedIcon} accent={lowStock.length ? 'error' : 'success'} noPad>
                  <PanelTable
                    columns={[{ key: 'i', label: 'Item' }, { key: 'q', label: 'Qty', align: 'right' }, { key: 'r', label: 'Reorder', align: 'right' }, { key: 's', label: 'Status' }]}
                    rows={lowStock}
                    emptyLabel="All stock adequate."
                    renderRow={(item) => (
                      <TableRow key={item.itemUuid} hover>
                        <TableCell><Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.76rem' }}>{item.itemName}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: 'error.main', fontSize: '0.76rem' }}>{item.currentQty} {item.unit}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.76rem' }}>{item.reorderLevel || 5}</Typography></TableCell>
                        <TableCell><Chip size="small" color="error" label="Low" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700, borderRadius: 1 }} /></TableCell>
                      </TableRow>
                    )}
                  />
                </SectionPanel>
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Stack>

      {/* ── UPI Dialog (triggered via SpeedDial through context) ─────── */}
      <Dialog open={Boolean(upiOpen)} onClose={closeUpi} fullWidth maxWidth="lg">
        <DialogTitle sx={{ py: 1.5, fontWeight: 700 }}>UPI Collections</DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 1, md: 1.5 } }}>
          <UpiCollectionSection />
        </DialogContent>
      </Dialog>

      {/* ── Customize Drawer ────────────────────────────────────────── */}
      <Drawer
        anchor="right"
        open={designOpen}
        onClose={closeDesign}
        PaperProps={{ sx: { width: { xs: '92vw', sm: 380 }, display: 'flex', flexDirection: 'column' } }}
      >
        {/* Drawer header */}
        <Box sx={(t) => ({
          px: 2.5, py: 2,
          background: `linear-gradient(135deg, ${t.palette.primary.dark}, ${t.palette.primary.main})`,
          color: '#fff',
          flexShrink: 0,
        })}>
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <TuneRoundedIcon sx={{ fontSize: 20 }} />
            <Box>
              <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#fff' }}>Customize Dashboard</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)' }}>
                Show / hide cards · drag handles to resize panels
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
          <Stack spacing={2}>
            {/* Pastel theme picker */}
            <Box>
              <Typography variant="overline" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 1.1, fontSize: '0.68rem' }}>
                Colour Theme
              </Typography>
              <Stack direction="row" flexWrap="wrap" spacing={0.75} sx={{ mt: 1 }}>
                {Object.entries(themeOptions).map(([key, option]) => (
                  <Box
                    key={key}
                    onClick={() => setThemeKey(key)}
                    sx={(t) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1.25,
                      py: 0.6,
                      borderRadius: 2,
                      border: `2px solid`,
                      borderColor: themeKey === key ? t.palette.primary.main : t.palette.divider,
                      bgcolor: themeKey === key ? alpha(t.palette.primary.main, 0.08) : 'background.default',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      '&:hover': { borderColor: t.palette.primary.main },
                    })}
                  >
                    <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: option.primary || 'primary.main', flexShrink: 0 }} />
                    <Typography variant="body2" fontWeight={themeKey === key ? 700 : 500} sx={{ fontSize: '0.78rem' }}>
                      {option.label}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>

            <Divider />

            {/* KPI card toggles */}
            <Box>
              <Typography variant="overline" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 1.1, fontSize: '0.68rem' }}>KPI Cards</Typography>
              <Stack sx={{ mt: 0.75 }}>
                {summaryCards.map((card) => (
                  <FormControlLabel key={card.id}
                    control={<Switch size="small" checked={Boolean(designConfig.cards[card.id])} onChange={(e) => updateDesignConfig('cards', card.id, e.target.checked)} />}
                    label={<Typography variant="body2">{card.title}</Typography>}
                    sx={{ py: 0.2 }}
                  />
                ))}
              </Stack>
            </Box>

            <Divider />

            {/* Section toggles */}
            <Box>
              <Typography variant="overline" fontWeight={800} color="text.secondary" sx={{ letterSpacing: 1.1, fontSize: '0.68rem' }}>Sections</Typography>
              <Stack sx={{ mt: 0.75 }}>
                {[
                  ['attendance', roleInfo?.isAdmin ? 'Attendance Overview' : 'My Attendance'],
                  ['assignedTasks', roleInfo?.isAdmin ? 'All Assigned Tasks' : 'My Tasks'],
                  ['pendingOrders', 'Pending Orders'],
                  ['followups', 'Payment Followups'],
                  ['userWiseTasks', 'User-Wise Tasks'],
                  ['lowStockTable', 'Low Stock Inventory'],
                ].map(([id, label]) => (
                  <FormControlLabel key={id}
                    control={<Switch size="small" checked={Boolean(designConfig.sections[id])} onChange={(e) => updateDesignConfig('sections', id, e.target.checked)} />}
                    label={<Typography variant="body2">{label}</Typography>}
                    sx={{ py: 0.2 }}
                  />
                ))}
              </Stack>
            </Box>

            <Divider />
            <Button variant="outlined" color="inherit" onClick={resetDesign} fullWidth size="small">Reset to Default</Button>
          </Stack>
        </Box>
      </Drawer>
    </Box>
  );
}
