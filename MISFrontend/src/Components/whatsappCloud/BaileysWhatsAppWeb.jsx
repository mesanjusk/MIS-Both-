import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon          from '@mui/icons-material/Send';
import RefreshIcon       from '@mui/icons-material/Refresh';
import AttachFileIcon    from '@mui/icons-material/AttachFile';
import ImageIcon         from '@mui/icons-material/Image';
import VideocamIcon      from '@mui/icons-material/Videocam';
import MicIcon           from '@mui/icons-material/Mic';
import DescriptionIcon   from '@mui/icons-material/Description';
import GroupsIcon        from '@mui/icons-material/Groups';
import LinkIcon          from '@mui/icons-material/Link';
import LinkOffIcon       from '@mui/icons-material/LinkOff';
import DoneIcon          from '@mui/icons-material/Done';
import DoneAllIcon       from '@mui/icons-material/DoneAll';
import ErrorOutlineIcon  from '@mui/icons-material/ErrorOutline';
import SearchIcon        from '@mui/icons-material/Search';
import {
  baileysGetStatus,
  baileysConnect,
  baileysDisconnect,
  baileysGetInbox,
  baileysGetGroupInbox,
  baileysGetConversation,
  baileysGetGroupConversation,
  baileysMarkRead,
  baileysGroupMarkRead,
  baileysSendText,
  baileysSendMedia,
  uploadToCloudinary,
} from '../../services/whatsappCloudService';

const stripApiSuffix = (url) => (url ? String(url).replace(/\/api\/?$/, '') : url);
const SOCKET_URL =
  stripApiSuffix(import.meta.env.VITE_SOCKET_URL) ||
  stripApiSuffix(import.meta.env.VITE_API_BASE) ||
  window.location.origin;

const STATUS_COLORS = { CONNECTED: 'success', QR_PENDING: 'warning', DISCONNECTED: 'default' };
const normPhone = (v) => String(v || '').replace(/\D/g, '');
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

function chatKeyOf(chat) {
  return chat.isGroup ? `g:${chat.groupId}` : `c:${chat.conversationKey}`;
}

// Merge individual + group inbox rows into one WhatsApp-Web-style chat list
function mergeChats(individual, groups) {
  const a = individual.map((c) => ({ ...c, isGroup: false }));
  const b = groups.map((c) => ({ ...c, isGroup: true }));
  return [...a, ...b].sort((x, y) => new Date(y.lastMessageAt || 0) - new Date(x.lastMessageAt || 0));
}

function TickIcon({ status }) {
  if (status === 'FAILED') return <ErrorOutlineIcon sx={{ fontSize: 14, color: 'error.main' }} />;
  if (status === 'READ')   return <DoneAllIcon sx={{ fontSize: 14, color: '#53bdeb' }} />;
  if (status === 'DELIVERED') return <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  if (status === 'SENT' || status === 'PENDING') return <DoneIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  return null;
}

