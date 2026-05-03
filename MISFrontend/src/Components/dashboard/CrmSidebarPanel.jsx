import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SellRoundedIcon from '@mui/icons-material/SellRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import normalizeWhatsAppNumber from '../../utils/normalizeNumber';
import { fetchCustomers, fetchMessagesByNumber } from '../../services/whatsappService';

const FILTERS = ['all', 'hot', 'warm', 'cold'];

const toMillis = (value) => {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
};

const getStatusByLastActivity = (timestamp) => {
  const ageHours = Math.abs(Date.now() - timestamp) / (1000 * 60 * 60);
  if (ageHours <= 24) return 'hot';
  if (ageHours <= 72) return 'warm';
  return 'cold';
};

const formatRelativeTime = (timestamp) => {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export default function CrmSidebarPanel() {
  const [contacts, setContacts] = useState([]);
  const [tagsByContact, setTagsByContact] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [newTag, setNewTag] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isContactsLoading, setIsContactsLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    const loadContacts = async () => {
      setIsContactsLoading(true);
      try {
        const response = await fetchCustomers();
        const list = response?.data?.result || [];

        const normalizedContacts = list.map((contact) => {
          const updatedAt = toMillis(contact?.UpdatedAt || contact?.CreatedAt || Date.now());
          return {
            id: contact?._id || contact?.Customer_uuid || contact?.Mobile_number,
            name: contact?.Customer_name || 'Unknown',
            company: contact?.Customer_group || 'No Group',
            mobile: normalizeWhatsAppNumber(contact?.Mobile_number || ''),
            lastSeenAt: updatedAt,
            status: getStatusByLastActivity(updatedAt),
          };
        });

        setContacts(normalizedContacts);
        setSelectedId((prev) => prev || normalizedContacts[0]?.id || '');
      } catch (error) {
        console.error('Failed to load CRM contacts', error);
        setContacts([]);
      } finally {
        setIsContactsLoading(false);
      }
    };

    loadContacts();
  }, []);

  const filteredContacts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return contacts.filter((contact) => {
      const localTags = tagsByContact[contact.id] || [];
      const matchesFilter = activeFilter === 'all' || contact.status === activeFilter;
      const matchesSearch =
        !query ||
        contact.name.toLowerCase().includes(query) ||
        contact.mobile.toLowerCase().includes(query) ||
        contact.company.toLowerCase().includes(query) ||
        localTags.some((tag) => tag.toLowerCase().includes(query));

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, contacts, searchTerm, tagsByContact]);

  const activeContact = useMemo(() => filteredContacts.find((contact) => contact.id === selectedId) || filteredContacts[0] || null, [filteredContacts, selectedId]);

  useEffect(() => {
    const loadChatHistory = async () => {
      if (!activeContact?.mobile) {
        setChatHistory([]);
        return;
      }

      setIsChatLoading(true);
      try {
        const response = await fetchMessagesByNumber(activeContact.mobile);
        const messages = response?.data?.messages || [];
        const mappedMessages = messages.map((item, index) => {
          const fromMe = typeof item?.fromMe === 'boolean' ? item.fromMe : item?.fromMe === 'true' || item?.from === 'me';
          const timestamp = toMillis(item?.timestamp || item?.time || item?.createdAt);

          return {
            id: `${activeContact.id}-${index}`,
            sender: fromMe ? 'agent' : 'contact',
            text: item?.message || item?.text || '',
            time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
        });

        setChatHistory(mappedMessages.slice(-25));
      } catch (error) {
        console.error('Failed to load CRM chat history', error);
        setChatHistory([]);
      } finally {
        setIsChatLoading(false);
      }
    };

    loadChatHistory();
  }, [activeContact?.id, activeContact?.mobile]);

  const activeContactTags = activeContact ? tagsByContact[activeContact.id] || [] : [];

  const addTag = (event) => {
    event.preventDefault();
    const tagValue = newTag.trim();
    if (!tagValue || !activeContact) return;

    setTagsByContact((prev) => {
      const currentTags = prev[activeContact.id] || [];
      if (currentTags.some((tag) => tag.toLowerCase() === tagValue.toLowerCase())) return prev;
      return { ...prev, [activeContact.id]: [...currentTags, tagValue] };
    });

    setNewTag('');
  };

  const removeTag = (tag) => {
    if (!activeContact) return;
    setTagsByContact((prev) => ({
      ...prev,
      [activeContact.id]: (prev[activeContact.id] || []).filter((currentTag) => currentTag !== tag),
    }));
  };

  return (
    <Card sx={{ p: 2.25, position: { lg: 'sticky' }, top: { lg: 88 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
        <Typography variant="subtitle1">CRM</Typography>
        <Chip size="small" label={`${filteredContacts.length} contacts`} />
      </Stack>

      <TextField
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Search contacts"
        fullWidth
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
      />

      <Stack direction="row" spacing={0.75} mt={1.5} flexWrap="wrap">
        {FILTERS.map((filter) => (
          <Chip
            key={filter}
            label={filter}
            onClick={() => setActiveFilter(filter)}
            color={activeFilter === filter ? 'primary' : 'default'}
            variant={activeFilter === filter ? 'filled' : 'outlined'}
            sx={{ textTransform: 'capitalize' }}
          />
        ))}
      </Stack>

      <List sx={{ maxHeight: 260, overflowY: 'auto', mt: 1 }}>
        {isContactsLoading && <Stack alignItems="center" py={2}><CircularProgress size={20} /></Stack>}
        {!isContactsLoading && filteredContacts.length === 0 && <Typography variant="caption" color="text.secondary">No contacts match this search.</Typography>}
        {filteredContacts.map((contact) => (
          <ListItemButton
            key={contact.id}
            selected={activeContact?.id === contact.id}
            onClick={() => setSelectedId(contact.id)}
            sx={{ borderRadius: 2, mb: 0.5, alignItems: 'flex-start' }}
          >
            <ListItemText
              primary={contact.name}
              secondary={`${contact.company} • +${contact.mobile || 'No number'}`}
              primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
            <Chip size="small" label={contact.status} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ my: 1.5 }} />

      {activeContact ? (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <PersonRoundedIcon color="disabled" />
            <Box>
              <Typography variant="body2" fontWeight={600}>{activeContact.name}</Typography>
              <Typography variant="caption" color="text.secondary">Last active {formatRelativeTime(activeContact.lastSeenAt)}</Typography>
            </Box>
          </Stack>

          <Box>
            <Typography variant="caption" color="text.secondary">Tags</Typography>
            <Stack direction="row" spacing={0.5} mt={0.75} flexWrap="wrap">
              {activeContactTags.map((tag) => (
                <Chip
                  key={tag}
                  size="small"
                  icon={<SellRoundedIcon fontSize="small" />}
                  label={tag}
                  onDelete={() => removeTag(tag)}
                  deleteIcon={<CloseRoundedIcon fontSize="small" />}
                />
              ))}
              {activeContactTags.length === 0 && <Typography variant="caption" color="text.secondary">No tags yet.</Typography>}
            </Stack>

            <Stack component="form" onSubmit={addTag} direction="row" spacing={1} mt={1}>
              <TextField size="small" value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Add tag" fullWidth />
              <Button type="submit" variant="contained">Add</Button>
            </Stack>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">Chat History</Typography>
            <Stack spacing={1} sx={{ maxHeight: 180, overflowY: 'auto', mt: 1 }}>
              {isChatLoading && <CircularProgress size={18} />}
              {!isChatLoading && chatHistory.length === 0 && <Alert severity="info">No chat history found.</Alert>}
              {chatHistory.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    p: 1,
                    borderRadius: 1.5,
                    maxWidth: '92%',
                    alignSelf: item.sender === 'agent' ? 'flex-end' : 'flex-start',
                    bgcolor: item.sender === 'agent' ? 'primary.main' : 'grey.100',
                    color: item.sender === 'agent' ? 'primary.contrastText' : 'text.primary',
                  }}
                >
                  <Typography variant="caption">{item.text}</Typography>
                  <Typography variant="caption" display="block" sx={{ opacity: 0.75, mt: 0.3 }}>{item.time}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      ) : (
        <Typography variant="caption" color="text.secondary">Choose a contact to see details.</Typography>
      )}
    </Card>
  );
}
