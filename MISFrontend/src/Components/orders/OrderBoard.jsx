import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Avatar, Box, Button, Card, CardContent, Chip, Divider,
  Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';

const GROUPS = [
  { title: 'New Orders',    keys: ['enquiry', 'quoted', 'approved'], color: '#6366f1' },
  { title: 'In Design',     keys: ['design'],                        color: '#0ea5e9' },
  { title: 'Printing',      keys: ['printing'],                      color: '#f59e0b' },
  { title: 'Post Printing', keys: ['post_printing', 'finishing'],    color: '#8b5cf6' },
  { title: 'Ready',         keys: ['ready'],                         color: '#10b981' },
  { title: 'Delivered',     keys: ['delivered', 'paid'],             color: '#22c55e' },
];

const NEXT_STAGE = {
  enquiry: 'design', quoted: 'approved', approved: 'design',
  design: 'printing', printing: 'post_printing',
  post_printing: 'finishing', finishing: 'ready',
  ready: 'delivered', delivered: 'paid',
};

const normalize  = (v = '') => String(v || '').toLowerCase().replace(/[\s_-]/g, '');
const idOf       = (o) => o.Order_uuid || o._id || o.Order_id;
const money      = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

function dueStatus(date) {
  if (!date) return { label: 'No due date', color: 'default', rank: 9 };
  const d = new Date(date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  if (target < today) return { label: d.toLocaleDateString('en-IN'), color: 'error',   rank: 0 };
  if (target.getTime() === today.getTime()) return { label: 'Today', color: 'warning', rank: 1 };
  return { label: d.toLocaleDateString('en-IN'), color: 'success', rank: 2 };
}

function OrderCard({ order, onView, onMove, isDragging, dragHandlers, onTouchSelect, touchSelected }) {
  const theme = useTheme();
  const cardRef = useRef(null);
  const stage = normalize(order?.stage || order?.highestStatusTask?.Task || 'enquiry');
  const due = dueStatus(order?.dueDate || order?.highestStatusTask?.Delivery_Date);
  const items = Array.isArray(order?.Items) ? order.Items : [];
  const summary = items.slice(0, 2).map((i) => i.Item).filter(Boolean).join(', ') || order?.orderNote || order?.Remark || '—';
  const extra = items.length > 2 ? ` +${items.length - 2}` : '';
  const initials = String(order?.assignedToName || order?.highestStatusTask?.Assigned || 'NA').slice(0, 2).toUpperCase();
  const isTouchSel = touchSelected === idOf(order);
  const nextStage = NEXT_STAGE[stage];

  return (
    <Card
      ref={cardRef}
      draggable
      onDragStart={(e) => dragHandlers?.onDragStart?.(idOf(order), stage, e)}
      onClick={() => onView?.(order)}
      sx={{
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        border: isTouchSel
          ? `2px solid ${theme.palette.primary.main}`
          : `1px solid ${theme.palette.divider}`,
        boxShadow: isTouchSel
          ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.18)}`
          : '0 1px 4px rgba(15,23,42,0.06)',
        transition: 'opacity 0.15s, box-shadow 0.15s, border-color 0.15s',
        userSelect: 'none',
        borderLeft: `4px solid ${due.color === 'error' ? '#ef4444' : due.color === 'warning' ? '#f59e0b' : '#3b82f6'}`,
        '&:hover': { boxShadow: '0 3px 12px rgba(15,23,42,0.1)' },
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        {/* Header row */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={900} noWrap>
              #{order.Order_Number || '—'}
            </Typography>
            <Typography variant="body2" color="text.secondary" fontWeight={600} noWrap>
              {order.Customer_name || 'Unknown'}
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <DragIndicatorRoundedIcon sx={{ fontSize: 16, color: 'text.disabled', cursor: 'grab' }} />
          </Stack>
        </Stack>

        {/* Summary */}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}{extra}
        </Typography>

        {/* Due + Amount + Avatar */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.25 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <AccessTimeRoundedIcon sx={{ fontSize: 12, color: `${due.color}.main` }} />
            <Typography variant="caption" color={`${due.color}.main`} fontWeight={700}>
              {due.label}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Typography variant="caption" fontWeight={900}>
              {money(order.Amount || order.saleSubtotal)}
            </Typography>
            <Avatar sx={{ width: 22, height: 22, bgcolor: 'primary.main', fontSize: 9, fontWeight: 800 }}>
              {initials}
            </Avatar>
          </Stack>
        </Stack>

        {/* Actions */}
        <Stack direction="row" spacing={0.75} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
          {nextStage && (
            <Button
              size="small"
              variant="contained"
              endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 12 }} />}
              onClick={(e) => { e.stopPropagation(); onMove?.(order, nextStage); }}
              sx={{ fontSize: '0.68rem', py: 0.4, px: 1.2, minHeight: 26 }}
            >
              Move
            </Button>
          )}
          {/* Mobile: tap to select for DnD */}
          <Button
            size="small"
            variant={isTouchSel ? 'contained' : 'outlined'}
            color={isTouchSel ? 'primary' : 'inherit'}
            onClick={(e) => { e.stopPropagation(); onTouchSelect?.(idOf(order)); }}
            sx={{ fontSize: '0.68rem', py: 0.4, px: 1.2, minHeight: 26, display: { xs: 'flex', md: 'none' } }}
          >
            {isTouchSel ? 'Selected' : 'Select'}
          </Button>
          {order?.Mobile_number && (
            <Tooltip title={`Call ${order.Customer_name}`}>
              <Button
                size="small"
                variant="outlined"
                component="a"
                href={`tel:${order.Mobile_number}`}
                onClick={(e) => e.stopPropagation()}
                sx={{ fontSize: '0.68rem', py: 0.4, px: 1, minHeight: 26, minWidth: 0 }}
              >
                <PhoneRoundedIcon sx={{ fontSize: 13 }} />
              </Button>
            </Tooltip>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function KanbanColumn({ group, orders, dragHandlers, onView, onMove, touchSelected, onTouchSelect, onTouchDrop, draggingId }) {
  const theme = useTheme();
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback((e) => {
    setDragOver(false);
    dragHandlers?.onDrop?.(e, group.keys[0], true);
  }, [dragHandlers, group.keys]);

  const isTouchTarget = Boolean(touchSelected);

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => isTouchTarget && onTouchDrop?.(group.keys[0])}
      sx={{
        minWidth: { xs: 240, sm: 220 },
        width: { xs: 240, sm: 'auto' },
        flex: { xs: '0 0 240px', sm: '1 1 0' },
        borderRadius: 3,
        border: '2px solid',
        borderColor: dragOver
          ? 'primary.main'
          : isTouchTarget
          ? alpha(theme.palette.primary.main, 0.4)
          : 'divider',
        bgcolor: dragOver
          ? alpha(theme.palette.primary.main, 0.06)
          : isTouchTarget
          ? alpha(theme.palette.primary.main, 0.03)
          : alpha(group.color, 0.04),
        transition: 'border-color 0.15s, background-color 0.15s',
        cursor: isTouchTarget ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Column header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 1.5, py: 1,
          bgcolor: alpha(group.color, 0.1),
          borderBottom: `2px solid ${alpha(group.color, 0.2)}`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: group.color }} />
          <Typography variant="caption" fontWeight={800} sx={{ color: group.color }}>
            {group.title}
          </Typography>
        </Stack>
        <Chip
          size="small"
          label={orders.length}
          sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800, bgcolor: alpha(group.color, 0.15), color: group.color }}
        />
      </Stack>

      {/* Drop hint when touch-selecting */}
      {isTouchTarget && (
        <Box sx={{ px: 1.5, py: 0.75, bgcolor: alpha(theme.palette.primary.main, 0.08), textAlign: 'center' }}>
          <Typography variant="caption" color="primary" fontWeight={700}>
            Tap column to drop here
          </Typography>
        </Box>
      )}

      {/* Cards */}
      <Stack spacing={1} sx={{ p: 1.25, flex: 1, overflowY: 'auto', minHeight: 80 }}>
        {orders.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{ p: 2, textAlign: 'center', borderStyle: 'dashed', borderRadius: 2 }}
          >
            <Typography variant="caption" color="text.disabled">No orders</Typography>
          </Paper>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={idOf(order)}
              order={order}
              onView={onView}
              onMove={onMove}
              isDragging={draggingId === idOf(order)}
              dragHandlers={dragHandlers}
              touchSelected={touchSelected}
              onTouchSelect={onTouchSelect}
            />
          ))
        )}
      </Stack>
    </Box>
  );
}

function OrderBoard({ columnOrder, groupedOrders, onView, onMove, dragHandlers, statusMessage }) {
  const [myOnly, setMyOnly]           = useState(false);
  const [overdueFirst, setOverdueFirst] = useState(true);
  const [touchSelected, setTouchSelected] = useState(null);
  const [draggingId, setDraggingId]   = useState(null);
  const theme = useTheme();
  const userName = localStorage.getItem('User_name') || '';

  const allOrders = useMemo(() => Object.values(groupedOrders || {}).flat(), [groupedOrders]);

  const filtered = useMemo(() => {
    let rows = [...allOrders];
    if (myOnly) rows = rows.filter((o) => String(o?.highestStatusTask?.Assigned || o?.assignedToName || '').toLowerCase() === userName.toLowerCase());
    if (overdueFirst) rows.sort((a, b) => dueStatus(a.dueDate || a?.highestStatusTask?.Delivery_Date).rank - dueStatus(b.dueDate || b?.highestStatusTask?.Delivery_Date).rank);
    return rows;
  }, [allOrders, myOnly, overdueFirst, userName]);

  const overdue  = filtered.filter((o) => dueStatus(o.dueDate || o?.highestStatusTask?.Delivery_Date).rank === 0).length;
  const dueToday = filtered.filter((o) => dueStatus(o.dueDate || o?.highestStatusTask?.Delivery_Date).rank === 1).length;

  const enhancedDragHandlers = useMemo(() => ({
    onDragStart: (id, stage, e) => {
      setDraggingId(id);
      dragHandlers?.onDragStart?.(id, stage, e);
    },
    onDrop: (e, targetKey, allow) => {
      setDraggingId(null);
      dragHandlers?.onDrop?.(e, targetKey, allow);
    },
    onDragOver: dragHandlers?.onDragOver,
  }), [dragHandlers]);

  const handleDragEnd = useCallback(() => setDraggingId(null), []);

  const handleTouchSelect = useCallback((id) => {
    setTouchSelected((prev) => (prev === id ? null : id));
  }, []);

  const handleTouchDrop = useCallback((targetStageKey) => {
    if (!touchSelected) return;
    onMove?.({ Order_uuid: touchSelected, _id: touchSelected, Order_id: touchSelected }, targetStageKey);
    setTouchSelected(null);
  }, [touchSelected, onMove]);

  const columns = GROUPS.map((g) => ({
    ...g,
    orders: filtered.filter((o) => g.keys.includes(normalize(o.stage || o?.highestStatusTask?.Task || 'enquiry'))),
  }));

  return (
    <Box onDragEnd={handleDragEnd}>
      {/* Stats bar */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5} flexWrap="wrap">
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" fontWeight={700}>Total: {filtered.length}</Typography>
            {overdue > 0 && <Chip size="small" label={`${overdue} Overdue`} color="error" variant="outlined" />}
            {dueToday > 0 && <Chip size="small" label={`${dueToday} Due Today`} color="warning" variant="outlined" />}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant={myOnly ? 'contained' : 'outlined'}
              onClick={() => setMyOnly((p) => !p)}
              sx={{ fontSize: '0.75rem' }}
            >
              My Orders
            </Button>
            <Button
              size="small"
              variant={overdueFirst ? 'contained' : 'outlined'}
              color={overdueFirst ? 'warning' : 'inherit'}
              onClick={() => setOverdueFirst((p) => !p)}
              sx={{ fontSize: '0.75rem' }}
            >
              Overdue First
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Mobile touch DnD hint */}
      {touchSelected && (
        <Paper sx={{ p: 1.25, mb: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.08), textAlign: 'center' }}>
          <Typography variant="body2" color="primary" fontWeight={700}>
            Order selected — tap a column header to move it there
          </Typography>
          <Button size="small" onClick={() => setTouchSelected(null)} sx={{ mt: 0.5 }}>Cancel</Button>
        </Paper>
      )}

      {/* Kanban columns */}
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          pb: 2,
          alignItems: 'flex-start',
          minHeight: 200,
        }}
      >
        {columns.map((group) => (
          <KanbanColumn
            key={group.title}
            group={group}
            orders={group.orders}
            dragHandlers={enhancedDragHandlers}
            onView={onView}
            onMove={(order, stage) => onMove?.(order, stage)}
            touchSelected={touchSelected}
            onTouchSelect={handleTouchSelect}
            onTouchDrop={handleTouchDrop}
            draggingId={draggingId}
          />
        ))}
      </Box>

      {/* Status message for screen readers */}
      <Box aria-live="polite" sx={{ position: 'absolute', left: -9999 }}>{statusMessage}</Box>
    </Box>
  );
}

export default React.memo(OrderBoard);
