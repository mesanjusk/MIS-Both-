import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { fetchTeamStatus, fetchOperationsDailyReport } from '../services/operationsService';
import { fetchPendingTasksOverview } from '../services/orderService';

const dayKey = (value) => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) : '';
};
const delay = (value) => {
  const hours = (Date.now() - new Date(value).getTime()) / 3600000;
  if (!value || !Number.isFinite(hours)) return 'No deadline';
  if (hours < 0) return 'Due today';
  return hours >= 24 ? `${Math.floor(hours / 24)}d late` : hours >= 1 ? `${Math.floor(hours)}h late` : `${Math.max(1, Math.floor(hours * 60))}m late`;
};

export default function TeamAttentionOverview({ onNavigate, canFollowUp = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([fetchPendingTasksOverview(), fetchTeamStatus(), fetchOperationsDailyReport()]);
    const value = (i) => results[i].status === 'fulfilled' ? results[i].value?.data : null;
    setData({ orders: value(0), team: value(1)?.result, daily: value(2)?.result });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (loading) return <LinearProgress />;
  const orders = data?.orders?.tasks;
  const team = data?.team;
  const today = dayKey(new Date());
  const orderRows = Array.isArray(orders) ? orders : [];
  const overdue = orderRows.filter((row) => row.overdue);
  const dueToday = orderRows.filter((row) => !row.overdue && dayKey(row.dueDate) === today);
  const unassigned = orderRows.filter((row) => row.assignedTo === 'Unassigned');
  const missing = !Array.isArray(orders) || !team || !data?.daily;
  const cards = [
    ['overdue', 'Overdue orders', Array.isArray(orders) ? overdue.length : '—', 'error.main'],
    ['today', 'Orders due today', Array.isArray(orders) ? dueToday.length : '—', 'warning.main'],
    ['unassigned', 'Unassigned orders', Array.isArray(orders) ? unassigned.length : '—', 'warning.main'],
    ['done', 'Tasks closed today*', data?.daily?.tasks?.completed ?? '—', 'success.main'],
  ];
  const issues = orderRows.filter((row) => row.overdue || row.assignedTo === 'Unassigned' || dayKey(row.dueDate) === today)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.assignedTo === 'Unassigned') - Number(a.assignedTo === 'Unassigned'))
    .filter((row) => filter === 'all' || (filter === 'overdue' && row.overdue) || (filter === 'today' && !row.overdue && dayKey(row.dueDate) === today) || (filter === 'unassigned' && row.assignedTo === 'Unassigned'));
  const owners = (team?.rows || []).filter((row) => row.overdue > 0);
  const unowned = team?.unownedTasks || [];
  const gaps = team?.escalated || [];
  return <Stack spacing={1.25}>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Box><Typography variant="h6" fontWeight={800}>Needs attention</Typography><Typography variant="body2" color="text.secondary">Start with delayed work and missing owners.</Typography></Box>
      <Button size="small" onClick={load}>Refresh</Button>
    </Stack>
    {missing && <Alert severity="warning">Some data could not load. Missing counts are shown as —. Refresh to retry.</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
      {cards.map(([id, label, count, color]) => <Paper key={id} variant="outlined" component="button" type="button" onClick={() => id === 'done' ? onNavigate('daily') : setFilter(filter === id ? 'all' : id)} sx={{ textAlign: 'left', p: 1.5, cursor: 'pointer', borderRadius: 2, borderColor: filter === id ? color : 'divider', bgcolor: 'background.paper' }}><Typography variant="h4" fontWeight={800} color={color}>{count}</Typography><Typography variant="body2" color="text.secondary">{label}</Typography></Paper>)}
    </Box>
    <Typography variant="caption" color="text.secondary">*Closed count refers to operational tasks scheduled for today, including cancelled tasks. Orders and operational tasks are counted separately.</Typography>
    <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.25 }}><Typography fontWeight={800}>Orders to follow up ({issues.length})</Typography>{filter !== 'all' && <Button size="small" onClick={() => setFilter('all')}>Show all</Button>}</Stack>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 580 }}><TableHead><TableRow><TableCell>Issue / order</TableCell><TableCell>Responsible</TableCell><TableCell>Delay</TableCell><TableCell>Action</TableCell></TableRow></TableHead><TableBody>
          {issues.slice(0, 20).map((row) => <TableRow hover key={row.orderId}><TableCell><Typography variant="body2" fontWeight={700}>{row.task || row.stage || 'Pending order'}</Typography><Typography variant="caption" color="text.secondary">#{row.orderNumber} · {row.customerName || row.sourceFile || 'Order'}</Typography></TableCell><TableCell>{row.assignedTo === 'Unassigned' ? <Chip size="small" color="warning" label="No owner" /> : row.assignedTo}</TableCell><TableCell><Typography variant="body2" color={row.overdue ? 'error.main' : 'text.secondary'}>{row.overdue ? delay(row.dueDate) : dayKey(row.dueDate) === today ? 'Due today' : 'Needs owner'}</Typography></TableCell><TableCell><Button size="small" onClick={() => onNavigate('orders', row.assignedTo)}>{row.assignedTo === 'Unassigned' ? 'Review' : 'Follow up'}</Button></TableCell></TableRow>)}
          {!issues.length && <TableRow><TableCell colSpan={4}><Typography color="text.secondary" variant="body2">{Array.isArray(orders) ? 'No matching order issues.' : 'Order data unavailable.'}</Typography></TableCell></TableRow>}
        </TableBody></Table>
      </Box>
      {issues.length > 20 && <Button size="small" onClick={() => onNavigate('orders')}>View all orders</Button>}
    </Paper>
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.25 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={800}>Team task issues</Typography><Button size="small" onClick={() => onNavigate('escalations')}>View details</Button></Stack>
      {owners.map((row) => <Stack key={row.User_uuid} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75 }}><Typography variant="body2">{row.name || row.User_name}</Typography><Stack direction="row" gap={0.5} alignItems="center"><Chip size="small" color="error" label={`${row.overdue} overdue tasks`} />{canFollowUp && !row.isVirtual && <Button size="small" onClick={() => onNavigate('whatsapp', row.User_uuid)}>Follow up</Button>}</Stack></Stack>)}
      {unowned.map((row) => <Stack key={row._id || row.Usertask_uuid} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75 }}><Typography variant="body2">{row.Usertask_name}</Typography><Chip size="small" color="warning" label="No owner" /></Stack>)}
      {gaps.map((row) => <Stack key={row.responsibility_uuid} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75 }}><Typography variant="body2">{row.name}</Typography><Button size="small" onClick={() => onNavigate('responsibilities')}>Check owner</Button></Stack>)}
      {!owners.length && !unowned.length && !gaps.length && <Typography variant="body2" color="text.secondary">{team ? 'No team task issues.' : 'Team data unavailable.'}</Typography>}
    </Paper>
  </Stack>;
}
