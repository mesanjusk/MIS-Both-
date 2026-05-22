import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ArrowForwardIosRoundedIcon from '@mui/icons-material/ArrowForwardIosRounded';
import axios from '../apiClient';
import SummaryCard from '../Components/dashboard/SummaryCard';
import { useDashboardData } from '../hooks/useDashboardData';
import { useUserRole } from '../hooks/useUserRole';
import { ErrorState, LoadingState } from '../Components/ui';

/* ─── Helpers ───────────────────────────────────────────────────────────── */
const parseAmount = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const formatMoney = (v) => `₹${parseAmount(v).toLocaleString('en-IN')}`;
const todayKey = () => new Date().toISOString().split('T')[0];

function daysDiff(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
}

/* ─── Attention item ────────────────────────────────────────────────────── */
function AttentionItem({ order, onOpen }) {
  const days = daysDiff(order?.highestStatusTask?.CreatedAt);
  const label = days === null ? 'Unknown' : days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
  const isOverdue = days !== null && days > 1;

  return (
    <Box
      sx={(t) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        py: 1,
        borderRadius: 1.5,
        border: `1px solid ${t.palette.divider}`,
        '&:hover': { bgcolor: alpha(t.palette.warning.main, 0.05), cursor: 'pointer' },
      })}
      onClick={() => onOpen?.(order)}
    >
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
        <Avatar
          sx={(t) => ({
            width: 30,
            height: 30,
            bgcolor: alpha(t.palette.warning.main, 0.12),
            color: 'warning.dark',
            fontSize: '0.72rem',
            fontWeight: 800,
          })}
        >
          {(order?.Customer_name || '?')[0].toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap sx={{ fontSize: '0.8rem' }}>
            #{order?.Order_Number} · {order?.Customer_name || 'Unknown'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Stage: {order?.highestStatusTask?.Task || '—'}
          </Typography>
        </Box>
      </Stack>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexShrink: 0 }}>
        <Chip
          size="small"
          label={label}
          color={isOverdue ? 'error' : 'default'}
          variant={isOverdue ? 'filled' : 'outlined'}
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, borderRadius: 1 }}
        />
        <ArrowForwardIosRoundedIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
      </Stack>
    </Box>
  );
}

/* ─── Pipeline pill ─────────────────────────────────────────────────────── */
function PipelinePill({ stage, count }) {
  return (
    <Box
      sx={(t) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.1,
        py: 0.4,
        borderRadius: 2,
        border: `1px solid ${t.palette.divider}`,
        bgcolor: count > 0 ? alpha(t.palette.primary.main, 0.06) : 'background.default',
      })}
    >
      <Typography variant="caption" fontWeight={600} color={count > 0 ? 'primary' : 'text.disabled'} sx={{ fontSize: '0.72rem' }}>
        {stage}
      </Typography>
      <Typography variant="caption" fontWeight={800} color={count > 0 ? 'primary.dark' : 'text.disabled'} sx={{ fontSize: '0.72rem' }}>
        ({count})
      </Typography>
    </Box>
  );
}

