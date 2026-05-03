import PropTypes from 'prop-types';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { Button, Chip, Stack, Typography } from '@mui/material';
import MessageRenderer from './MessageRenderer';

const getStatusLabel = (status) => (status ? String(status).toLowerCase() : 'sent');

const formatMessageTime = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(date);
};

const getMessageType = (message) => {
  const resolved = String(message?.messageType || message?.type || message?.payloadType || message?.contentType || 'text').toLowerCase();
  if (resolved.includes('image')) return 'image';
  if (resolved.includes('video')) return 'video';
  if (resolved.includes('audio')) return 'audio';
  if (resolved.includes('document') || resolved.includes('file')) return 'document';
  if (resolved.includes('sticker')) return 'sticker';
  return 'text';
};

const statusIcon = (status) => {
  if (status === 'read' || status === 'seen') return <DoneAllRoundedIcon sx={{ fontSize: 14 }} />;
  if (status === 'failed' || status === 'error' || status === 'undelivered') return <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />;
  return <DoneRoundedIcon sx={{ fontSize: 14 }} />;
};

export default function ChatBubble({ message, isOutgoing, timestamp, onRetry }) {
  const status = getStatusLabel(message?.status);
  const canRetry = isOutgoing && ['failed', 'error', 'undelivered'].includes(status);
  const messageType = getMessageType(message);

  return (
    <Stack alignItems={isOutgoing ? 'flex-end' : 'flex-start'}>
      <Stack
        spacing={1}
        sx={{
          maxWidth: { xs: '92%', sm: '75%' },
          px: 1.5,
          py: 1,
          borderRadius: 2,
          borderBottomRightRadius: isOutgoing ? 6 : 16,
          borderBottomLeftRadius: isOutgoing ? 16 : 6,
          bgcolor: isOutgoing ? '#DCF8C6' : 'background.paper',
          boxShadow: '0 1px 2px rgba(0,0,0,0.14)',
        }}
      >
        <MessageRenderer message={message} type={messageType} isOutgoing={isOutgoing} />

        <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={0.5}>
          <Typography variant="caption" color="text.secondary">{formatMessageTime(timestamp)}</Typography>
          <Chip
            size="small"
            icon={statusIcon(status)}
            label={status}
            sx={{ height: 18, fontSize: 10, textTransform: 'capitalize', '& .MuiChip-icon': { mr: 0 } }}
          />
        </Stack>

        {canRetry ? (
          <Button variant="outlined" color="error" size="small" onClick={() => onRetry?.(message)}>
            Retry
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}


ChatBubble.propTypes = {
  message: PropTypes.object,
  isOutgoing: PropTypes.bool,
  timestamp: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.instanceOf(Date)]),
  onRetry: PropTypes.func,
};

ChatBubble.defaultProps = {
  message: null,
  isOutgoing: false,
  timestamp: '',
  onRetry: undefined,
};
