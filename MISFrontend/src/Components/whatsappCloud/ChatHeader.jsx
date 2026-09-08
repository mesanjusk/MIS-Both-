import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import LockClockRoundedIcon from '@mui/icons-material/LockClockRounded';
import PropTypes from 'prop-types';
import {
  Avatar,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';

const getInitials = (value) => {
  const source = String(value || '').trim();
  if (!source) return 'NA';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

/**
 * The bar above the message thread — WhatsApp Web style: back button (mobile
 * only), contact avatar, name and number, the 24-hour session state, and a
 * refresh control.
 */
export default function ChatHeader({ conversation, isLoading, onRefresh, windowOpen, onBack }) {
  const name = conversation?.displayName || conversation?.contact || 'Conversation';
  const subtitle = conversation?.secondaryLabel || conversation?.contact || '';

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.25}
      sx={{
        px: 1.5,
        py: 1,
        minHeight: 59,
        bgcolor: '#f0f2f5',
        borderBottom: '1px solid #e9edef',
        flexShrink: 0,
      }}
    >
      <IconButton
        size="small"
        onClick={onBack}
        sx={{ display: { xs: 'inline-flex', lg: 'none' } }}
        aria-label="Back to chats"
      >
        <ArrowBackRoundedIcon fontSize="small" />
      </IconButton>

      <Avatar sx={{ bgcolor: '#25d366', width: 40, height: 40, fontSize: 14 }}>
        {getInitials(name)}
      </Avatar>

      <Stack sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap variant="subtitle2" fontWeight={700}>
          {name}
        </Typography>
        <Typography noWrap variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      </Stack>

      <Chip
        size="small"
        icon={<LockClockRoundedIcon sx={{ fontSize: 15 }} />}
        label={windowOpen ? '24h open' : '24h expired'}
        color={windowOpen ? 'success' : 'default'}
        variant={windowOpen ? 'filled' : 'outlined'}
        sx={{ height: 24, display: { xs: 'none', sm: 'inline-flex' } }}
      />

      <Tooltip title="Refresh messages">
        <span>
          <IconButton size="small" onClick={onRefresh} disabled={isLoading} aria-label="Refresh messages">
            {isLoading ? <CircularProgress size={16} /> : <SyncRoundedIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}

ChatHeader.propTypes = {
  conversation: PropTypes.shape({
    displayName: PropTypes.string,
    contact: PropTypes.string,
    secondaryLabel: PropTypes.string,
  }),
  isLoading: PropTypes.bool,
  onRefresh: PropTypes.func,
  windowOpen: PropTypes.bool,
  onBack: PropTypes.func,
};

ChatHeader.defaultProps = {
  conversation: null,
  isLoading: false,
  onRefresh: undefined,
  windowOpen: true,
  onBack: undefined,
};
