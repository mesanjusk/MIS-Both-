import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Dialog, DialogTitle, DialogContent, IconButton,
  List, ListItem, ListItemText, Chip, CircularProgress,
} from '@mui/material';
import { isToday } from 'date-fns';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import SummaryCard from './SummaryCard';
import { useOrdersData } from '../../hooks/useOrdersData';

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
  const { orderList, baseGroupedOrders, tasksMeta, isOrdersLoading } = useOrdersData();
  const [selected, setSelected] = useState(null);

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
              onClick={() => setSelected(card)}
            />
          </Box>
        ))}
      </Stack>

      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {selected?.title} <Typography component="span" variant="body2" color="text.secondary">({selected?.value})</Typography>
          </Typography>
          <IconButton size="small" onClick={() => setSelected(null)}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {selected?.orders?.length ? (
            <List dense disablePadding>
              {selected.orders.map((order) => {
                const id = order.Order_uuid || order._id || order.Order_id;
                return (
                  <ListItem key={id} divider>
                    <ListItemText
                      primary={`#${order.Order_Number ?? '—'} — ${order.Customer_name || 'Unknown'}`}
                      secondary={`Stage: ${order?.highestStatusTask?.Task || '—'} · ${formatDate(order?.highestStatusTask?.CreatedAt)}`}
                    />
                    {order?.highestStatusTask?.Task && (
                      <Chip size="small" label={order.highestStatusTask.Task} sx={{ ml: 1, fontSize: 11 }} />
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
      </Dialog>
    </Box>
  );
}
