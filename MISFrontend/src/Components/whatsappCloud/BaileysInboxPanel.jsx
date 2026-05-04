import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon    from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  baileysGetInbox,
  baileysGetConversation,
  baileysGetStatus,
  baileysMarkRead,
  baileysSendText,
} from '../../services/whatsappCloudService';

const stripApiSuffix = (url) => (url ? String(url).replace(/\/api\/?$/, '') : url);
const SOCKET_URL =
  stripApiSuffix(import.meta.env.VITE_SOCKET_URL) ||
  stripApiSuffix(import.meta.env.VITE_API_BASE) ||
  window.location.origin;

const fmt = (v) => (v ? new Date(v).toLocaleString() : '');
const normPhone = (v) => String(v || '').replace(/\D/g, '');

const STATUS_COLOR = { CONNECTED: 'success', QR_PENDING: 'warning', DISCONNECTED: 'error' };

export default function BaileysInboxPanel() {
  const [inbox, setInbox]               = useState([]);
  const [selected, setSelected]         = useState(null);
  const [messages, setMessages]         = useState([]);
  const [replyText, setReplyText]       = useState('');
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingMsgs, setLoadingMsgs]   = useState(false);
  const [sending, setSending]           = useState(false);
  const [error, setError]               = useState('');
  const [connStatus, setConnStatus]     = useState(null);

  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const fetchInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const res = await baileysGetInbox();
      setInbox(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load inbox');
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await baileysGetStatus();
      setConnStatus(res.data?.status || 'DISCONNECTED');
    } catch {
      setConnStatus('DISCONNECTED');
    }
  }, []);

  // Initial load + 30-second polling fallback (covers socket gaps / Render cold-starts)
  useEffect(() => {
    fetchInbox();
    fetchStatus();
    const timer = setInterval(() => { fetchInbox(); fetchStatus(); }, 30_000);
    return () => clearInterval(timer);
  }, [fetchInbox, fetchStatus]);

  // Real-time Socket.IO listener
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    socket.on('new_message', (data) => {
      const msg = data?.message || data;
      if (data?.provider !== 'baileys' || !msg) return;

      fetchInbox();

      const convKey  = normPhone(msg.conversationKey || msg.from || msg.to || '');
      const activeKey = normPhone(selectedRef.current?.conversationKey || '');
      if (convKey && activeKey && convKey === activeKey) {
        setMessages((prev) => {
          const id = msg._id || msg.id;
          if (id && prev.some((m) => (m._id || m.id) === id)) return prev;
          return [...prev, msg];
        });
      }
    });

    return () => { socket.disconnect(); };
  }, [fetchInbox]);

  const openConversation = async (conv) => {
    setSelected(conv);
    setLoadingMsgs(true);
    try {
      const res = await baileysGetConversation(conv.conversationKey);
      setMessages(res.data || []);
      await baileysMarkRead(conv.conversationKey).catch(() => {});
      setInbox((prev) =>
        prev.map((c) =>
          c.conversationKey === conv.conversationKey ? { ...c, unreadCount: 0 } : c
        )
      );
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  };

  const handleSend = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      await baileysSendText({ to: selected.phone, text: replyText.trim() });
      setReplyText('');
      const res = await baileysGetConversation(selected.conversationKey);
      setMessages(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box>
      {/* Connection status banner */}
      <Stack direction="row" alignItems="center" spacing={1} mb={1} px={0.5}>
        <Chip
          size="small"
          label={connStatus || '…'}
          color={STATUS_COLOR[connStatus] || 'default'}
          variant="outlined"
        />
        {connStatus !== 'CONNECTED' && (
          <Typography variant="caption" color="text.secondary">
            {connStatus === 'QR_PENDING'
              ? 'Scan QR in WA Web Setup tab to receive messages'
              : 'Baileys not connected — go to WA Web Setup tab'}
          </Typography>
        )}
      </Stack>

      <Box sx={{ display: 'flex', height: '65vh', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        {/* Sidebar */}
        <Box sx={{ width: 280, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" px={1.5} py={1}>
            <Typography fontWeight={700} fontSize={14}>Inbox</Typography>
            <IconButton size="small" onClick={() => { fetchInbox(); fetchStatus(); }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Divider />
          {loadingInbox ? (
            <Box display="flex" justifyContent="center" py={3}><CircularProgress size={22} /></Box>
          ) : (
            <List dense sx={{ overflow: 'auto', flex: 1 }}>
              {inbox.length === 0 && (
                <Typography color="text.secondary" fontSize={12} px={2} py={2}>
                  {connStatus === 'CONNECTED'
                    ? 'No conversations yet. Messages will appear when customers write to your office number.'
                    : 'Connect Baileys first to receive messages.'}
                </Typography>
              )}
              {inbox.map((conv) => (
                <ListItemButton
                  key={conv.conversationKey}
                  selected={selected?.conversationKey === conv.conversationKey}
                  onClick={() => openConversation(conv)}
                >
                  <ListItemAvatar>
                    <Badge badgeContent={conv.unreadCount || 0} color="success" max={99}>
                      <Avatar sx={{ width: 34, height: 34, fontSize: 14 }}>
                        {(conv.contactName || conv.phone || '?')[0].toUpperCase()}
                      </Avatar>
                    </Badge>
                  </ListItemAvatar>
                  <ListItemText
                    primary={conv.contactName || conv.phone}
                    secondary={conv.lastMessage}
                    primaryTypographyProps={{ fontSize: 13, fontWeight: conv.unreadCount ? 700 : 400 }}
                    secondaryTypographyProps={{ fontSize: 12, noWrap: true }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>

        {/* Chat area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <Box display="flex" alignItems="center" justifyContent="center" flex={1}>
              <Typography color="text.secondary" fontSize={14}>Select a conversation</Typography>
            </Box>
          ) : (
            <>
              <Stack px={2} py={1} direction="row" alignItems="center" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography fontWeight={700} fontSize={14}>{selected.contactName || selected.phone}</Typography>
              </Stack>

              {error && <Alert severity="error" onClose={() => setError('')} sx={{ m: 1 }}>{error}</Alert>}

              <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
                {loadingMsgs && <CircularProgress size={20} />}
                {messages.map((msg, idx) => (
                  <Box
                    key={msg._id || idx}
                    sx={{
                      display: 'flex',
                      justifyContent: msg.direction === 'OUTGOING' ? 'flex-end' : 'flex-start',
                      mb: 0.5,
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: '75%',
                        bgcolor: msg.direction === 'OUTGOING' ? 'primary.main' : 'grey.100',
                        color: msg.direction === 'OUTGOING' ? 'white' : 'text.primary',
                        borderRadius: 2,
                        px: 1.5,
                        py: 0.75,
                      }}
                    >
                      <Typography fontSize={13}>{msg.bodyText || msg.body || ''}</Typography>
                      <Typography fontSize={10} sx={{ opacity: 0.7 }}>{fmt(msg.createdAt)}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>

              <Stack direction="row" spacing={1} px={2} py={1} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder={connStatus === 'CONNECTED' ? 'Type a message…' : 'Baileys not connected'}
                  disabled={connStatus !== 'CONNECTED'}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  multiline
                  maxRows={3}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={handleSend} disabled={sending || !replyText.trim() || connStatus !== 'CONNECTED'}>
                          {sending ? <CircularProgress size={16} /> : <SendIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Stack>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
