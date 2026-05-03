import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { io } from 'socket.io-client';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Avatar, Box, Divider, Stack, Typography } from '@mui/material';
import { toast } from '../../Components';
import { fetchCustomers } from '../../services/customerService';
import { whatsappCloudService } from '../../services/whatsappCloudService';
import { parseApiError } from '../../utils/parseApiError';
import { isOutside24hWindow } from '../../utils/whatsappWindow';
import {
  buildCustomerPhoneLookup,
  findCustomerByPhone,
  formatPhoneForDisplay,
  getCustomerDisplayName,
} from '../../utils/customerDirectory';
import ChatHeader from './ChatHeader';
import ChatWindow from './ChatWindow';
import ConversationList from './ConversationList';
import EmptyState from './EmptyState';
import LoadingSkeleton from './LoadingSkeleton';
import WhatsAppLayout from './WhatsAppLayout';

// Strip /api suffix from socket URL — socket.io connects to the root server, not /api
const stripApiSuffix = (url) => (url ? String(url).replace(/\/api\/?$/, "") : url);
const SOCKET_URL =
  stripApiSuffix(import.meta.env.VITE_SOCKET_URL) ||
  stripApiSuffix(import.meta.env.VITE_API_BASE) ||
  window.location.origin;

const getMessageText = (message) =>
  message?.body ||
  message?.text?.body ||
  message?.text ||
  message?.message ||
  'Unsupported message payload';

const getTimestampRaw = (message) =>
  message?.timestamp ?? message?.createdAt ?? message?.time;

const getMessageIdentity = (message) =>
  message?.id ||
  message?._id ||
  message?.messageId ||
  message?.wamid ||
  `${getTimestampRaw(message)}-${message?.from}-${message?.to}-${getMessageText(
    message
  )}`;

const normalizeIncomingMessage = (message) =>
  message?.data || message?.message || message;

const getMessageDirection = (message) => {
  const direction = String(message?.direction ?? message?.type ?? '').toLowerCase();
  if (direction.includes('out')) return 'outgoing';
  if (direction.includes('in')) return 'incoming';
  if (message?.fromMe || message?.isOutbound) return 'outgoing';
  return 'incoming';
};

const getContactForMessage = (message) =>
  getMessageDirection(message) === 'outgoing'
    ? String(message?.to ?? message?.recipient ?? 'Unknown')
    : String(message?.from ?? message?.sender ?? 'Unknown');

const normalizeConversationKey = (value) => {
  const source = String(value ?? '').trim();
  if (!source) return '';

  const digits = source.replace(/\D/g, '');
  return digits || source.toLowerCase();
};

const parseTimestampMs = (value) => {
  if (value == null || value === '') return 0;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) {
      return numericValue < 1e12 ? numericValue * 1000 : numericValue;
    }

    const parsedText = Date.parse(trimmed);
    return Number.isNaN(parsedText) ? 0 : parsedText;
  }

  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getMessageTimestampMs = (message) => {
  return parseTimestampMs(getTimestampRaw(message));
};

const normalizeMessages = (payload) => {
  const list = [
    payload,
    payload?.messages,
    payload?.items,
    payload?.data,
    payload?.data?.messages,
    payload?.data?.items,
  ].find(Array.isArray);

  return list ? list.filter(Boolean) : [];
};

const isUnreadMessage = (message) => {
  const status = String(message?.status ?? '').toLowerCase();
  return getMessageDirection(message) === 'incoming' && !['read', 'seen'].includes(status);
};

const toConversationFromContact = ({ contact, displayName, secondaryLabel }) => ({
  id: normalizeConversationKey(contact),
  contact,
  displayName: displayName || formatPhoneForDisplay(contact) || contact,
  secondaryLabel: secondaryLabel || formatPhoneForDisplay(contact) || contact,
  customerName: displayName || '',
  customerMobile: contact,
});

