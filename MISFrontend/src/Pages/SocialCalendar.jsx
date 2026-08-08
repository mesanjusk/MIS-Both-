import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Chip, CircularProgress, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format,
  isSameDay, isSameMonth, addMonths, addWeeks, addDays, subMonths, subWeeks, subDays,
} from 'date-fns';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import toast from 'react-hot-toast';
import { getCalendar, schedulePost } from '../services/socialMediaService';
import { ROUTES } from '../constants/routes';

const VIEWS = ['Month', 'Week', 'Day'];

function rangeFor(view, anchor) {
  if (view === 'Month') return { from: startOfWeek(startOfMonth(anchor)), to: endOfWeek(endOfMonth(anchor)) };
  if (view === 'Week') return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  return { from: anchor, to: anchor };
}

function shift(view, anchor, dir) {
  if (view === 'Month') return dir > 0 ? addMonths(anchor, 1) : subMonths(anchor, 1);
  if (view === 'Week') return dir > 0 ? addWeeks(anchor, 1) : subWeeks(anchor, 1);
  return dir > 0 ? addDays(anchor, 1) : subDays(anchor, 1);
}

const STATUS_COLOR = {
  DRAFT: 'default', PENDING_APPROVAL: 'warning', APPROVED: 'info', SCHEDULED: 'primary',
  PUBLISHING: 'secondary', PUBLISHED: 'success', PARTIALLY_PUBLISHED: 'warning', FAILED: 'error', CANCELLED: 'default',
};

function PostCard({ card, onDragStart, onClick }) {
  return (
    <Paper
      variant="outlined"
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      onClick={() => onClick(card)}
      sx={{ p: 0.75, mb: 0.5, borderRadius: 1.5, cursor: 'grab', fontSize: '0.7rem' }}
    >
      <Stack direction="row" spacing={0.5} alignItems="center">
        {card.thumbnail && <Box component="img" src={card.thumbnail} sx={{ width: 22, height: 22, borderRadius: 0.75, objectFit: 'cover' }} />}
        <Typography variant="caption" fontWeight={700} noWrap sx={{ flex: 1 }}>{card.title || card.captionPreview || 'Untitled'}</Typography>
      </Stack>
      <Stack direction="row" spacing={0.4} sx={{ mt: 0.25 }} flexWrap="wrap" rowGap={0.25}>
        <Chip label={format(new Date(card.scheduledAt), 'HH:mm')} size="small" sx={{ height: 16, fontSize: '0.58rem' }} />
        <Chip label={card.status} color={STATUS_COLOR[card.status] || 'default'} size="small" sx={{ height: 16, fontSize: '0.58rem' }} />
        {card.platforms.map((p) => <Chip key={p} label={p} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.58rem', textTransform: 'capitalize' }} />)}
      </Stack>
    </Paper>
  );
}

export default function SocialCalendar() {
  const navigate = useNavigate();
  const [view, setView] = useState('Month');
  const [anchor, setAnchor] = useState(new Date());
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCalendar({ from: from.toISOString(), to: to.toISOString() });
      setCards(data);
    } catch {
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => eachDayOfInterval({ start: from, end: to }), [from, to]);

  const handleDrop = async (e, day) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/card-id');
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    if (!['SCHEDULED', 'APPROVED'].includes(card.status)) {
      toast.error('Only approved/scheduled posts can be rescheduled here');
      return;
    }
    const oldDate = new Date(card.scheduledAt);
    const newDate = new Date(day);
    newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    try {
      await schedulePost(card.id, newDate.toISOString(), card.timezone);
      toast.success('Rescheduled');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Reschedule failed');
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" rowGap={1} sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <CalendarMonthRoundedIcon color="primary" sx={{ fontSize: 30 }} />
          <Typography variant="h5" fontWeight={900}>Calendar</Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" onClick={() => setAnchor(shift(view, anchor, -1))}><ChevronLeftRoundedIcon /></Button>
          <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 120, textAlign: 'center' }}>
            {format(anchor, view === 'Day' ? 'dd MMM yyyy' : 'MMMM yyyy')}
          </Typography>
          <Button size="small" onClick={() => setAnchor(shift(view, anchor, 1))}><ChevronRightRoundedIcon /></Button>
          <Button size="small" onClick={() => setAnchor(new Date())}>Today</Button>
        </Stack>
        <Tabs value={view} onChange={(_, v) => setView(v)}>
          {VIEWS.map((v) => <Tab key={v} value={v} label={v} />)}
        </Tabs>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${view === 'Day' ? 1 : 7}, 1fr)`, gap: 1, overflowX: 'auto' }}>
          {days.map((day) => {
            const dayCards = cards.filter((c) => isSameDay(new Date(c.scheduledAt), day));
            return (
              <Paper
                key={day.toISOString()}
                variant="outlined"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, day)}
                sx={{
                  p: 0.75, minHeight: view === 'Day' ? 400 : 130, borderRadius: 2,
                  opacity: view === 'Month' && !isSameMonth(day, anchor) ? 0.45 : 1,
                  bgcolor: isSameDay(day, new Date()) ? 'action.hover' : 'background.paper',
                }}
              >
                <Typography variant="caption" fontWeight={800}>{format(day, view === 'Day' ? 'EEEE dd' : 'dd')}</Typography>
                <Box sx={{ mt: 0.5, maxHeight: view === 'Day' ? 360 : 100, overflowY: 'auto' }}>
                  {dayCards.map((card) => (
                    <PostCard
                      key={card.id}
                      card={card}
                      onDragStart={(e, c) => e.dataTransfer.setData('text/card-id', c.id)}
                      onClick={(c) => navigate(`${ROUTES.SOCIAL_CREATE_POST}/${c.id}`)}
                    />
                  ))}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
