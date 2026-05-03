import { Box, Chip } from '@mui/material';
import ChatBubble from './ChatBubble';
import EmptyState from './EmptyState';
import MessageInput from './MessageInput';
import PropTypes from 'prop-types';

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const formatDateLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  const now = new Date();
  const today = startOfDay(now);
  const target = startOfDay(date);
  const yesterday = today - 24 * 60 * 60 * 1000;

  if (target === today) return 'Today';
  if (target === yesterday) return 'Yesterday';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export default function ChatWindow({
  messages,
  getMessageIdentity,
  getMessageDirection,
  getTimestampRaw,
  scrollRef,
  canSend,
  canSendTemplateOnly,
  recipient,
  onSend,
  onSendAttachment,
  onRetry,
}) {
  let lastDateLabel = null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        bgcolor: '#efeae2',
      }}
    >
      <Box
        ref={scrollRef}
        className="whatsapp-wallpaper"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: { xs: 1, md: 2 },
          py: 1.25,
        }}
      >
        {messages.length === 0 ? (
          <EmptyState title="No messages yet" description="Start the conversation by sending a message." />
        ) : null}

        {messages.map((message) => {
          const timestamp = getTimestampRaw(message);
          const dateLabel = formatDateLabel(timestamp);
          const showDateSeparator = dateLabel !== lastDateLabel;
          lastDateLabel = dateLabel;

          const direction = getMessageDirection(message);
          const isOutgoing = direction === 'outgoing';

          return (
            <Box key={getMessageIdentity(message)} sx={{ mb: 1.25 }}>
              {showDateSeparator ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                  <Chip
                    label={dateLabel}
                    size="small"
                    sx={{
                      bgcolor: '#e1f2fb',
                      color: '#54656f',
                      border: '1px solid #d1e8f5',
                    }}
                  />
                </Box>
              ) : null}

              <ChatBubble
                message={message}
                isOutgoing={isOutgoing}
                timestamp={timestamp}
                onRetry={onRetry}
              />
            </Box>
          );
        })}
      </Box>

      <MessageInput
        disabled={!canSend}
        canSendTemplateOnly={canSendTemplateOnly}
        recipient={recipient}
        onSend={onSend}
        onSendAttachment={onSendAttachment}
      />
    </Box>
  );
}

ChatWindow.propTypes = {
  messages: PropTypes.arrayOf(PropTypes.object),
  getMessageIdentity: PropTypes.func.isRequired,
  getMessageDirection: PropTypes.func.isRequired,
  getTimestampRaw: PropTypes.func.isRequired,
  scrollRef: PropTypes.shape({ current: PropTypes.any }),
  canSend: PropTypes.bool,
  canSendTemplateOnly: PropTypes.bool,
  recipient: PropTypes.string,
  onSend: PropTypes.func.isRequired,
  onSendAttachment: PropTypes.func,
  onRetry: PropTypes.func,
};

ChatWindow.defaultProps = {
  messages: [],
  scrollRef: { current: null },
  canSend: true,
  canSendTemplateOnly: false,
  recipient: '',
  onSendAttachment: undefined,
  onRetry: undefined,
};