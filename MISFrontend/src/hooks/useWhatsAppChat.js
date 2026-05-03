import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import normalizeWhatsAppNumber from '../utils/normalizeNumber.js';
import { getApiBase } from '../apiClient.js';
import {
  fetchChatList,
  fetchCustomerByNumber,
  fetchCustomers,
  fetchMessagesByNumber,
  fetchWhatsAppStatus,
  sendWhatsAppMessage,
} from '../services/whatsappService.js';

const buildMessageObject = (message) => {
  const fromMe = typeof message.fromMe === 'boolean'
    ? message.fromMe
    : message.fromMe === 'true' || message.from === 'me';

  return {
    fromMe,
    from: message.from || (!fromMe ? message.number || '' : ''),
    to: message.to || (fromMe ? message.number || '' : ''),
    text: message.message ?? message.text ?? '',
    time: new Date(message.timestamp || message.time || Date.now()),
  };
};

const toFriendlyError = (error, fallback) => {
  const status = error?.response?.status;
  if (status === 401 || status === 403) return 'Your session expired. Please log in again.';
  if (!error?.response) return 'Network issue detected. Please check your connection.';
  if (status >= 500) return 'Server error. Please try again in a moment.';
  return error?.response?.data?.message || error?.message || fallback;
};

export const useWhatsAppChat = () => {
  const chatRef = useRef(null);
  const [darkMode, setDarkMode] = useState(false);
  const [status, setStatus] = useState('Checking WhatsApp connection...');
  const [statusState, setStatusState] = useState('loading');
  const [statusError, setStatusError] = useState('');
  const [lastStatusCheckedAt, setLastStatusCheckedAt] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [recentChats, setRecentChats] = useState([]);
  const [contactList, setContactList] = useState([]);
  const [isChatListLoading, setIsChatListLoading] = useState(true);
  const [chatListError, setChatListError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [lastMessageMap, setLastMessageMap] = useState({});
  const [socket, setSocket] = useState(null);
  const selectedCustomerRef = useRef(null);
  const latestOpenChatRequestRef = useRef(0);

  const checkStatus = useCallback(async () => {
    setStatusState((prev) => (prev === 'connected' || prev === 'disconnected' ? prev : 'loading'));
    setStatusError('');
    try {
      const res = await fetchWhatsAppStatus();
      const data = res?.data;
      const isConnected = data?.status === 'connected' || (Array.isArray(data?.data) && data.data.some((acc) => acc?.status === 'connected'));
      setIsReady(isConnected);
      setStatusState(isConnected ? 'connected' : 'disconnected');
      setStatus(isConnected ? 'Connected' : 'Disconnected');
    } catch (error) {
      setIsReady(false);
      setStatusState('error');
      const friendlyError = toFriendlyError(error, 'Unable to verify WhatsApp status.');
      setStatusError(friendlyError);
      setStatus('Status unavailable');
    } finally {
      setLastStatusCheckedAt(new Date());
    }
  }, []);

  useEffect(() => {
    let active = true;
    const base = getApiBase();
    if (active) {
      const socketInstance = io(base, { transports: ['websocket', 'polling'] });
      setSocket(socketInstance);
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!socket) return undefined;

    const handleReady = () => {
      setStatus('Connected');
      setStatusState('connected');
      setStatusError('');
      setIsReady(true);
      setLastStatusCheckedAt(new Date());
    };

    const handleIncomingMessage = async (data) => {
      const normalizedMessage = buildMessageObject(data);
      const senderNumber = normalizeWhatsAppNumber(
        data.number || (normalizedMessage.fromMe ? normalizedMessage.to : normalizedMessage.from),
      );
      const currentCustomer = selectedCustomerRef.current;
      const currentNumber = currentCustomer
        ? normalizeWhatsAppNumber(currentCustomer.Mobile_number)
        : null;

      if (currentCustomer && senderNumber === currentNumber) {
        setMessages((prev) => [...prev, normalizedMessage]);
      }

      try {
        const res = await fetchCustomerByNumber(senderNumber);
        if (res.data.success) {
          const customer = res.data.customer;
          setRecentChats((prev) => {
            const exists = prev.find((c) => c.Mobile_number === customer.Mobile_number);
            if (exists) {
              return [customer, ...prev.filter((c) => c.Mobile_number !== customer.Mobile_number)];
            }
            return [customer, ...prev];
          });

          setLastMessageMap((prev) => ({
            ...prev,
            [customer._id]: Date.now(),
          }));
        }
      } catch (err) {
        console.error('Incoming message fetch failed:', err);
      }
    };

    const handleDisconnected = () => {
      setStatus('Disconnected');
      setStatusState('disconnected');
      setIsReady(false);
      setLastStatusCheckedAt(new Date());
    };

    socket.on('ready', handleReady);
    socket.on('message', handleIncomingMessage);
    socket.on('new_message', handleIncomingMessage);
    socket.on('disconnect', handleDisconnected);

    return () => {
      socket.off('ready', handleReady);
      socket.off('message', handleIncomingMessage);
      socket.off('new_message', handleIncomingMessage);
      socket.off('disconnect', handleDisconnected);
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 12000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const loadChatList = useCallback(async () => {
    setIsChatListLoading(true);
    setChatListError('');

    const [chatListResult, customersResult] = await Promise.allSettled([fetchChatList(), fetchCustomers()]);

    let hasFailure = false;

    if (chatListResult.status === 'fulfilled' && chatListResult.value?.data?.success) {
      setRecentChats(chatListResult.value.data.list || []);
    } else if (chatListResult.status === 'rejected') {
      hasFailure = true;
    }

    if (customersResult.status === 'fulfilled' && customersResult.value?.data?.success) {
      setContactList(customersResult.value.data.result || []);
    } else if (customersResult.status === 'rejected') {
      hasFailure = true;
    }

    if (hasFailure) {
      const sourceError = chatListResult.status === 'rejected' ? chatListResult.reason : customersResult.reason;
      setChatListError(toFriendlyError(sourceError, 'Failed to load chats.'));
    }

    setIsChatListLoading(false);
  }, []);

  useEffect(() => {
    loadChatList();
  }, [loadChatList]);

  useEffect(() => {
    selectedCustomerRef.current = selectedCustomer;
  }, [selectedCustomer]);

  const openChat = async (customer) => {
    const requestId = Date.now();
    latestOpenChatRequestRef.current = requestId;

    setSelectedCustomer(customer);
    selectedCustomerRef.current = customer;
    setMessages([]);
    setMessagesError('');
    setIsMessagesLoading(true);

    try {
      const number = normalizeWhatsAppNumber(customer.Mobile_number);
      const res = await fetchMessagesByNumber(number);

      if (latestOpenChatRequestRef.current !== requestId) return;

      if (res.data.success) {
        setMessages((res.data.messages || []).map((msg) => buildMessageObject(msg)));
      }
    } catch (error) {
      if (latestOpenChatRequestRef.current !== requestId) return;
      setMessagesError(toFriendlyError(error, 'Failed to load messages for this number.'));
    } finally {
      if (latestOpenChatRequestRef.current === requestId) {
        setIsMessagesLoading(false);
      }
    }
  };

  const sendMessage = async () => {
    const currentCustomer = selectedCustomerRef.current;
    if (!currentCustomer || !message.trim() || !isReady || sending) return;
    const norm = normalizeWhatsAppNumber(currentCustomer.Mobile_number);
    const personalized = message.trim().replace(/\{name\}/gi, currentCustomer.Customer_name || norm);
    const msgObj = buildMessageObject({
      fromMe: true,
      from: 'me',
      to: norm,
      message: personalized,
      timestamp: Date.now(),
    });

    setSending(true);
    try {
      const res = await sendWhatsAppMessage({ number: norm, message: personalized });
      if (res.data.success) {
        setMessages((prev) => [...prev, msgObj]);
        setLastMessageMap((prev) => ({
          ...prev,
          [currentCustomer._id]: Date.now(),
        }));
        setMessage('');
      }
    } catch (err) {
      setMessagesError(toFriendlyError(err, 'Failed to send message.'));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const filteredList = useMemo(() => {
    if (search) {
      return contactList.filter(
        (c) =>
          c.Customer_name?.toLowerCase().includes(search.toLowerCase()) ||
          c.Mobile_number?.includes(search),
      );
    }

    return [...recentChats].sort((a, b) => (lastMessageMap[b._id] || 0) - (lastMessageMap[a._id] || 0));
  }, [contactList, lastMessageMap, recentChats, search]);

  const handleSearchNumber = () => {
    if (search && !filteredList.find((c) => c.Mobile_number === search)) {
      const normalized = normalizeWhatsAppNumber(search);
      const newCustomer = {
        _id: `custom-number-${normalized}`,
        Customer_name: `+${normalized}`,
        Mobile_number: normalized,
      };
      setSelectedCustomer(newCustomer);
      selectedCustomerRef.current = newCustomer;
      setMessages([]);
      setMessagesError('');
    }
  };

  return {
    chatRef,
    darkMode,
    filteredList,
    handleSearchNumber,
    isReady,
    isChatListLoading,
    chatListError,
    isMessagesLoading,
    messagesError,
    lastMessageMap,
    message,
    messages,
    openChat,
    reloadChatList: loadChatList,
    search,
    selectedCustomer,
    sendMessage,
    sending,
    setDarkMode,
    setMessage,
    setSearch,
    status,
    statusError,
    statusState,
    lastStatusCheckedAt,
  };
};

export default useWhatsAppChat;
