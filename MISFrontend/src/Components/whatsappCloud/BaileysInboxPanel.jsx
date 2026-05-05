import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon          from '@mui/icons-material/Send';
import RefreshIcon       from '@mui/icons-material/Refresh';
import EditIcon          from '@mui/icons-material/Edit';
import ImageIcon         from '@mui/icons-material/Image';
import VideocamIcon      from '@mui/icons-material/Videocam';
import MicIcon           from '@mui/icons-material/Mic';
import AttachFileIcon    from '@mui/icons-material/AttachFile';
import AssignmentIcon    from '@mui/icons-material/Assignment';
import EventNoteIcon     from '@mui/icons-material/EventNote';
import CloseIcon         from '@mui/icons-material/Close';
import {
  baileysGetInbox,
  baileysGetConversation,
  baileysGetStatus,
  baileysMarkRead,
  baileysSendText,
} from '../../services/whatsappCloudService';
import { fetchCustomers } from '../../services/customerService';
import {
  buildCustomerPhoneLookup,
  findCustomerByPhone,
  formatPhoneForDisplay,
} from '../../utils/customerDirectory';

const stripApiSuffix = (url) => (url ? String(url).replace(/\/api\/?$/, '') : url);
const SOCKET_URL =
  stripApiSuffix(import.meta.env.VITE_SOCKET_URL) ||
  stripApiSuffix(import.meta.env.VITE_API_BASE) ||
  window.location.origin;

const fmt = (v) => (v ? new Date(v).toLocaleString() : '');
const normPhone = (v) => String(v || '').replace(/\D/g, '');

const STATUS_COLOR = { CONNECTED: 'success', QR_PENDING: 'warning', DISCONNECTED: 'error' };

