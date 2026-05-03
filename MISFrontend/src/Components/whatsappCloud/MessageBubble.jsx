import MessageRenderer from './MessageRenderer';

const getStatusLabel = (status) => {
  if (!status) return 'sent';
  return String(status).toLowerCase();
};

const formatMessageTime = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getMessageType = (message) => {
  const candidates = [
    message?.messageType,
    message?.type,
    message?.payloadType,
    message?.contentType,
  ].filter(Boolean);

  const resolved = String(candidates[0] || 'text').toLowerCase();

  if (['image', 'video', 'audio', 'document', 'sticker', 'text'].includes(resolved)) {
    return resolved;
  }

  if (resolved.includes('image')) return 'image';
  if (resolved.includes('video')) return 'video';
  if (resolved.includes('audio')) return 'audio';
  if (resolved.includes('document') || resolved.includes('file')) return 'document';
  if (resolved.includes('sticker')) return 'sticker';

  return 'text';
};

const isMediaType = (type) => ['image', 'video', 'audio', 'document', 'sticker'].includes(type);

export default function MessageBubble({ message, isOutgoing, timestamp, onRetry }) {
  const status = getStatusLabel(message?.status);
  const canRetry = isOutgoing && ['failed', 'error', 'undelivered'].includes(status);
  const messageType = getMessageType(message);
  const isUploading = Boolean(message?.isUploading);

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <article
        className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[72%] ${
          isOutgoing ? 'rounded-br-md bg-green-600 text-white' : 'rounded-bl-md bg-white text-gray-900'
        }`}
      >
        {isUploading ? <p className="mb-2 text-xs font-medium opacity-85">Uploading media...</p> : null}

        <MessageRenderer message={message} type={messageType} />

        <div className={`mt-2 flex items-center justify-end gap-2 text-[11px] ${isOutgoing ? 'text-green-100' : 'text-gray-500'}`}>
          <span>{formatMessageTime(timestamp)}</span>
          <span className="capitalize">{status}</span>
          {isMediaType(messageType) ? <span className="uppercase">{messageType}</span> : null}
        </div>

        {canRetry ? (
          <button
            type="button"
            onClick={() => onRetry?.(message)}
            className="mt-2 rounded-md bg-white/95 px-2 py-1 text-xs font-semibold text-red-600"
          >
            Retry
          </button>
        ) : null}
      </article>
    </div>
  );
}
