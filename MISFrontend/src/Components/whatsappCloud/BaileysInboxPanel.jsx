import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
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
  baileysMarkRead,
  baileysSendText,
} from '../../services/whatsappCloudService';

const fmt = (v) => (v ? new Date(v).toLocaleString() : '');

export default function BaileysInboxPanel() {
  const [inbox, setInbox]               = useState([]);
  const [selected, setSelected]         = useState(null);
  const [messages, setMessages]         = useState([]);
  const [replyText, setReplyText]       = useState('');
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingMsgs, setLoadingMsgs]   = useState(false);
  const [sending, setSending]           = useState(false);
  const [error, setError]               = useState('');

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

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  const openConversation = async (conv) => {
    setSelected(conv);
    setLoadingMsgs(true);
    try {
      const res = await baileysGetConversation(conv.conversationKey);
      setMessages(res.data || []);
      await baileysMarkRead(conv.conversationKey).catch(() => {});
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
    <Box sx={{ display: 'flex', height: '70vh', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      {/* Sidebar */}
      <Box sx={{ width: 280, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" px={1.5} py={1}>
          <Typography fontWeight={700} fontSize={14}>Baileys Inbox</Typography>
          <IconButton size="small" onClick={fetchInbox}><RefreshIcon fontSize="small" /></IconButton>
        </Stack>
        <Divider />
        {loadingInbox ? (
          <Box display="flex" justifyContent="center" py={3}><CircularProgress size={22} /></Box>
        ) : (
          <List dense sx={{ overflow: 'auto', flex: 1 }}>
            {inbox.length === 0 && (
              <Typography color="text.secondary" fontSize={13} px={2} py={2}>No conversations yet.</Typography>
            )}
            {inbox.map((conv) => (
              <ListItemButton
                key={conv.conversationKey}
                selected={selected?.conversationKey === conv.conversationKey}
                onClick={() => openConversation(conv)}
              >
                <ListItemAvatar>
                  <Avatar sx={{ width: 34, height: 34, fontSize: 14 }}>
                    {(conv.contactName || conv.phone || '?')[0].toUpperCase()}
                  </Avatar>
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

            {error && <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>}

            <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
              {loadingMsgs && <CircularProgress size={20} />}
              {messages.map((msg, idx) => (
                <Box
                  key={idx}
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
                    <Typography fontSize={13}>{msg.bodyText}</Typography>
                    <Typography fontSize={10} sx={{ opacity: 0.7 }}>{fmt(msg.createdAt)}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>

            <Stack direction="row" spacing={1} px={2} py={1} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Type a message…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                multiline
                maxRows={3}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={handleSend} disabled={sending || !replyText.trim()}>
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
  );
}