const MEDIA_TYPES = new Set(['MEDIA', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER']);

function MediaLabel({ type, fontSize = 12 }) {
  const t = String(type || '').toUpperCase();
  if (t === 'IMAGE')    return <Stack direction="row" alignItems="center" spacing={0.3}><ImageIcon sx={{ fontSize }} /><span style={{ fontSize }}>Image</span></Stack>;
  if (t === 'VIDEO')    return <Stack direction="row" alignItems="center" spacing={0.3}><VideocamIcon sx={{ fontSize }} /><span style={{ fontSize }}>Video</span></Stack>;
  if (t === 'AUDIO')    return <Stack direction="row" alignItems="center" spacing={0.3}><MicIcon sx={{ fontSize }} /><span style={{ fontSize }}>Audio</span></Stack>;
  if (t === 'DOCUMENT') return <Stack direction="row" alignItems="center" spacing={0.3}><AttachFileIcon sx={{ fontSize }} /><span style={{ fontSize }}>Document</span></Stack>;
  if (t === 'STICKER')  return <Stack direction="row" alignItems="center" spacing={0.3}><span style={{ fontSize }}>🎭</span><span style={{ fontSize }}>Sticker</span></Stack>;
  return <Stack direction="row" alignItems="center" spacing={0.3}><AttachFileIcon sx={{ fontSize }} /><span style={{ fontSize }}>Media</span></Stack>;
}

function isMediaType(type) {
  return MEDIA_TYPES.has(String(type || '').toUpperCase());
}

// Resolve display name and formatted phone for a conversation
function resolveConvDisplay(conv, phoneLookup) {
  const customer = findCustomerByPhone(phoneLookup, conv.phone);
  const name = customer?.Customer_name || customer?.name || conv.contactName || '';
  const formatted = formatPhoneForDisplay(conv.phone);
  return { name, formatted, displayName: name || formatted };
}

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

  // Customer lookup
  const [phoneLookup, setPhoneLookup]   = useState(new Map());

  // Checkbox selection
  const [checkedKeys, setCheckedKeys]   = useState(new Set());

  // Compose new message dialog
  const [composeOpen, setComposeOpen]   = useState(false);
  const [composeTo, setComposeTo]       = useState('');
  const [composeMsg, setComposeMsg]     = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState('');

  // Assign dialog
  const [assignOpen, setAssignOpen]     = useState(false);
  const [assignType, setAssignType]     = useState('');

  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Load customer lookup on mount
  useEffect(() => {
    fetchCustomers()
      .then((res) => {
        const list = res?.data?.result || res?.data?.customers || res?.data || [];
        setPhoneLookup(buildCustomerPhoneLookup(Array.isArray(list) ? list : []));
      })
      .catch(() => {});
  }, []);

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

  // Initial load + 30-second polling fallback
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
      const convKey   = normPhone(msg.conversationKey || msg.from || msg.to || '');
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

  const handleComposeSend = async () => {
    const phone = normPhone(composeTo);
    if (!phone || !composeMsg.trim()) return;
    setComposeSending(true);
    setComposeError('');
    try {
      await baileysSendText({ to: phone, text: composeMsg.trim() });
      setComposeOpen(false);
      setComposeTo('');
      setComposeMsg('');
      await fetchInbox();
      const conv = { conversationKey: phone, phone, contactName: '' };
      await openConversation(conv);
    } catch (err) {
      setComposeError(err?.response?.data?.message || 'Failed to send');
    } finally {
      setComposeSending(false);
    }
  };

  const toggleCheck = (e, key) => {
    e.stopPropagation();
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const clearChecked = () => setCheckedKeys(new Set());

  const openAssign = (type) => {
    setAssignType(type);
    setAssignOpen(true);
  };

  // Enrich inbox with resolved names
  const enrichedInbox = useMemo(
    () => inbox.map((conv) => ({ ...conv, ...resolveConvDisplay(conv, phoneLookup) })),
    [inbox, phoneLookup]
  );

  const checkedCount = checkedKeys.size;
  const selectedConvDisplay = selected ? resolveConvDisplay(selected, phoneLookup) : null;

  return (
    <Box>
      {/* Status + compose bar */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1} px={0.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Chip
            size="small"
            label={connStatus || '…'}
            color={STATUS_COLOR[connStatus] || 'default'}
            variant="outlined"
          />
          {connStatus !== 'CONNECTED' && (
            <Typography variant="caption" color="text.secondary">
              {connStatus === 'QR_PENDING'
                ? 'Scan QR in WA Web Setup tab'
                : 'Go to WA Web Setup → Connect'}
            </Typography>
          )}
        </Stack>
        <Tooltip title="New Message">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditIcon fontSize="small" />}
              disabled={connStatus !== 'CONNECTED'}
              onClick={() => setComposeOpen(true)}
            >
              New Message
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <Box sx={{ display: 'flex', height: '65vh', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        {/* Sidebar */}
        <Box sx={{ width: 300, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" px={1.5} py={1}>
            <Typography fontWeight={700} fontSize={14}>Inbox</Typography>
            <IconButton size="small" onClick={() => { fetchInbox(); fetchStatus(); }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Divider />

          {/* Assign action toolbar — shown when checkboxes are selected */}
          {checkedCount > 0 && (
            <Paper elevation={0} sx={{ px: 1.5, py: 0.75, bgcolor: 'primary.50', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                <Typography fontSize={12} fontWeight={600} color="primary.main">
                  {checkedCount} selected
                </Typography>
                <Button size="small" variant="contained" startIcon={<AssignmentIcon fontSize="small" />}
                  onClick={() => openAssign('Order')} sx={{ fontSize: 11, py: 0.25 }}>
                  Assign Order
                </Button>
                <Button size="small" variant="outlined" startIcon={<EventNoteIcon fontSize="small" />}
                  onClick={() => openAssign('Follow-up')} sx={{ fontSize: 11, py: 0.25 }}>
                  Follow-up
                </Button>
                <IconButton size="small" onClick={clearChecked}><CloseIcon fontSize="small" /></IconButton>
              </Stack>
            </Paper>
          )}

          {loadingInbox ? (
            <Box display="flex" justifyContent="center" py={3}><CircularProgress size={22} /></Box>
          ) : (
            <List dense sx={{ overflow: 'auto', flex: 1 }}>
              {enrichedInbox.length === 0 && (
                <Typography color="text.secondary" fontSize={12} px={2} py={2}>
                  {connStatus === 'CONNECTED'
                    ? 'No conversations yet. Messages will appear when customers write to your office number.'
                    : 'Connect Baileys first to receive messages.'}
                </Typography>
              )}
              {enrichedInbox.map((conv) => (
                <ListItemButton
                  key={conv.conversationKey}
                  selected={selected?.conversationKey === conv.conversationKey}
                  onClick={() => openConversation(conv)}
                  sx={{ pr: 1 }}
                >
                  {/* Checkbox */}
                  <Checkbox
                    size="small"
                    checked={checkedKeys.has(conv.conversationKey)}
                    onClick={(e) => toggleCheck(e, conv.conversationKey)}
                    sx={{ p: 0.5, mr: 0.5 }}
                  />
                  <ListItemAvatar sx={{ minWidth: 42 }}>
                    <Badge badgeContent={conv.unreadCount || 0} color="success" max={99}>
                      <Avatar sx={{ width: 34, height: 34, fontSize: 14 }}>
                        {(conv.displayName || '?')[0].toUpperCase()}
                      </Avatar>
                    </Badge>
                  </ListItemAvatar>
                  <ListItemText
                    primary={conv.name || conv.formatted}
                    secondary={
                      conv.name ? (
                        <Typography component="span" fontSize={11} color="text.secondary" display="block" noWrap>
                          {conv.formatted}
                        </Typography>
                      ) : null
                    }
                    primaryTypographyProps={{ fontSize: 13, fontWeight: conv.unreadCount ? 700 : 400, noWrap: true }}
                  />
                  {/* Last message preview */}
                  <Box sx={{ minWidth: 0, textAlign: 'right', ml: 0.5 }}>
                    {isMediaType(conv.lastMessageType) ? (
                      <Box sx={{ color: 'text.secondary', fontSize: 11 }}>
                        <MediaLabel type={conv.lastMessageType} fontSize={11} />
                      </Box>
                    ) : (
                      <Typography fontSize={11} color="text.secondary" noWrap sx={{ maxWidth: 80 }}>
                        {conv.lastMessage}
                      </Typography>
                    )}
                  </Box>
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
              <Stack px={2} py={1} direction="row" alignItems="center" spacing={1} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box>
                  <Typography fontWeight={700} fontSize={14}>
                    {selectedConvDisplay?.name || selectedConvDisplay?.formatted}
                  </Typography>
                  {selectedConvDisplay?.name && (
                    <Typography fontSize={11} color="text.secondary">
                      {selectedConvDisplay.formatted}
                    </Typography>
                  )}
                </Box>
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
                      {isMediaType(msg.messageType) ? (
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ opacity: 0.85 }}>
                          <MediaLabel type={msg.messageType} fontSize={13} />
                        </Stack>
                      ) : (
                        <Typography fontSize={13}>{msg.bodyText || msg.body || ''}</Typography>
                      )}
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

      {/* Compose New Message dialog */}
      <Dialog open={composeOpen} onClose={() => setComposeOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New WhatsApp Message</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {composeError && <Alert severity="error">{composeError}</Alert>}
            <TextField
              label="To (phone number)"
              placeholder="919876543210"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
              fullWidth
              size="small"
              helperText="Enter number with country code, e.g. 919876543210"
            />
            <TextField
              label="Message"
              value={composeMsg}
              onChange={(e) => setComposeMsg(e.target.value)}
              fullWidth
              multiline
              rows={4}
              size="small"
              onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && handleComposeSend()}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setComposeOpen(false)} disabled={composeSending}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleComposeSend}
            disabled={composeSending || !normPhone(composeTo) || !composeMsg.trim()}
            startIcon={composeSending ? <CircularProgress size={14} /> : <SendIcon />}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign to {assignType}</DialogTitle>
        <DialogContent>
          <Typography fontSize={13} color="text.secondary" mb={1}>
            {checkedCount} conversation{checkedCount > 1 ? 's' : ''} selected:
          </Typography>
          {[...checkedKeys].map((key) => {
            const conv = enrichedInbox.find((c) => c.conversationKey === key);
            return (
              <Typography key={key} fontSize={13} fontWeight={500}>
                • {conv?.displayName || formatPhoneForDisplay(key)}
              </Typography>
            );
          })}
          <Alert severity="info" sx={{ mt: 2, fontSize: 12 }}>
            {assignType === 'Order'
              ? 'Go to the Orders section and link this contact to an existing or new order.'
              : 'Go to Follow-ups and tag this contact for a follow-up reminder.'}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => { setAssignOpen(false); clearChecked(); }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
