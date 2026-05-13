import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getStoredToken } from '../../utils/authStorage';
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon       from '@mui/icons-material/Send';
import RefreshIcon    from '@mui/icons-material/Refresh';
import GroupsIcon     from '@mui/icons-material/Groups';
import EditIcon       from '@mui/icons-material/Edit';
import {
  baileysGetStatus,
  baileysGetGroups,
  baileysGetGroupInbox,
  baileysGetGroupConversation,
  baileysGroupMarkRead,
  baileysSendText,
} from '../../services/whatsappCloudService';

const stripApiSuffix = (url) => (url ? String(url).replace(/\/api\/?$/, '') : url);
const SOCKET_URL =
  stripApiSuffix(import.meta.env.VITE_SOCKET_URL) ||
  stripApiSuffix(import.meta.env.VITE_API_BASE) ||
  window.location.origin;

const fmt = (v) => (v ? new Date(v).toLocaleString() : '');
const STATUS_COLOR = { CONNECTED: 'success', QR_PENDING: 'warning', DISCONNECTED: 'error' };

export default function BaileysGroupInboxPanel() {
  const [connStatus, setConnStatus]     = useState(null);
  const [groupInbox, setGroupInbox]     = useState([]);   // conversation summaries
  const [groups, setGroups]             = useState([]);   // WA group list from device
  const [selected, setSelected]         = useState(null); // active group conversation
  const [messages, setMessages]         = useState([]);
  const [replyText, setReplyText]       = useState('');
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingMsgs, setLoadingMsgs]  = useState(false);
  const [sending, setSending]           = useState(false);
  const [error, setError]               = useState('');

  // Compose to a new group dialog
  const [composeOpen, setComposeOpen]       = useState(false);
  const [composeGroup, setComposeGroup]     = useState('');
  const [composeMsg, setComposeMsg]         = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError]     = useState('');
  const [loadingGroups, setLoadingGroups]   = useState(false);

  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const messagesEndRef = useRef(null);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await baileysGetStatus();
      setConnStatus(res.data?.status || 'DISCONNECTED');
    } catch {
      setConnStatus('DISCONNECTED');
    }
  }, []);

  const fetchInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const res = await baileysGetGroupInbox();
      setGroupInbox(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load group inbox');
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  // Initial load + 30-second polling
  useEffect(() => {
    fetchInbox();
    fetchStatus();
    const timer = setInterval(() => { fetchInbox(); fetchStatus(); }, 30_000);
    return () => clearInterval(timer);
  }, [fetchInbox, fetchStatus]);

  // Real-time socket listener
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { token: getStoredToken() } });
    socket.on('new_message', (data) => {
      const msg = data?.message || data;
      if (data?.provider !== 'baileys' || !msg) return;
      if (msg.chatType !== 'group' && !msg.groupId) return;
      fetchInbox();
      const activeGroupId = selectedRef.current?.groupId || '';
      if (activeGroupId && (msg.groupId === activeGroupId || msg.conversationKey === activeGroupId)) {
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
      const res = await baileysGetGroupConversation(conv.groupId);
      setMessages(res.data || []);
      await baileysGroupMarkRead(conv.groupId).catch(() => {});
      setGroupInbox((prev) =>
        prev.map((c) => c.groupId === conv.groupId ? { ...c, unreadCount: 0 } : c)
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
      await baileysSendText({ to: selected.groupId, text: replyText.trim(), groupName: selected.groupName });
      setReplyText('');
      const res = await baileysGetGroupConversation(selected.groupId);
      setMessages(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const openCompose = async () => {
    setComposeOpen(true);
    setComposeGroup('');
    setComposeMsg('');
    setComposeError('');
    if (groups.length === 0) {
      setLoadingGroups(true);
      try {
        const res = await baileysGetGroups();
        setGroups(res.data || []);
      } catch {
        setComposeError('Failed to load groups from WhatsApp');
      } finally {
        setLoadingGroups(false);
      }
    }
  };

  const handleComposeSend = async () => {
    if (!composeGroup || !composeMsg.trim()) return;
    const grp = groups.find((g) => g.id === composeGroup);
    setComposeSending(true);
    setComposeError('');
    try {
      await baileysSendText({ to: composeGroup, text: composeMsg.trim(), groupName: grp?.name || '' });
      setComposeOpen(false);
      setComposeGroup('');
      setComposeMsg('');
      await fetchInbox();
      // Open the conversation for that group
      const conv = { groupId: composeGroup, groupName: grp?.name || composeGroup, conversationKey: composeGroup };
      await openConversation(conv);
    } catch (err) {
      setComposeError(err?.response?.data?.message || 'Failed to send');
    } finally {
      setComposeSending(false);
    }
  };

  return (
    <Box>
      {/* Top bar */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1} px={0.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Chip
            size="small"
            label={connStatus || '…'}
            color={STATUS_COLOR[connStatus] || 'default'}
            variant="outlined"
          />
          <GroupsIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary">
            Group Messages
          </Typography>
        </Stack>
        <Tooltip title="Send to a Group">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditIcon fontSize="small" />}
              disabled={connStatus !== 'CONNECTED'}
              onClick={openCompose}
            >
              Send to Group
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <Box sx={{ display: 'flex', height: '65vh', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>

        {/* Sidebar — group list */}
        <Box sx={{ width: 300, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" px={1.5} py={1}>
            <Typography fontWeight={700} fontSize={14}>Groups</Typography>
            <IconButton size="small" onClick={() => { fetchInbox(); fetchStatus(); }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Divider />

          {loadingInbox ? (
            <Box display="flex" justifyContent="center" py={3}><CircularProgress size={22} /></Box>
          ) : (
            <List dense sx={{ overflow: 'auto', flex: 1 }}>
              {groupInbox.length === 0 && (
                <Typography color="text.secondary" fontSize={12} px={2} py={2}>
                  {connStatus === 'CONNECTED'
                    ? 'No group messages yet. Use "Send to Group" to start a conversation.'
                    : 'Connect Baileys first.'}
                </Typography>
              )}
              {groupInbox.map((conv) => (
                <ListItemButton
                  key={conv.groupId}
                  selected={selected?.groupId === conv.groupId}
                  onClick={() => openConversation(conv)}
                >
                  <ListItemAvatar sx={{ minWidth: 42 }}>
                    <Badge badgeContent={conv.unreadCount || 0} color="success" max={99}>
                      <Avatar sx={{ width: 34, height: 34, fontSize: 14, bgcolor: 'primary.main' }}>
                        <GroupsIcon fontSize="small" />
                      </Avatar>
                    </Badge>
                  </ListItemAvatar>
                  <ListItemText
                    primary={conv.groupName || conv.groupId}
                    secondary={
                      <Typography component="span" fontSize={11} color="text.secondary" display="block" noWrap>
                        {conv.lastMessage || ''}
                      </Typography>
                    }
                    primaryTypographyProps={{ fontSize: 13, fontWeight: conv.unreadCount ? 700 : 400, noWrap: true }}
                  />
                  <Typography fontSize={10} color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>
                    {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </Typography>
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>

        {/* Chat area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <Box display="flex" alignItems="center" justifyContent="center" flex={1} flexDirection="column" gap={1}>
              <GroupsIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
              <Typography color="text.secondary" fontSize={14}>Select a group conversation</Typography>
            </Box>
          ) : (
            <>
              {/* Chat header */}
              <Stack px={2} py={1} direction="row" alignItems="center" spacing={1.5} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                  <GroupsIcon fontSize="small" />
                </Avatar>
                <Box>
                  <Typography fontWeight={700} fontSize={14}>{selected.groupName || selected.groupId}</Typography>
                  <Typography fontSize={10} color="text.secondary">{selected.groupId}</Typography>
                </Box>
              </Stack>

              {error && <Alert severity="error" onClose={() => setError('')} sx={{ m: 1 }}>{error}</Alert>}

              {/* Messages */}
              <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
                {loadingMsgs && <Box display="flex" justifyContent="center" py={2}><CircularProgress size={20} /></Box>}
                {messages.map((msg, idx) => (
                  <Box
                    key={msg._id || idx}
                    sx={{ display: 'flex', justifyContent: msg.direction === 'OUTGOING' ? 'flex-end' : 'flex-start', mb: 0.75 }}
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
                      {/* Show sender phone for incoming group messages */}
                      {msg.direction === 'INCOMING' && msg.senderPhone && (
                        <Typography fontSize={10} fontWeight={700} color="primary.dark" mb={0.25}>
                          {msg.senderPhone}
                        </Typography>
                      )}
                      <Typography fontSize={13}>{msg.bodyText || msg.body || ''}</Typography>
                      <Typography fontSize={10} sx={{ opacity: 0.7 }}>{fmt(msg.createdAt)}</Typography>
                    </Box>
                  </Box>
                ))}
                <div ref={messagesEndRef} />
              </Box>

              {/* Reply box */}
              <Stack direction="row" spacing={1} px={2} py={1} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder={connStatus === 'CONNECTED' ? 'Type a message to the group…' : 'Baileys not connected'}
                  disabled={connStatus !== 'CONNECTED'}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  multiline
                  maxRows={3}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={handleSend}
                          disabled={sending || !replyText.trim() || connStatus !== 'CONNECTED'}
                        >
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

      {/* Compose — send to a new group dialog */}
      <Dialog open={composeOpen} onClose={() => setComposeOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Send Message to Group</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {composeError && <Alert severity="error">{composeError}</Alert>}

            {loadingGroups ? (
              <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
            ) : (
              <FormControl fullWidth size="small">
                <InputLabel>Select Group</InputLabel>
                <Select
                  value={composeGroup}
                  label="Select Group"
                  onChange={(e) => setComposeGroup(e.target.value)}
                >
                  {groups.length === 0 && (
                    <MenuItem disabled value="">No groups found — make sure Baileys is connected</MenuItem>
                  )}
                  {groups.map((g) => (
                    <MenuItem key={g.id} value={g.id}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <GroupsIcon fontSize="small" color="action" />
                        <Box>
                          <Typography fontSize={13}>{g.name}</Typography>
                          <Typography fontSize={10} color="text.secondary">{g.size} members</Typography>
                        </Box>
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              label="Message"
              value={composeMsg}
              onChange={(e) => setComposeMsg(e.target.value)}
              fullWidth
              multiline
              rows={4}
              size="small"
              onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && handleComposeSend()}
              helperText="Ctrl+Enter to send"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setComposeOpen(false)} disabled={composeSending}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleComposeSend}
            disabled={composeSending || !composeGroup || !composeMsg.trim()}
            startIcon={composeSending ? <CircularProgress size={14} /> : <SendIcon />}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