function MessageBubble({ msg }) {
  const outgoing = msg.direction === 'OUTGOING';
  const type = String(msg.messageType || 'TEXT').toUpperCase();
  const url  = msg.mediaUrl || '';

  return (
    <Box sx={{ display: 'flex', justifyContent: outgoing ? 'flex-end' : 'flex-start', mb: 0.6 }}>
      <Box
        sx={{
          maxWidth: '70%',
          bgcolor: outgoing ? 'primary.main' : 'grey.100',
          color: outgoing ? 'white' : 'text.primary',
          borderRadius: 2,
          px: type === 'IMAGE' || type === 'VIDEO' ? 0.6 : 1.5,
          py: type === 'IMAGE' || type === 'VIDEO' ? 0.6 : 0.75,
          overflow: 'hidden',
        }}
      >
        {msg.direction === 'INCOMING' && msg.senderPhone && (
          <Typography fontSize={10} fontWeight={700} color="primary.dark" mb={0.25}>
            {msg.senderPhone}
          </Typography>
        )}

        {type === 'IMAGE' && url && (
          <Box component="img" src={url} alt="" sx={{ maxWidth: 260, maxHeight: 260, borderRadius: 1.5, display: 'block' }} />
        )}
        {type === 'VIDEO' && url && (
          <Box component="video" src={url} controls sx={{ maxWidth: 260, maxHeight: 260, borderRadius: 1.5, display: 'block' }} />
        )}
        {type === 'AUDIO' && url && (
          <Box component="audio" src={url} controls sx={{ maxWidth: 260 }} />
        )}
        {type === 'DOCUMENT' && (
          <Stack
            direction="row" alignItems="center" spacing={1}
            component={url ? 'a' : 'div'}
            href={url || undefined}
            target="_blank" rel="noreferrer"
            sx={{ color: 'inherit', textDecoration: 'none', p: 0.5 }}
          >
            <DescriptionIcon fontSize="small" />
            <Typography fontSize={13} sx={{ wordBreak: 'break-all' }}>
              {msg.meta?.fileName || 'Document'}
            </Typography>
          </Stack>
        )}

        {(msg.bodyText || (type === 'TEXT')) && (
          <Typography fontSize={13} sx={{ px: type === 'IMAGE' || type === 'VIDEO' ? 0.9 : 0, pt: type === 'IMAGE' || type === 'VIDEO' ? 0.5 : 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {msg.bodyText || ''}
          </Typography>
        )}

        <Stack direction="row" spacing={0.4} justifyContent="flex-end" alignItems="center" sx={{ px: type === 'IMAGE' || type === 'VIDEO' ? 0.9 : 0, pb: type === 'IMAGE' || type === 'VIDEO' ? 0.3 : 0 }}>
          <Typography fontSize={10} sx={{ opacity: 0.7 }}>{fmtTime(msg.createdAt)}</Typography>
          {outgoing && <TickIcon status={msg.status} />}
        </Stack>
      </Box>
    </Box>
  );
}

export default function BaileysWhatsAppWeb() {
  const [status, setStatus]         = useState(null);
  const [connLoading, setConnLoading] = useState(false);

  const [individualChats, setIndividualChats] = useState([]);
  const [groupChats, setGroupChats]           = useState([]);
  const [loadingChats, setLoadingChats]       = useState(false);
  const [search, setSearch]                   = useState('');

  const [selected, setSelected]     = useState(null); // merged chat object
  const [messages, setMessages]     = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [text, setText]     = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]   = useState('');

  const [attachAnchor, setAttachAnchor] = useState(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const docInputRef   = useRef(null);
  const [uploading, setUploading] = useState(false);

  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await baileysGetStatus();
      setStatus(res.data);
    } catch {
      setStatus((prev) => prev || { status: 'DISCONNECTED', qr: null, phone: '' });
    }
  }, []);

  const fetchChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const [indRes, grpRes] = await Promise.all([baileysGetInbox(), baileysGetGroupInbox()]);
      setIndividualChats(indRes.data || []);
      setGroupChats(grpRes.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  }, []);

  // Poll status: fast while QR pending, slower once settled
  useEffect(() => {
    fetchStatus();
    const interval = status?.status === 'QR_PENDING' ? 4000 : 15000;
    const timer = setInterval(fetchStatus, interval);
    return () => clearInterval(timer);
  }, [fetchStatus, status?.status]);

  useEffect(() => {
    fetchChats();
    const timer = setInterval(fetchChats, 30_000);
    return () => clearInterval(timer);
  }, [fetchChats]);

  // Real-time updates
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { token: getStoredToken() } });

    socket.on('new_message', (data) => {
      if (data?.provider !== 'baileys') return;

      if (data?.type === 'status') {
        setStatus(data);
        return;
      }

      const msg = data?.message;
      if (!msg) return;

      // Delivery/read receipt — patch status on the existing bubble in place
      if (data?.event === 'message_status') {
        setMessages((prev) => prev.map((m) => ((m._id || m.id) === (msg._id || msg.id) ? { ...m, status: msg.status } : m)));
        return;
      }

      fetchChats();

      const sel = selectedRef.current;
      if (!sel) return;
      const matchesSelected = sel.isGroup
        ? (msg.groupId === sel.groupId || msg.conversationKey === sel.groupId)
        : normPhone(msg.conversationKey || msg.from || msg.to) === normPhone(sel.conversationKey);

      if (matchesSelected) {
        setMessages((prev) => {
          const id = msg._id || msg.id;
          if (id && prev.some((m) => (m._id || m.id) === id)) return prev;
          return [...prev, msg];
        });
      }
    });

    return () => { socket.disconnect(); };
  }, [fetchChats]);

  const handleConnect = async () => {
    setConnLoading(true);
    setError('');
    try {
      await baileysConnect();
      await fetchStatus();
    } catch (err) {
      setError(err?.response?.data?.message || 'Connection failed');
    } finally {
      setConnLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setConnLoading(true);
    setError('');
    try {
      await baileysDisconnect();
      await fetchStatus();
    } catch (err) {
      setError(err?.response?.data?.message || 'Disconnect failed');
    } finally {
      setConnLoading(false);
    }
  };

  const openChat = async (chat) => {
    setSelected(chat);
    setLoadingMsgs(true);
    try {
      if (chat.isGroup) {
        const res = await baileysGetGroupConversation(chat.groupId);
        setMessages(res.data || []);
        await baileysGroupMarkRead(chat.groupId).catch(() => {});
        setGroupChats((prev) => prev.map((c) => (c.groupId === chat.groupId ? { ...c, unreadCount: 0 } : c)));
      } else {
        const res = await baileysGetConversation(chat.conversationKey);
        setMessages(res.data || []);
        await baileysMarkRead(chat.conversationKey).catch(() => {});
        setIndividualChats((prev) => prev.map((c) => (c.conversationKey === chat.conversationKey ? { ...c, unreadCount: 0 } : c)));
      }
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  };

  const refreshOpenConversation = async () => {
    const sel = selectedRef.current;
    if (!sel) return;
    const res = sel.isGroup
      ? await baileysGetGroupConversation(sel.groupId)
      : await baileysGetConversation(sel.conversationKey);
    setMessages(res.data || []);
  };

  const handleSendText = async () => {
    if (!selected || !text.trim()) return;
    setSending(true);
    setError('');
    try {
      const to = selected.isGroup ? selected.groupId : selected.phone;
      await baileysSendText({ to, text: text.trim(), groupName: selected.isGroup ? selected.groupName : undefined });
      setText('');
      await refreshOpenConversation();
    } catch (err) {
      setError(err?.response?.data?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleAttachPick = (kind) => {
    setAttachAnchor(null);
    if (kind === 'IMAGE') imageInputRef.current?.click();
    if (kind === 'VIDEO') videoInputRef.current?.click();
    if (kind === 'AUDIO') audioInputRef.current?.click();
    if (kind === 'DOCUMENT') docInputRef.current?.click();
  };

  const handleFileSelected = async (kind, file) => {
    if (!file || !selected) return;
    setUploading(true);
    setError('');
    try {
      const mediaUrl = await uploadToCloudinary({ file, type: kind.toLowerCase() });
      const to = selected.isGroup ? selected.groupId : selected.phone;
      await baileysSendMedia({
        to,
        mediaUrl,
        type: kind,
        caption: '',
        fileName: file.name || '',
        mimeType: file.type || '',
        groupName: selected.isGroup ? selected.groupName : undefined,
      });
      await refreshOpenConversation();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Media send failed');
    } finally {
      setUploading(false);
    }
  };

  const mergedChats = useMemo(() => mergeChats(individualChats, groupChats), [individualChats, groupChats]);
  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mergedChats;
    return mergedChats.filter((c) => {
      const label = c.isGroup ? (c.groupName || c.groupId) : (c.contactName || c.phone);
      return String(label || '').toLowerCase().includes(q);
    });
  }, [mergedChats, search]);

  const connStatus = status?.status || 'DISCONNECTED';
  const isConnected = connStatus === 'CONNECTED';
  const isQrPending = connStatus === 'QR_PENDING';

  return (
    <Box>
      {/* Top status bar */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1} px={0.5} flexWrap="wrap" rowGap={1}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Chip size="small" label={connStatus} color={STATUS_COLORS[connStatus] || 'default'} />
          {status?.phone && (
            <Typography variant="body2" color="text.secondary">+{status.phone}</Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={1}>
          {!isConnected && (
            <Button
              size="small" variant="contained" color="success"
              startIcon={connLoading ? <CircularProgress size={14} color="inherit" /> : <LinkIcon fontSize="small" />}
              onClick={handleConnect} disabled={connLoading}
            >
              {isQrPending ? 'Regenerate QR' : 'Connect'}
            </Button>
          )}
          {isConnected && (
            <Button
              size="small" variant="outlined" color="error"
              startIcon={connLoading ? <CircularProgress size={14} /> : <LinkOffIcon fontSize="small" />}
              onClick={handleDisconnect} disabled={connLoading}
            >
              Disconnect
            </Button>
          )}
          <IconButton size="small" onClick={() => { fetchChats(); fetchStatus(); }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', height: '72vh', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        {/* Sidebar — unified chat list */}
        <Box sx={{ width: 320, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          <Box px={1.5} py={1}>
            <TextField
              size="small" fullWidth placeholder="Search chats"
              value={search} onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
          </Box>
          <Divider />

          {loadingChats ? (
            <Box display="flex" justifyContent="center" py={3}><CircularProgress size={22} /></Box>
          ) : (
            <List dense sx={{ overflow: 'auto', flex: 1 }}>
              {filteredChats.length === 0 && (
                <Typography color="text.secondary" fontSize={12} px={2} py={2}>
                  {isConnected ? 'No chats yet. Messages will appear here.' : 'Connect WhatsApp above to see chats.'}
                </Typography>
              )}
              {filteredChats.map((chat) => {
                const key = chatKeyOf(chat);
                const name = chat.isGroup ? (chat.groupName || chat.groupId) : (chat.contactName || chat.phone);
                const isSelected = selected && chatKeyOf(selected) === key;
                return (
                  <ListItemButton key={key} selected={isSelected} onClick={() => openChat(chat)}>
                    <ListItemAvatar sx={{ minWidth: 46 }}>
                      <Badge badgeContent={chat.unreadCount || 0} color="success" max={99}>
                        <Avatar sx={{ width: 36, height: 36, fontSize: 14, bgcolor: chat.isGroup ? 'primary.main' : undefined }}>
                          {chat.isGroup ? <GroupsIcon fontSize="small" /> : (name || '?')[0]?.toUpperCase()}
                        </Avatar>
                      </Badge>
                    </ListItemAvatar>
                    <ListItemText
                      primary={name}
                      secondary={chat.lastMessage || ''}
                      primaryTypographyProps={{ fontSize: 13, fontWeight: chat.unreadCount ? 700 : 400, noWrap: true }}
                      secondaryTypographyProps={{ fontSize: 11, noWrap: true }}
                    />
                    <Typography fontSize={10} color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>
                      {chat.lastMessageAt ? fmtTime(chat.lastMessageAt) : ''}
                    </Typography>
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>

        {/* Right panel */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {isQrPending && status?.qr && !selected ? (
            <Box display="flex" alignItems="center" justifyContent="center" flex={1}>
              <Stack alignItems="center" spacing={1.5}>
                <Typography fontWeight={600}>Scan this QR code with WhatsApp</Typography>
                <Typography variant="caption" color="text.secondary">
                  Open WhatsApp → Linked Devices → Link a Device
                </Typography>
                <Box component="img" src={status.qr} alt="WhatsApp QR" sx={{ width: 260, height: 260, border: '1px solid', borderColor: 'divider', borderRadius: 2 }} />
              </Stack>
            </Box>
          ) : !selected ? (
            <Box display="flex" alignItems="center" justifyContent="center" flex={1}>
              <Typography color="text.secondary" fontSize={14}>
                {isConnected ? 'Select a chat to start messaging' : 'Not connected — click Connect above'}
              </Typography>
            </Box>
          ) : (
            <>
              <Stack px={2} py={1} direction="row" alignItems="center" spacing={1.5} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: selected.isGroup ? 'primary.main' : undefined }}>
                  {selected.isGroup ? <GroupsIcon fontSize="small" /> : (selected.contactName || selected.phone || '?')[0]?.toUpperCase()}
                </Avatar>
                <Box>
                  <Typography fontWeight={700} fontSize={14}>
                    {selected.isGroup ? (selected.groupName || selected.groupId) : (selected.contactName || selected.phone)}
                  </Typography>
                  {!selected.isGroup && selected.contactName && (
                    <Typography fontSize={11} color="text.secondary">{selected.phone}</Typography>
                  )}
                </Box>
              </Stack>

              <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
                {loadingMsgs && <Box display="flex" justifyContent="center" py={2}><CircularProgress size={20} /></Box>}
                {messages.map((msg, idx) => <MessageBubble key={msg._id || msg.id || idx} msg={msg} />)}
              </Box>

              <Stack direction="row" spacing={1} alignItems="center" px={2} py={1} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                <IconButton
                  size="small"
                  onClick={(e) => setAttachAnchor(e.currentTarget)}
                  disabled={!isConnected || uploading}
                >
                  {uploading ? <CircularProgress size={18} /> : <AttachFileIcon fontSize="small" />}
                </IconButton>
                <Menu anchorEl={attachAnchor} open={!!attachAnchor} onClose={() => setAttachAnchor(null)}>
                  <MenuItem onClick={() => handleAttachPick('IMAGE')}><ImageIcon fontSize="small" sx={{ mr: 1 }} /> Photo</MenuItem>
                  <MenuItem onClick={() => handleAttachPick('VIDEO')}><VideocamIcon fontSize="small" sx={{ mr: 1 }} /> Video</MenuItem>
                  <MenuItem onClick={() => handleAttachPick('AUDIO')}><MicIcon fontSize="small" sx={{ mr: 1 }} /> Audio</MenuItem>
                  <MenuItem onClick={() => handleAttachPick('DOCUMENT')}><DescriptionIcon fontSize="small" sx={{ mr: 1 }} /> Document</MenuItem>
                </Menu>

                <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e) => { handleFileSelected('IMAGE', e.target.files?.[0]); e.target.value = ''; }} />
                <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={(e) => { handleFileSelected('VIDEO', e.target.files?.[0]); e.target.value = ''; }} />
                <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={(e) => { handleFileSelected('AUDIO', e.target.files?.[0]); e.target.value = ''; }} />
                <input ref={docInputRef} type="file" hidden onChange={(e) => { handleFileSelected('DOCUMENT', e.target.files?.[0]); e.target.value = ''; }} />

                <TextField
                  size="small" fullWidth multiline maxRows={3}
                  placeholder={isConnected ? 'Type a message…' : 'Not connected'}
                  disabled={!isConnected}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendText())}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={handleSendText} disabled={sending || !text.trim() || !isConnected}>
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
