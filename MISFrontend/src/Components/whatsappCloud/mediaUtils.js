const isHttpUrl = (value) =>
  typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value.trim());

// SanjuSK's message history can return a hosted attachment link in the
// `message` or `body` string instead of `mediaUrl`. Meta/Cloudinary and
// newer provider payloads use dedicated media fields.
export const getMediaUrl = (message = {}) => {
  const candidates = [
    message?.mediaUrl, message?.media_url,
    message?.media?.url, message?.media?.link,
    message?.image?.url, message?.image?.link,
    message?.audio?.url, message?.audio?.link,
    message?.video?.url, message?.video?.link,
    message?.document?.url, message?.document?.link,
    message?.file?.url, message?.file?.link,
    message?.url, message?.link,
    message?.message, message?.body, message?.text,
  ];
  return candidates.find(isHttpUrl)?.trim() || '';
};

export const getMediaType = (message = {}) => {
  const raw = String(
    message?.messageType || message?.type || message?.payloadType || message?.contentType || ''
  ).toLowerCase();
  const mime = String(message?.mimeType || message?.mime_type || message?.media?.mime_type || '').toLowerCase();
  if (/(audio|voice|ptt)/.test(raw) || mime.startsWith('audio/')) return 'audio';
  if (raw.includes('video') || mime.startsWith('video/')) return 'video';
  if (raw.includes('image') || mime.startsWith('image/')) return 'image';
  if (raw.includes('sticker')) return 'sticker';
  if (/(document|file|pdf|attachment)/.test(raw) || mime === 'application/pdf') return 'document';
  return 'text';
};

export const getMediaCaption = (message = {}) => {
  const candidates = [
    message?.caption,
    message?.body,
    message?.text?.body,
    message?.text,
    message?.message,
  ];
  const mediaId = String(message?.mediaId || message?.media_id || '');
  return candidates.find((text) =>
    typeof text === 'string' &&
    text.trim() &&
    !isHttpUrl(text) &&
    text.trim() !== mediaId &&
    !/^\d{10,}$/.test(text.trim())
  )?.trim() || '';
};