export default function MessagesPanel({ search: externalSearch }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [search, setSearch] = useState(externalSearch || '');
  const [activeConversationId, setActiveConversationId] = useState('');
  const [readCutoffByConversation, setReadCutoffByConversation] = useState({});
  const [showConversationList, setShowConversationList] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [customerError, setCustomerError] = useState('');
  const [draftConversation, setDraftConversation] = useState(null);
  const messagesContainerRef = useRef(null);
  const activeConversationIdRef = useRef('');

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const appendMessage = useCallback((incomingMessage) => {
    const message = normalizeIncomingMessage(incomingMessage);
    if (!message) return;

    const messageConversationId = normalizeConversationKey(getContactForMessage(message));
    if (
      getMessageDirection(message) === 'incoming' &&
      messageConversationId &&
      messageConversationId === activeConversationIdRef.current
    ) {
      const incomingTs = getMessageTimestampMs(message) || Date.now();
      setReadCutoffByConversation((prev) => ({
        ...prev,
        [messageConversationId]: Math.max(prev[messageConversationId] ?? 0, incomingTs),
      }));
    }

    setMessages((prev) => {
      const nextId = getMessageIdentity(message);
      const exists = prev.some((item) => getMessageIdentity(item) === nextId);

      if (exists) {
        return prev.map((item) =>
          getMessageIdentity(item) === nextId
            ? { ...item, ...message, isUploading: false }
            : item
        );
      }

      return [...prev, message];
    });
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await whatsappCloudService.getMessages();
      const payload = response?.data?.data ?? response?.data ?? [];
      setMessages(normalizeMessages(payload));
    } catch (error) {
      toast.error(parseApiError(error, 'Failed to load inbox messages.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setSearch(externalSearch || '');
  }, [externalSearch]);


  const loadCustomers = useCallback(async () => {
    try {
      setCustomerError('');
      const response = await fetchCustomers();
      if (response?.data?.success) {
        setCustomers(response.data.result || []);
      }
    } catch (error) {
      const errorMessage = parseApiError(error, 'Unable to load customers list.');
      setCustomerError(errorMessage);
      toast.error(errorMessage);
    }
  }, []);

  useEffect(() => {
    loadMessages();
    loadCustomers();
  }, [loadMessages, loadCustomers]);

  useEffect(() => {
    if (!SOCKET_URL || typeof io !== 'function') return undefined;

    const socket = io(SOCKET_URL, {
      transports: ['polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on('new_message', appendMessage);
    return () => socket.disconnect();
  }, [appendMessage]);

  useEffect(() => {
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const orderedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => getMessageTimestampMs(a) - getMessageTimestampMs(b)
      ),
    [messages]
  );


  const customerLookup = useMemo(() => buildCustomerPhoneLookup(customers), [customers]);

  const customerOptions = useMemo(() =>
    customers
      .map((customer) => {
        const customerName = getCustomerDisplayName(customer);
        const mobileNumber =
          customer?.Mobile_number || customer?.Mobile || customer?.mobile || customer?.phone || '';

        if (!customerName && !mobileNumber) return null;

        return {
          id: String(customer?.Customer_uuid || customer?._id || `${customerName}-${mobileNumber}`),
          name: customerName || formatPhoneForDisplay(mobileNumber),
          mobile: mobileNumber,
          mobileDisplay: formatPhoneForDisplay(mobileNumber),
        };
      })
      .filter(Boolean), [customers]);

  const markConversationAsRead = useCallback(
    (conversationId) => {
      if (!conversationId) return;

      const latestConversationMessageMs = orderedMessages.reduce((latest, message) => {
        const messageConversationId = normalizeConversationKey(getContactForMessage(message));
        if (messageConversationId !== conversationId) return latest;
        return Math.max(latest, getMessageTimestampMs(message));
      }, 0);

      const readAt = Math.max(Date.now(), latestConversationMessageMs);

      setReadCutoffByConversation((prev) => ({
        ...prev,
        [conversationId]: Math.max(prev[conversationId] ?? 0, readAt),
      }));
    },
    [orderedMessages]
  );

  const conversations = useMemo(() => {
    const map = new Map();

    orderedMessages.forEach((message) => {
      const contact = getContactForMessage(message);
      const conversationId = normalizeConversationKey(contact);
      if (!conversationId) return;

      const matchedCustomer = findCustomerByPhone(customerLookup, contact);
      const customerName = getCustomerDisplayName(matchedCustomer);
      const existing = map.get(conversationId) || {
        id: conversationId,
        contact,
        displayName: customerName || message?.profileName || message?.name || contact,
        secondaryLabel: formatPhoneForDisplay(contact),
        customerName,
        customerMobile: matchedCustomer?.Mobile_number || matchedCustomer?.Mobile || matchedCustomer?.mobile || '',
        lastMessage: '',
        lastTimestamp: null,
        lastUserMessageAt: null,
        unreadCount: 0,
      };

      const timestamp = getTimestampRaw(message);
      const timestampMs = getMessageTimestampMs(message);

      if (!existing.lastTimestamp || timestampMs >= parseTimestampMs(existing.lastTimestamp)) {
        existing.lastTimestamp = timestamp;
        existing.lastMessage = getMessageText(message);
        existing.lastMessageType = message?.messageType || message?.type;
      }

      const readCutoffTs = readCutoffByConversation[conversationId] ?? 0;
      if (isUnreadMessage(message) && timestampMs > readCutoffTs) {
        existing.unreadCount += 1;
      }

      if (getMessageDirection(message) === 'incoming') {
        const currentTs = timestampMs;
        const previousTs = parseTimestampMs(existing.lastUserMessageAt);

        if (!existing.lastUserMessageAt || currentTs >= previousTs) {
          existing.lastUserMessageAt = timestamp;
        }
      }

      map.set(conversationId, existing);
    });

    if (activeConversationId && map.has(activeConversationId)) {
      map.get(activeConversationId).unreadCount = 0;
    }

    const conversationRows = [...map.values()];

    if (draftConversation?.id) {
      const alreadyExists = conversationRows.some((item) => item.id === draftConversation.id);
      if (!alreadyExists) {
        conversationRows.unshift({
          ...draftConversation,
          lastMessage: draftConversation.lastMessage || 'Start conversation',
          lastTimestamp: draftConversation.lastTimestamp || new Date().toISOString(),
          unreadCount: 0,
          lastUserMessageAt: null,
        });
      }
    }

    return conversationRows.sort(
      (a, b) => parseTimestampMs(b.lastTimestamp) - parseTimestampMs(a.lastTimestamp)
    );
  }, [activeConversationId, customerLookup, draftConversation, orderedMessages, readCutoffByConversation]);

  const filteredConversations = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    if (!searchValue) return conversations;

    return conversations.filter((conversation) =>
      `${conversation.displayName} ${conversation.contact}`
        .toLowerCase()
        .includes(searchValue)
    );
  }, [conversations, search]);

  useEffect(() => {
    if (!conversations.length) {
      setActiveConversationId('');
      return;
    }

    if (!conversations.some((item) => item.id === activeConversationId)) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    markConversationAsRead(activeConversationId);
  }, [activeConversationId, markConversationAsRead]);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return conversations.find((item) => item.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const activeMessages = useMemo(
    () =>
      !activeConversation?.contact
        ? []
        : orderedMessages.filter(
            (message) =>
              normalizeConversationKey(getContactForMessage(message)) === activeConversation.id
          ),
    [orderedMessages, activeConversation]
  );

  const is24hExpired = useMemo(
    () => isOutside24hWindow(activeConversation?.lastUserMessageAt),
    [activeConversation?.lastUserMessageAt]
  );

  const conversationWindowOpen = !is24hExpired;

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
  }, [activeMessages]);

  const handleSend = useCallback(
    async (body) => {
      if (!activeConversation?.contact) return false;

      if (!conversationWindowOpen) {
        toast.error('24-hour session is closed. Use template messages only.');
        return false;
      }

      try {
        setIsSending(true);
        await whatsappCloudService.sendTextMessage({
          to: activeConversation.contact,
          body,
        });
        loadMessages();
        return true;
      } catch (error) {
        toast.error(parseApiError(error, 'Failed to send message.'));
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [activeConversation, conversationWindowOpen, loadMessages]
  );

  const handleSendAttachment = useCallback(
    async ({ file, type, caption }) => {
      if (!activeConversation?.contact || !conversationWindowOpen) return false;

      const optimisticId = `optimistic-${Date.now()}-${file.name}`;
      const previewUrl = URL.createObjectURL(file);

      try {
        setIsSending(true);

        setMessages((prev) => [
          ...prev,
          {
            id: optimisticId,
            to: activeConversation.contact,
            fromMe: true,
            status: 'sending',
            messageType: type,
            body: caption || '',
            filename: file.name,
            timestamp: new Date().toISOString(),
            isUploading: true,
            mediaUrl: previewUrl,
          },
        ]);

        const formData = new FormData();
        formData.append('to', activeConversation.contact);
        formData.append('type', type);
        formData.append('caption', caption || '');
        formData.append('file', file, file.name);

        await whatsappCloudService.sendMediaMessage(formData);
        loadMessages();
        return true;
      } catch (error) {
        setMessages((prev) => prev.filter((item) => item?.id !== optimisticId));
        toast.error(parseApiError(error, 'Failed to send attachment.'));
        return false;
      } finally {
        URL.revokeObjectURL(previewUrl);
        setIsSending(false);
      }
    },
    [activeConversation, conversationWindowOpen, loadMessages]
  );

  const handleRetry = useCallback(
    async (message) => {
      try {
        setIsSending(true);
        await whatsappCloudService.sendTextMessage({
          to: getContactForMessage(message),
          body: getMessageText(message),
        });
        loadMessages();
        return true;
      } catch {
        toast.error('Retry failed. Please try again.');
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [loadMessages]
  );

  const detailsPanel = activeConversation ? (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Stack alignItems="center" spacing={1}>
        <Avatar sx={{ width: 64, height: 64, bgcolor: '#16a34a' }}>
          {(activeConversation.displayName || activeConversation.contact || 'NA').slice(0, 2).toUpperCase()}
        </Avatar>
        <Typography variant="subtitle1" fontWeight={700} align="center">{activeConversation.displayName}</Typography>
        <Typography variant="caption" color="text.secondary" align="center">{activeConversation.secondaryLabel || activeConversation.contact}</Typography>
      </Stack>
      <Divider />
      <Stack direction="row" spacing={1} alignItems="center">
        <InfoOutlinedIcon fontSize="small" color="action" />
        <Typography variant="body2" color="text.secondary">24h window: {conversationWindowOpen ? 'Active' : 'Expired'}</Typography>
      </Stack>
    </Stack>
  ) : null;

  const chatArea = activeConversation ? (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <ChatHeader
        conversation={activeConversation}
        isLoading={isLoading}
        onRefresh={loadMessages}
        windowOpen={conversationWindowOpen}
        onBack={() => setShowConversationList(true)}
      />

      <ChatWindow
        messages={activeMessages}
        getMessageIdentity={getMessageIdentity}
        getMessageDirection={getMessageDirection}
        getTimestampRaw={getTimestampRaw}
        scrollRef={messagesContainerRef}
        canSend={Boolean(activeConversation) && !isSending && conversationWindowOpen}
        canSendTemplateOnly={is24hExpired}
        recipient={activeConversation?.contact || ''}
        onSend={handleSend}
        onSendAttachment={handleSendAttachment}
        onRetry={handleRetry}
      />
    </Stack>
  ) : (
    <EmptyState
      title="Select a conversation"
      description="Choose a chat from the left panel to start messaging."
    />
  );

  if (isLoading && !messages.length) {
    return <LoadingSkeleton lines={8} />;
  }

  return (
    <WhatsAppLayout
      sidebar={(
        <Box sx={{ display: { xs: showConversationList ? 'block' : 'none', lg: 'block' }, height: '100%' }}>
          <ConversationList
            customerOptions={customerOptions}
            customerLoadError={customerError}
            conversations={filteredConversations}
            activeConversationId={activeConversationId}
            onSelectConversation={(id) => {
              markConversationAsRead(id);
              setActiveConversationId(id);
              setShowConversationList(false);
            }}
            onRefresh={() => {
              loadMessages();
              loadCustomers();
            }}
            search={search}
            onSearch={setSearch}
            onSelectCustomer={(value) => {
              const selectedOption = typeof value === 'string'
                ? {
                    name: value.trim(),
                    mobile: value.trim(),
                    mobileDisplay: value.trim(),
                  }
                : value;

              const contact = selectedOption?.mobile || '';
              const conversation = toConversationFromContact({
                contact,
                displayName: selectedOption?.name,
                secondaryLabel: selectedOption?.mobileDisplay,
              });

              const id = conversation.id;
              if (!id) return;

              setDraftConversation(conversation);

              markConversationAsRead(id);
              setActiveConversationId(id);
              setShowConversationList(false);
            }}
          />
        </Box>
      )}
      main={(
        <Box sx={{ display: { xs: showConversationList ? 'none' : 'block', lg: 'block' }, height: '100%', minHeight: 0 }}>
          {chatArea}
        </Box>
      )}
      details={detailsPanel}
    />
  );
}

MessagesPanel.propTypes = {
  search: PropTypes.string,
};

MessagesPanel.defaultProps = {
  search: '',
};
