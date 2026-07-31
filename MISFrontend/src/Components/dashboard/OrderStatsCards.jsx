import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, List, ListItem, ListItemIcon, ListItemText, Checkbox, Chip,
  CircularProgress, Menu, MenuItem, Button, TextField, Divider, Tooltip,
} from '@mui/material';
import { isToday } from 'date-fns';
import toast from 'react-hot-toast';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import SummaryCard from './SummaryCard';
import { useOrdersData, statusApi } from '../../hooks/useOrdersData';

const orderKey = (order) => order?.Order_uuid || order?._id || order?.Order_id;

const isTodayDate = (value) => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && isToday(date);
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const STAGE_VARIANTS = ['primary', 'success', 'warning', 'danger'];

export default function OrderStatsCards() {
  const { orderList, baseGroupedOrders, tasksMeta, isOrdersLoading, patchOrder } = useOrdersData();
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkTarget, setBulkTarget] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  const [rowMenu, setRowMenu] = useState({ anchor: null, order: null });

  const stageOptions = useMemo(() => tasksMeta.map((s) => s.name), [tasksMeta]);

  const openDialog = (card) => {
    setSelected(card);
    setSelectedIds([]);
    setBulkTarget('');
  };
  const closeDialog = () => {
    setSelected(null);
    setSelectedIds([]);
    setBulkTarget('');
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleSelectAll = () => {
    const allIds = (selected?.orders || []).map(orderKey).filter(Boolean);
    setSelectedIds((prev) => (prev.length === allIds.length ? [] : allIds));
  };

  const moveOrders = async (ids, targetStage) => {
    if (!ids.length || !targetStage) return;
    setIsMoving(true);
    try {
      await Promise.all(ids.map((id) => statusApi.updateStatus(id, targetStage)));
      const movedAt = new Date().toISOString();
      ids.forEach((id) => patchOrder(id, { highestStatusTask: { Task: targetStage, CreatedAt: movedAt } }));
      setSelected((prev) => prev && ({
        ...prev,
        orders: prev.orders.filter((o) => !ids.includes(orderKey(o))),
        value: Math.max(0, prev.value - ids.length),
      }));
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      setBulkTarget('');
      toast.success(`Moved ${ids.length} order${ids.length > 1 ? 's' : ''} to ${targetStage}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to move order(s).');
    } finally {
      setIsMoving(false);
    }
  };

  const openRowMenu = (event, order) => setRowMenu({ anchor: event.currentTarget, order });
  const closeRowMenu = () => setRowMenu({ anchor: null, order: null });
  const handleRowMove = (stage) => {
    const order = rowMenu.order;
    closeRowMenu();
    if (order) moveOrders([orderKey(order)], stage);
  };

  const newOrders = useMemo(
    () => orderList.filter((o) => isTodayDate(o?.highestStatusTask?.CreatedAt)),
    [orderList]
  );
  const oldOrders = useMemo(
    () => orderList.filter((o) => !isTodayDate(o?.highestStatusTask?.CreatedAt)),
    [orderList]
  );

  const cards = useMemo(() => {
    const base = [
      { id: 'today', title: "Today's New", value: newOrders.length, orders: newOrders, icon: AddShoppingCartRoundedIcon, variant: 'primary' },
      { id: 'old', title: 'Old Pending', value: oldOrders.length, orders: oldOrders, icon: HistoryRoundedIcon, variant: 'warning' },
    ];
    const stageCards = tasksMeta.map((stage, i) => ({
      id: stage.name,
      title: stage.name,
      value: (baseGroupedOrders[stage.name] || []).length,
      orders: baseGroupedOrders[stage.name] || [],
      icon: LayersRoundedIcon,
      variant: STAGE_VARIANTS[i % STAGE_VARIANTS.length],
    }));
    return [...base, ...stageCards];
  }, [newOrders, oldOrders, tasksMeta, baseGroupedOrders]);

  if (isOrdersLoading && orderList.length === 0) {
    return (
      <Stack alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={20} />
      </Stack>
    );
  }

  return (
    <Box sx={{ px: { xs: 1, md: 1.5 }, pb: 1.5, flexShrink: 0 }}>
      <Stack
        direction="row"
        spacing={{ xs: 0.75, md: 1 }}
        sx={{
          overflowX: { xs: 'auto', md: 'hidden' },
          flexWrap: 'nowrap',
          WebkitOverflowScrolling: 'touch',
          pb: 0.5,
          '&::-webkit-scrollbar': { height: 6 },
        }}
      >
        {cards.map((card) => (
          <Box key={card.id} sx={{ minWidth: { xs: 92, md: 0 }, flex: { xs: '0 0 auto', md: '1 1 0' } }}>
            <SummaryCard
              title={card.title}
              value={card.value}
              icon={card.icon}
              variant={card.variant}
              onClick={() => openDialog(card)}
            />
          </Box>
        ))}
      </Stack>

      <Dialog open={!!selected} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {selected?.title} <Typography component="span" variant="body2" color="text.secondary">({selected?.value})</Typography>
          </Typography>
          <IconButton size="small" onClick={closeDialog}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        {selected?.orders?.length > 0 && stageOptions.length > 0 && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            sx={{ px: 2, py: 1, bgcolor: 'rgba(240,253,244,0.6)' }}
          >
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flex: 1 }}>
              <Checkbox
                size="small"
                checked={selectedIds.length > 0 && selectedIds.length === selected.orders.length}
                indeterminate={selectedIds.length > 0 && selectedIds.length < selected.orders.length}
                onChange={toggleSelectAll}
              />
              <Typography variant="caption" color="text.secondary">
                {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
              </Typography>
            </Stack>
            <TextField
              select
              size="small"
              label="Move to stage"
              value={bulkTarget}
              onChange={(e) => setBulkTarget(e.target.value)}
              disabled={selectedIds.length === 0 || isMoving}
              sx={{ minWidth: 160 }}
            >
              {stageOptions.map((name) => (
                <MenuItem key={name} value={name}>{name}</MenuItem>
              ))}
            </TextField>
            <Button
              size="small"
              variant="contained"
              disabled={selectedIds.length === 0 || !bulkTarget || isMoving}
              onClick={() => moveOrders(selectedIds, bulkTarget)}
              startIcon={isMoving ? <CircularProgress size={14} color="inherit" /> : <SwapHorizRoundedIcon fontSize="small" />}
            >
              Move
            </Button>
          </Stack>
        )}
        <Divider />

        <DialogContent dividers sx={{ p: 0 }}>
          {selected?.orders?.length ? (
            <List dense disablePadding>
              {selected.orders.map((order) => {
                const id = orderKey(order);
                const checked = selectedIds.includes(id);
                return (
                  <ListItem
                    key={id}
                    divider
                    secondaryAction={
                      <Tooltip title="Move this order to another stage">
                        <span>
                          <IconButton
                            size="small"
                            disabled={isMoving || stageOptions.length === 0}
                            onClick={(e) => openRowMenu(e, order)}
                          >
                            <SwapHorizRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox size="small" edge="start" checked={checked} onChange={() => toggleSelected(id)} />
                    </ListItemIcon>
                    <ListItemText
                      primary={`#${order.Order_Number ?? '—'} — ${order.Customer_name || 'Unknown'}`}
                      secondary={`Stage: ${order?.highestStatusTask?.Task || '—'} · ${formatDate(order?.highestStatusTask?.CreatedAt)}`}
                    />
                    {order?.highestStatusTask?.Task && (
                      <Chip size="small" label={order.highestStatusTask.Task} sx={{ ml: 1, mr: 4, fontSize: 11 }} />
                    )}
                  </ListItem>
                );
              })}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
              No orders here.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2 }}>
          <Typography variant="caption" color="text.disabled" sx={{ flex: 1 }}>
            Counts update automatically as orders move between stages.
          </Typography>
          <Button size="small" onClick={closeDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      <Menu anchorEl={rowMenu.anchor} open={Boolean(rowMenu.anchor)} onClose={closeRowMenu}>
        {stageOptions.length === 0 && <MenuItem disabled>No stages configured</MenuItem>}
        {stageOptions.map((name) => (
          <MenuItem key={name} onClick={() => handleRowMove(name)}>{name}</MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
