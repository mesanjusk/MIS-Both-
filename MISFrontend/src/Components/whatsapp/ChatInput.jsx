import React from 'react';

const QUICK_REPLIES = ['Check Order', 'Make Payment', 'Talk to Admin'];

const ChatInput = ({ darkMode, selectedCustomer, message, onChange, onSend, sending, canSend }) => {
  const hasMessage = Boolean(message?.trim());
  const sendDisabled = sending || !hasMessage || !selectedCustomer || !canSend;

  return (
    <div className={`${darkMode ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'} p-3 border-t space-y-2`}>
      {selectedCustomer && (
        <div className="flex flex-wrap gap-2">
          {QUICK_REPLIES.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => onChange?.(`${message ? `${message} ` : ''}${reply}`)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50"
              disabled={!canSend}
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input
          type="text"
          disabled={!selectedCustomer || !canSend}
          value={message}
          onChange={(e) => onChange(e.target.value)}
          placeholder={!selectedCustomer ? 'Select customer to start chat' : !canSend ? 'Connect WhatsApp to send messages' : 'Type a message...'}
          className="flex-1 rounded-full px-4 py-2 text-sm border border-gray-300 focus:outline-none"
        />
        <button
          onClick={onSend}
          disabled={sendDisabled}
          className="px-4 py-2 rounded-full bg-[#25d366] text-white text-sm disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
