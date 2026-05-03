import React, { useEffect } from 'react';
import { useNavigate, useLocation } from "react-router-dom";
import ChatSidebar from '../components/whatsapp/ChatSidebar.jsx';
import ChatWindow from '../components/whatsapp/ChatWindow.jsx';
import useWhatsAppChat from '../hooks/useWhatsAppChat.js';

export default function WhatsAppClient() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    chatRef,
    darkMode,
    filteredList,
    handleSearchNumber,
    message,
    messages,
    search,
    selectedCustomer,
    sendMessage,
    sending,
    setDarkMode,
    setMessage,
    setSearch,
    status,
    statusState,
    statusError,
    lastStatusCheckedAt,
    isChatListLoading,
    chatListError,
    isMessagesLoading,
    messagesError,
    reloadChatList,
    openChat,
  } = useWhatsAppChat();

  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name');
    if (!user) navigate("/");
  }, [location.state, navigate]);

  return (
    <div
      className={`flex h-screen ${darkMode ? 'bg-[#111b21]' : 'bg-gray-100'} transition-colors flex-col md:flex-row`}
    >
      <ChatSidebar
        darkMode={darkMode}
        search={search}
        onSearchChange={setSearch}
        onSearchNumber={handleSearchNumber}
        filteredList={filteredList}
        selectedCustomer={selectedCustomer}
        onSelectCustomer={openChat}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        isLoading={isChatListLoading}
        error={chatListError}
        onRetry={reloadChatList}
      />

      <ChatWindow
        darkMode={darkMode}
        selectedCustomer={selectedCustomer}
        status={status}
        statusState={statusState}
        statusError={statusError}
        lastStatusCheckedAt={lastStatusCheckedAt}
        messages={messages}
        isMessagesLoading={isMessagesLoading}
        messagesError={messagesError}
        chatRef={chatRef}
        message={message}
        onMessageChange={setMessage}
        onSend={sendMessage}
        sending={sending}
      />
    </div>
  );
}
