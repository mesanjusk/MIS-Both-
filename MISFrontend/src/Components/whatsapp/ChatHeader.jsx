import React from 'react';

const statusStyles = {
  loading: 'bg-amber-50 text-amber-700',
  connected: 'bg-emerald-50 text-emerald-700',
  disconnected: 'bg-red-50 text-red-700',
  error: 'bg-red-50 text-red-700',
};

const formatCheckedAt = (value) => {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not checked yet';
  return `Last checked ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

const ChatHeader = ({ selectedCustomer, status, statusState, statusError, lastStatusCheckedAt, darkMode }) => {
  const linkedOrders = selectedCustomer?.linkedOrders || selectedCustomer?.Orders || [];

  return (
    <div className={`${darkMode ? 'bg-[#202c33]' : 'bg-white'} p-4 border-b flex items-center justify-between gap-3`}>
      {selectedCustomer ? (
        <>
          <div>
            <div className="font-bold text-sm">{selectedCustomer?.Customer_name || 'Unknown Customer'}</div>
            <div className="text-xs text-gray-500">{selectedCustomer?.Mobile_number || '-'}</div>
            <div className="mt-1 text-[11px] text-gray-500">
              Linked Orders: {linkedOrders?.length || 0}
              {linkedOrders?.length ? ` • #${linkedOrders?.[0]?.Order_Number || linkedOrders?.[0]}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[statusState] || statusStyles.disconnected}`}>
              WhatsApp {status || 'Unavailable'}
            </div>
            <div className="mt-1 text-[11px] text-gray-400">{formatCheckedAt(lastStatusCheckedAt)}</div>
            {statusError ? <div className="mt-1 text-[11px] text-red-500">{statusError}</div> : null}
          </div>
        </>
      ) : (
        <div className="text-gray-500">Select a chat</div>
      )}
    </div>
  );
};

export default ChatHeader;
