
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Drawer,
  IconButton, Paper, Stack, TextField, Typography,
  Dialog, DialogActions, DialogContent, DialogTitle,
} from '@mui/material';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import ContactsRoundedIcon from '@mui/icons-material/ContactsRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import InstagramIcon from '@mui/icons-material/Instagram';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import CallRoundedIcon from '@mui/icons-material/CallRounded';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { parseApiError } from '../utils/parseApiError';

const CHANNEL = {
  whatsapp: { label: 'WhatsApp', color: 'success', Icon: WhatsAppIcon },
  instagram: { label: 'Instagram', color: 'secondary', Icon: InstagramIcon },
  call: { label: 'Call', color: 'info', Icon: CallRoundedIcon },
  contacts: { label: 'Contacts', color: 'default', Icon: ContactsRoundedIcon },
};
const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
function ChannelChip({ source }) {
  const data = CHANNEL[source];
  if (!data) return null;
  const Icon = data.Icon;
  return <Chip size="small" variant="outlined" color={data.color} icon={<Icon sx={{ fontSize: 15 }} />} label={data.label} />;
}

export default function HomeLeads() {
  const { isSuperAdmin } = useAuth();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('all');
  const [page, setPage] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newLeadName, setNewLeadName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [selected, setSelected] = useState(null);
  const [linkPhone, setLinkPhone] = useState('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.get('/api/leads', {
        params: { page: page + 1, limit: 25, search: debouncedSearch, channel },
        cache: false,
      });
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setTotal(Number(data.total) || 0);
      setStatus(data.status || {});
      setError('');
    } catch (err) {
      setError(parseApiError(err, 'Unable to load leads'));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }, [page, debouncedSearch, channel]);
  useEffect(() => { load(); }, [load]);

  const syncInstagram = async () => {
    setSyncing(true);
    setNote('');
    try {
      const { data } = await apiClient.post('/api/leads/sync-instagram');
      if (data.status === 'needs_messaging_permission') {
        setNote('Instagram DM access is not approved on this connection. Reconnect the Instagram professional account after Meta messaging permission is enabled.');
      } else if (data.status === 'not_connected') {
        setNote('No connected Instagram professional account was found. Connect it under Social Accounts.');
      } else {
        setNote(`Instagram sync: ${data.imported || 0} messages checked. ${data.truncated ? 'Only the recent conversation window was checked. ' : ''}${data.errors?.join('; ') || ''}`);
      }
      await load();
    } catch (err) {
      setError(parseApiError(err, 'Instagram sync failed'));
    } finally {
      setSyncing(false);
    }
  };

  const linkInstagram = async () => {
    if (!selected?.instagramId || !linkPhone.trim()) return;
    setLinking(true);
    try {
      await apiClient.put('/api/leads/link-instagram', { instagramId: selected.instagramId, phone: linkPhone.trim() });
      setSelected(null);
      setLinkPhone('');
      setNote('Instagram and phone identities linked. Future messages and calls with this phone will appear under one lead.');
      await load();
    } catch (err) {
      setError(parseApiError(err, 'Unable to link Instagram account'));
    } finally {
      setLinking(false);
    }
  };

  const shown = leads;

  const importVcf = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.vcf$/i.test(file.name) || file.size > 20 * 1024 * 1024) {
      setError('Choose a .vcf file smaller than 20 MB.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    setError('');
    try {
      const { data } = await apiClient.post('/api/leads/import-vcf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });
      setNote('VCF imported: ' + data.uniquePhones + ' unique numbers; ' + data.added +
        ' new and ' + data.updated + ' existing. Customer Names and manual Lead Names were untouched.');
      setPage(0);
      await load();
    } catch (err) {
      setError(parseApiError(err, 'Could not import VCF contacts.'));
    } finally {
      setUploading(false);
    }
  };

  const addLead = async () => {
    setAdding(true);
    try {
      await apiClient.post('/api/leads/manual', { phone: newPhone, name: newLeadName });
      setAddOpen(false);
      setNewPhone('');
      setNewLeadName('');
      setNote('Lead saved independently of Customer Name.');
      setPage(0);
      await load();
    } catch (err) {
      setError(parseApiError(err, 'Unable to add lead.'));
    } finally {
      setAdding(false);
    }
  };

  const saveLeadName = async () => {
    if (!selected) return;
    setEditingName(true);
    try {
      await apiClient.patch('/api/leads/name', {
        ...(selected.phone ? { phone: selected.phone } : { instagramId: selected.instagramId }),
        name: leadName,
      });
      setSelected(null);
      setNote('Lead Name saved. Customer Name was not modified.');
      await load();
    } catch (err) {
      setError(parseApiError(err, 'Unable to save Lead Name.'));
    } finally {
      setEditingName(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PeopleAltRoundedIcon color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={800}>Unified Leads</Typography>
            <Typography variant="caption" color="text.secondary">One person, one lead across WhatsApp, Instagram and calls</Typography>
          </Box>
          <Chip size="small" label={loaded ? `${leads.length} leads` : 'Loading'} />
        </Stack>
        <Stack direction="row" gap={1} flexWrap="wrap">
          {isSuperAdmin && <Button size="small" variant="outlined" disabled={syncing} startIcon={syncing ? <CircularProgress size={16} /> : <InstagramIcon />} onClick={syncInstagram}>Sync Instagram</Button>}
          <Button size="small" variant="outlined" startIcon={<RefreshRoundedIcon />} disabled={busy} onClick={load}>Refresh</Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {note && <Alert severity="info" onClose={() => setNote('')}>{note}</Alert>}
      {status.instagram === 'not_connected' && <Alert severity="info">Instagram account not connected. Connect an Instagram professional account in Social Accounts to include DMs.</Alert>}
      {status.instagram === 'needs_messaging_permission' && <Alert severity="warning">Instagram publishing is connected, but DM reading needs the Meta <strong>instagram_manage_messages</strong> permission and account reconnection. WhatsApp and call leads remain available.</Alert>}
      {status.whatsapp === 'stored_only' && <Alert severity="warning">Live WhatsApp history is temporarily unavailable; showing saved messages.</Alert>}
      <Typography variant="caption" color="text.secondary">
        Call records include saved calls and dates imported through Call Logs. Two channels are merged only when they share a phone number or an admin links the Instagram identity; names alone are not treated as proof.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField size="small" fullWidth label="Search name, phone, Instagram or message" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
          {['all', 'whatsapp', 'instagram', 'call'].map((id) => (
            <Chip key={id} clickable color={channel === id ? 'primary' : 'default'}
              variant={channel === id ? 'filled' : 'outlined'}
              label={id === 'all' ? 'All' : CHANNEL[id].label}
              onClick={() => { setChannel(id); setPage(0); }} />
          ))}
        </Stack>
      </Stack>

      {busy && !loaded ? <CircularProgress size={24} sx={{ alignSelf: 'center' }} /> : null}
      {!busy && loaded && filtered.length === 0 && (
        <Alert severity="info">No matching leads yet. They appear here when a customer messages the connected WhatsApp or Instagram account, or call history is imported.</Alert>
      )}
      <Stack spacing={0.75}>
        {shown.map((lead) => (
          <Paper key={lead.id} variant="outlined" onClick={() => { setSelected(lead); setLinkPhone(lead.phone || ''); }}
            sx={{ p: 1.5, borderRadius: 2, cursor: 'pointer', '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} gap={1} justifyContent="space-between">
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography fontWeight={700} variant="body2">{lead.name || lead.phone || 'Instagram contact'}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {[lead.phone, lead.instagramHandle ? '@' + lead.instagramHandle : ''].filter(Boolean).join(' · ') || 'Instagram account ID ' + lead.instagramId}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.35 }}>{lead.lastContact?.detail || 'Contact received'}</Typography>
              </Box>
              <Stack spacing={0.5} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {lead.sources.map((source) => <ChannelChip key={source} source={source} />)}
                </Stack>
                <Typography variant="caption" color="text.secondary">First: {lead.firstContact?.source} · {formatDate(lead.firstContact?.at)}</Typography>
                <Typography variant="caption" color="text.secondary">Latest: {formatDate(lead.lastContact?.at)} · {lead.interactions} interactions</Typography>
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>
      {filtered.length > 25 && (
        <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1}>
          <Typography variant="caption" color="text.secondary">{page * 25 + 1}–{Math.min((page + 1) * 25, filtered.length)} of {filtered.length}</Typography>
          <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button size="small" disabled={(page + 1) * 25 >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </Stack>
      )}

      <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 450 }, p: 2 } }}>
        {selected && <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={800}>{selected.name}</Typography>
            <IconButton onClick={() => setSelected(null)}><CloseRoundedIcon /></IconButton>
          </Stack>
          <Typography variant="body2">{selected.phone || 'No linked mobile number'}</Typography>
          {selected.instagramHandle && <Typography variant="body2">Instagram: @{selected.instagramHandle}</Typography>}
          <Stack direction="row" spacing={0.75}>{selected.sources.map((source) => <ChannelChip key={source} source={source} />)}</Stack>
          <Divider />
          <Typography variant="subtitle2" fontWeight={700}>First contact: {formatDate(selected.firstContact?.at)} ({selected.firstContact?.source})</Typography>
          <Typography variant="caption" color="text.secondary">Recent interactions ({selected.interactions} recorded; showing latest 15)</Typography>
          {selected.history.map((event) => (
            <Box key={event.id} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
              <Stack direction="row" alignItems="center" gap={1}>
                <ChannelChip source={event.source} />
                <Typography variant="caption" color="text.secondary">{formatDate(event.at)}</Typography>
              </Stack>
              <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{event.detail || 'Interaction'}</Typography>
            </Box>
          ))}
          {isSuperAdmin && selected.instagramId && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" fontWeight={700}>Link Instagram to phone</Typography>
                <Typography variant="caption" color="text.secondary">Use the number confirmed by this contact. Messages and calls on that number will be combined under a single lead.</Typography>
                <TextField size="small" label="Confirmed WhatsApp / calling number" value={linkPhone} onChange={(e) => setLinkPhone(e.target.value)} />
                <Button variant="contained" size="small" disabled={linking || !linkPhone.trim()} startIcon={<LinkRoundedIcon />} onClick={linkInstagram}>Save verified link</Button>
              </Stack>
            </Paper>
          )}
        </Stack>}
      </Drawer>
    </Stack>
  );
}
