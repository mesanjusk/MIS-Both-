import React from 'react';
import ChatHeader from './ChatHeader.jsx';
import ChatInput from './ChatInput.jsx';
import ChatMessages from './ChatMessages.jsx';

const ChatWindow = ({
  darkMode,
  selectedCustomer,
  status,
  statusState,
  statusError,
  lastStatusCheckedAt,
  messages,
  isMessagesLoading,
  messagesError,
  chatRef,
  message,
  onMessageChange,
  onSend,
  sending,
}) => (
  <div className="flex-1 flex flex-col">
    <ChatHeader
      selectedCustomer={selectedCustomer}
      status={status}
      statusState={statusState}
      statusError={statusError}
      lastStatusCheckedAt={lastStatusCheckedAt}
      darkMode={darkMode}
    />
    <ChatMessages
      selectedCustomer={selectedCustomer}
      messages={messages}
      isLoading={isMessagesLoading}
      error={messagesError}
      chatRef={chatRef}
    />
    <ChatInput
      darkMode={darkMode}
      selectedCustomer={selectedCustomer}
      message={message}
      onChange={onMessageChange}
      onSend={onSend}
      sending={sending}
      canSend={statusState === 'connected'}
    />
  </div>
);

export default ChatWindow;
