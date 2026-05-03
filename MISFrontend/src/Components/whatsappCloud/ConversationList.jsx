import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import PropTypes from 'prop-types';
import {
  Autocomplete,
  Avatar,
  Badge,
  Box,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
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

const formatConversationTime = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';

  const isToday = new Date().toDateString() === date.toDateString();
  if (isToday) {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
  }).format(date);
};

const mediaTypeIcon = (type) => {
  const safe = String(type || '').toLowerCase();
  if (safe === 'image') return '🖼️';
  if (safe === 'video') return '🎬';
  if (safe === 'audio') return '🎵';
  if (safe === 'document') return '📄';
  if (safe === 'sticker') return '😊';
  return '';
};

export default function ConversationList({
  conversations,
  customerOptions,
  customerLoadError,
  activeConversationId,
  onSelectConversation,
  onSelectCustomer,
  search,
  onSearch,
  onRefresh,
}) {
  return (
    <Stack sx={{ height: '100%', minHeight: 0, bgcolor: '#ffffff' }}>
      <Stack
        spacing={1}
        sx={{
          p: 1.1,
          borderBottom: '1px solid #e9edef',
          bgcolor: '#f0f2f5',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={700}>Chats</Typography>
          <Tooltip title="Refresh conversations">
            <span>
              <IconButton size="small" onClick={onRefresh}>
                <SyncRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <TextField
          value={search}
          size="small"
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search or start new chat"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 999,
              bgcolor: '#ffffff',
            },
          }}
        />

        <Autocomplete
          size="small"
          freeSolo
          options={customerOptions}
          onChange={(_, value) => {
            if (typeof value === 'string') {
              onSelectCustomer(value);
              return;
            }
            if (value) onSelectCustomer(value);
          }}
          filterOptions={(options, state) => {
            const query = state.inputValue.trim().toLowerCase();
            if (!query) return options.slice(0, 40);

            const filtered = options.filter((option) =>
              `${option.name} ${option.mobile} ${option.mobileDisplay}`.toLowerCase().includes(query)
            );

            if (!filtered.length) {
              return [
                {
                  id: `manual-${query}`,
                  name: state.inputValue.trim(),
                  mobile: state.inputValue.trim(),
                  mobileDisplay: state.inputValue.trim(),
                },
              ];
            }

            return filtered;
          }}
          getOptionLabel={(option) => `${option.name} ${option.mobileDisplay}`.trim()}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Select customer or mobile"
              helperText={customerLoadError || 'Open chat directly from CRM customer list'}
              error={Boolean(customerLoadError)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 999,
                  bgcolor: '#ffffff',
                },
              }}
            />
          )}
          renderOption={(props, option) => (
            <Box
              component="li"
              {...props}
              key={option.id}
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
            >
              <Typography variant="body2" fontWeight={700}>{option.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {option.mobileDisplay || option.mobile}
              </Typography>
            </Box>
          )}
        />
      </Stack>

      <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
        {conversations.length === 0 ? (
          <Typography sx={{ px: 3, py: 8 }} align="center" color="text.secondary" variant="body2">
            No conversations found.
          </Typography>
        ) : (
          <List disablePadding>
            {conversations.map((conversation) => {
              const isActive = activeConversationId === conversation.id;
              const hasUnread = conversation.unreadCount > 0;

              return (
                <ListItemButton
                  key={conversation.id}
                  selected={isActive}
                  onClick={() => onSelectConversation(conversation.id)}
                  sx={{
                    py: 1,
                    px: 1.2,
                    alignItems: 'flex-start',
                    borderBottom: '1px solid #f0f2f5',
                    bgcolor: isActive ? '#f0f2f5' : '#ffffff',
                    '&.Mui-selected': { bgcolor: '#f0f2f5' },
                    '&:hover': { bgcolor: '#f8fafb' },
                  }}
                >
                  <Badge color="success" badgeContent={hasUnread ? conversation.unreadCount : 0} overlap="circular">
                    <Avatar sx={{ bgcolor: '#25d366', width: 40, height: 40, fontSize: 13 }}>
                      {getInitials(conversation.displayName || conversation.contact)}
                    </Avatar>
                  </Badge>

                  <ListItemText
                    sx={{ ml: 1.2, my: 0, minWidth: 0 }}
                    primary={
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                        <Typography noWrap variant="subtitle2" fontWeight={700}>
                          {conversation.displayName}
                        </Typography>
                        <Typography
                          variant="caption"
                          color={hasUnread ? 'success.main' : 'text.secondary'}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          {formatConversationTime(conversation.lastTimestamp)}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Stack spacing={0.2}>
                        <Typography noWrap variant="caption" color="text.secondary">
                          {conversation.secondaryLabel || conversation.contact}
                        </Typography>
                        <Stack direction="row" alignItems="center" spacing={0.6}>
                          {!hasUnread ? (
                            <DoneAllRoundedIcon sx={{ fontSize: 15, color: '#53bdeb' }} />
                          ) : null}
                          <Typography
                            noWrap
                            variant="body2"
                            color={hasUnread ? 'text.primary' : 'text.secondary'}
                            fontWeight={hasUnread ? 700 : 400}
                          >
                            {mediaTypeIcon(conversation.lastMessageType)} {conversation.lastMessage || 'No message'}
                          </Typography>
                        </Stack>
                      </Stack>
                    }
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </Box>
    </Stack>
  );
}

ConversationList.propTypes = {
  conversations: PropTypes.arrayOf(PropTypes.object),
  customerOptions: PropTypes.arrayOf(PropTypes.object),
  customerLoadError: PropTypes.string,
  activeConversationId: PropTypes.string,
  onSelectConversation: PropTypes.func.isRequired,
  onSelectCustomer: PropTypes.func.isRequired,
  search: PropTypes.string,
  onSearch: PropTypes.func.isRequired,
  onRefresh: PropTypes.func,
};

ConversationList.defaultProps = {
  conversations: [],
  customerOptions: [],
  customerLoadError: '',
  activeConversationId: '',
  search: '',
  onRefresh: undefined,
};