/* ─── Section card ──────────────────────────────────────────────────────── */
function Section({ title, icon: Icon, action, children, accent = 'warning' }) {
  return (
    <Card
      elevation={0}
      sx={(t) => ({
        border: `1px solid ${t.palette.divider}`,
        borderRadius: 2.5,
        overflow: 'hidden',
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
          minHeight: 42,
        })}
      >
        <Stack direction="row" alignItems="center" spacing={0.85}>
          {Icon ? (
            <Box
              sx={(t) => ({
                width: 26,
                height: 26,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(t.palette[accent]?.main || t.palette.primary.main, 0.1),
                color: t.palette[accent]?.main || t.palette.primary.main,
              })}
            >
              <Icon sx={{ fontSize: 15 }} />
            </Box>
          ) : null}
          <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.82rem' }}>
            {title}
          </Typography>
        </Stack>
        {action || null}
      </Stack>
      <Box sx={{ p: 1.25 }}>
        {children}
      </Box>
    </Card>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────────────────── */
const PIPELINE_STAGES = ['Enquiry', 'Quoted', 'Approved', 'Design', 'Printing', 'Post-Print', 'Ready', 'Delivered'];

export default function Dashboard() {
  const roleInfo = useUserRole();
  const data = useDashboardData({ role: roleInfo?.role, userName: roleInfo?.userName, isAdmin: roleInfo?.isAdmin });

  const [summaryApi, setSummaryApi] = useState({});
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [opsSummary, setOpsSummary] = useState({ outstanding: {}, stuck: {}, cash: {} });

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const [outR, stuckR, cashR] = await Promise.all([
          axios.get('/api/dashboard/outstanding-summary').catch(() => ({ data: {} })),
          axios.get('/api/dashboard/stuck-orders').catch(() => ({ data: {} })),
          axios.get('/api/dashboard/cash-book-summary').catch(() => ({ data: {} })),
        ]);
        if (ok) setOpsSummary({ outstanding: outR?.data || {}, stuck: stuckR?.data || {}, cash: cashR?.data || {} });
      } catch { /* silently ignore */ }
    })();
    return () => { ok = false; };
  }, []);

  useEffect(() => {
    let ok = true;
    (async () => {
      setSummaryLoading(true);
      try {
        const res = await axios.get('/api/dashboard/summary', {
          params: { userName: roleInfo?.userName || '', isAdmin: Boolean(roleInfo?.isAdmin), role: roleInfo?.role || '' },
        });
        if (ok) setSummaryApi(res?.data?.result || {});
      } catch { if (ok) setSummaryApi({}); }
      finally { if (ok) setSummaryLoading(false); }
    })();
    return () => { ok = false; };
  }, [roleInfo?.isAdmin, roleInfo?.role, roleInfo?.userName]);

  /* Attention list — active orders stuck more than 1 day */
  const attentionOrders = useMemo(() => {
    const today = todayKey();
    return (data?.activeOrders || [])
      .filter((o) => {
        const d = o?.highestStatusTask?.CreatedAt;
        return !d || new Date(d).toISOString().split('T')[0] !== today;
      })
      .slice(0, 5);
  }, [data?.activeOrders]);

  /* Pipeline stage counts */
  const pipelineCounts = useMemo(() => {
    const counts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.toLowerCase(), 0]));
    (data?.activeOrders || []).forEach((o) => {
      const stage = (o?.highestStatusTask?.Task || '').trim().toLowerCase();
      if (counts[stage] !== undefined) counts[stage]++;
    });
    return counts;
  }, [data?.activeOrders]);

  const anyLoading = data?.isOrdersLoading || data?.isTasksLoading || summaryLoading;

  const kpiCards = [
    { id: 'newOrders', title: 'New Today', value: summaryApi?.todayOrdersCount ?? 0, icon: AssignmentRoundedIcon, variant: 'primary' },
    { id: 'ready', title: 'Ready', value: opsSummary?.stuck?.readyNotDelivered?.length ?? 0, icon: LocalShippingRoundedIcon, variant: 'success' },
    { id: 'collected', title: 'Collected Today', value: formatMoney(summaryApi?.todayRevenue || 0), icon: CurrencyRupeeRoundedIcon, variant: 'success' },
    { id: 'overdue', title: 'Overdue', value: attentionOrders.length, icon: WarningAmberRoundedIcon, variant: attentionOrders.length > 0 ? 'danger' : 'success' },
    { id: 'pending', title: 'Pending Payment', value: formatMoney(summaryApi?.pendingPayments || 0), icon: CreditCardRoundedIcon, variant: opsSummary?.stuck?.deliveredNotPaid?.length > 0 ? 'danger' : 'warning' },
  ];

  return (
    <Box sx={{ px: { xs: 0.5, sm: 0.75 }, pb: 2, minWidth: 0 }}>
      {anyLoading ? <LinearProgress sx={{ borderRadius: 1, mb: 1 }} /> : null}
      {data?.loadError ? <ErrorState message={data.loadError} /> : null}

      {/* ── Header ──────────────────────────────────────────────────── */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5, px: 0.25 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.15 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {roleInfo?.isAdmin ? 'Business overview' : `Showing tasks for ${roleInfo?.userName || 'you'}`}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          href="/orders/add"
          sx={{ fontSize: '0.74rem', py: 0.45, px: 1.4, minHeight: 30, borderRadius: 1.5, textTransform: 'none' }}
        >
          + New Order
        </Button>
      </Stack>

      {/* ── 5 KPI tiles ─────────────────────────────────────────────── */}
      <Grid container spacing={0.9} sx={{ mb: 1.5 }}>
        {kpiCards.map((card) => (
          <Grid key={card.id} item xs={6} sm={4} md={2.4}>
            <SummaryCard {...card} />
          </Grid>
        ))}
      </Grid>

      {/* ── Two-column layout ────────────────────────────────────────── */}
      <Grid container spacing={1.25}>
        {/* Needs Attention */}
        <Grid item xs={12} md={6}>
          <Section title="Needs Attention" icon={WarningAmberRoundedIcon} accent="warning"
            action={
              <Button size="small" variant="outlined" href="/orders" sx={{ fontSize: '0.65rem', py: 0.25, px: 0.75, minHeight: 22 }}>
                View All
              </Button>
            }
          >
            {data?.isOrdersLoading ? (
              <LoadingState label="Loading orders" />
            ) : attentionOrders.length === 0 ? (
              <Stack alignItems="center" py={2.5}>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>All orders are on track</Typography>
              </Stack>
            ) : (
              <Stack spacing={0.7}>
                {attentionOrders.map((o) => (
                  <AttentionItem key={o?.Order_uuid || o?._id} order={o} />
                ))}
              </Stack>
            )}
          </Section>
        </Grid>

        {/* Today's Pipeline */}
        <Grid item xs={12} md={6}>
          <Section title="Today's Pipeline" icon={AssignmentRoundedIcon} accent="primary">
            {data?.isOrdersLoading ? (
              <LoadingState label="Loading pipeline" />
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {PIPELINE_STAGES.map((stage) => (
                  <PipelinePill key={stage} stage={stage} count={pipelineCounts[stage.toLowerCase()] || 0} />
                ))}
              </Box>
            )}
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Total active: <strong>{data?.activeOrders?.length ?? 0}</strong>
                {' · '}
                Delivered today: <strong>{summaryApi?.todayDelivery ?? 0}</strong>
                {' · '}
                Enquiries today: <strong>{summaryApi?.todayEnquiry ?? 0}</strong>
              </Typography>
            </Box>
          </Section>
        </Grid>
      </Grid>
    </Box>
  );
}
