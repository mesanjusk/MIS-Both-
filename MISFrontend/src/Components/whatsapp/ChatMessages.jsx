import React from 'react';

const ChatMessages = ({ selectedCustomer, messages, isLoading, error, chatRef }) => (
  <div
    ref={chatRef}
    className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('/whatsapp-bg.png')] bg-cover"
  >
    {!selectedCustomer ? (
      <div className="text-center text-gray-400 mt-10">Select a contact to load messages</div>
    ) : isLoading ? (
      <div className="text-center text-gray-400 mt-10">Loading messages...</div>
    ) : error ? (
      <div className="text-center text-red-500 mt-10">{error}</div>
    ) : messages.length ? (
      messages.map((msg, i) => (
        <div
          key={i}
          className={`max-w-sm px-4 py-2 rounded-lg text-sm shadow-sm ${
            msg.fromMe ? 'bg-blue-100 ml-auto text-right' : 'bg-white mr-auto text-left'
          }`}
        >
          <div className="break-words">{msg.text}</div>
          <div className={`text-xs text-gray-400 mt-1 ${msg.fromMe ? 'text-right' : 'text-left'}`}>
            {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ))
    ) : (
      <div className="text-center text-gray-400 mt-10">No messages yet</div>
    )}
  </div>
);

export default ChatMessages;
