import { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';

export default function DeliveryDateSidebar({
  title,
  selectedDate,
  onSelectDate,
  availableDates = [],
  dateCountMap = {},
  allCount = 0,
  loading = false,
  countLabel = 'records',
  formatDate,
}) {
  const [dateInput, setDateInput] = useState('');

  useEffect(() => {
    if (selectedDate) setDateInput(selectedDate);
  }, [selectedDate]);

  const goToDate = () => {
    if (dateInput) onSelectDate(dateInput);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        width: 210,
        flexShrink: 0,
        borderRadius: 3,
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        overflow: 'hidden',
        height: 'calc(100vh - 80px)',
        position: 'sticky',
        top: 16,
      }}
    >
      <Box sx={{ p: 1.5, pb: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
          <TextField
            type="date"
            size="small"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            sx={{ flex: 1, '& input': { fontSize: 12, py: 0.6 } }}
            InputLabelProps={{ shrink: true }}
          />
          <Tooltip title="Go to date">
            <IconButton size="small" onClick={goToDate} color="primary">
              <EventIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ overflowY: 'auto', flex: 1 }}>
        <Box
          onClick={() => onSelectDate(null)}
          sx={{
            px: 2,
            py: 1.25,
            cursor: 'pointer',
            bgcolor: selectedDate === null ? 'primary.main' : 'transparent',
            color: selectedDate === null ? 'primary.contrastText' : 'text.primary',
            '&:hover': { bgcolor: selectedDate === null ? 'primary.dark' : 'action.hover' },
          }}
        >
          <Typography variant="body2" fontWeight={700}>All Dates</Typography>
          <Typography variant="caption" sx={{ opacity: 0.75 }}>
            {allCount} {countLabel}
          </Typography>
        </Box>
        <Divider />
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={20} />
          </Box>
        ) : availableDates.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
            No dates
          </Typography>
        ) : (
          availableDates.map((date) => (
            <Box key={date}>
              <Box
                onClick={() => onSelectDate(date)}
                sx={{
                  px: 2,
                  py: 1.25,
                  cursor: 'pointer',
                  bgcolor: selectedDate === date ? 'primary.main' : 'transparent',
                  color: selectedDate === date ? 'primary.contrastText' : 'text.primary',
                  '&:hover': { bgcolor: selectedDate === date ? 'primary.dark' : 'action.hover' },
                }}
              >
                <Typography variant="body2" fontWeight={600}>
                  {formatDate ? formatDate(date) : date}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.75 }}>
                  {dateCountMap[date] || 0} {countLabel}
                </Typography>
              </Box>
              <Divider />
            </Box>
          ))
        )}
      </Box>
    </Paper>
  );
}
