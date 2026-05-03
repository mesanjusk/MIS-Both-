import React from 'react';

const ChatSidebar = ({
  darkMode,
  search,
  onSearchChange,
  onSearchNumber,
  filteredList,
  selectedCustomer,
  onSelectCustomer,
  onToggleDarkMode,
  isLoading,
  error,
  onRetry,
}) => (
  <div
    className={`${darkMode ? 'bg-[#202c33]' : 'bg-white'} md:w-80 w-full md:border-r border-b md:border-b-0 flex flex-col`}
  >
    <div className="p-4 flex justify-between items-center border-b">
      <div className="text-lg font-bold text-blue-600">WhatsApp</div>
      <button onClick={onToggleDarkMode} className="text-sm text-gray-500">
        {darkMode ? '🌞' : '🌙'}
      </button>
    </div>
    <div className="p-2 flex gap-2">
      <input
        type="text"
        className="w-full px-3 py-2 border rounded-md text-sm"
        placeholder="Search chat or number"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <button onClick={onSearchNumber} className="px-2 text-sm bg-blue-600 text-white rounded">
        Go
      </button>
    </div>
    <div className="overflow-y-auto flex-1">
      {isLoading ? <p className="p-4 text-sm text-gray-500">Loading chats...</p> : null}
      {error ? (
        <div className="p-4 text-sm">
          <p className="text-red-500">{error}</p>
          <button type="button" onClick={onRetry} className="mt-2 rounded bg-blue-600 px-2.5 py-1 text-xs text-white">Retry</button>
        </div>
      ) : null}

      {!isLoading && !error && filteredList.map((c) => (
        <div
          key={c._id}
          onClick={() => onSelectCustomer(c)}
          className={`flex items-center p-3 hover:bg-gray-100 cursor-pointer ${selectedCustomer?._id === c._id ? 'bg-gray-200' : ''}`}
        >
          <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
            {c.Customer_name?.[0] || '+'}
          </div>
          <div className="ml-3">
            <div className="font-semibold text-sm">{c.Customer_name}</div>
            <div className="text-xs text-gray-500">{c.Mobile_number}</div>
          </div>
        </div>
      ))}
      {!isLoading && !error && !filteredList.length ? <p className="p-4 text-sm text-gray-500">No chats found.</p> : null}
    </div>
  </div>
);

export default ChatSidebar;
