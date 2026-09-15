// What a message says, and what to show for it in the conversation list.
//
// These are not the same question. A media message carries the file itself,
// and whatever sits in its text field is usually a handle rather than words:
// the provider stores the caption if there was one, and failing that the
// Meta media id (Metabsp's parseIncoming uses `caption || mediaNode.id`) or,
// for provider-hosted media, the URL of the file. Rendering that verbatim put
// rows like "🖼️ 1090036290170293" and full https:// URLs in the chat list,
// where a person is scanning for which conversation to open.
//
// So the list asks for a preview, not the raw text: a real caption when there
// is one, and the kind of attachment when there is not.

const UNSUPPORTED = 'Unsupported message payload';

/** The message's own text, unchanged. Used for identity and for the bubble. */
export const getMessageText = (message) =>
  message?.body ||
  message?.text?.body ||
  message?.text ||
  message?.message ||
  UNSUPPORTED;

const MEDIA_LABELS = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice message',
  voice: 'Voice message',
  document: 'Document',
  sticker: 'Sticker',
};

const isUrl = (value) => /^https?:\/\/\S+$/i.test(value);

// Meta media ids are long digit strings. A caption that is nothing but ten or
// more digits is not impossible — an order number, say — but it is far more
// likely to be an id, and showing "Photo" for it costs the reader nothing
// while showing the id tells them nothing.
const isBareId = (value) => /^\d{10,}$/.test(value);

/**
 * The line to show under a conversation's name.
 *
 * Non-media messages are returned exactly as before. For media, a genuine
 * caption wins; otherwise the attachment kind is named.
 */
export const getConversationPreview = (message) => {
  const text = getMessageText(message);
  const type = String(message?.messageType || message?.type || '').toLowerCase();
  const label = MEDIA_LABELS[type];

  if (!label) return text;

  const caption = String(message?.caption || '').trim();
  if (caption && !isBareId(caption) && !isUrl(caption)) return caption;

  const trimmed = String(text || '').trim();
  const mediaId = String(message?.mediaId || '').trim();
  const isHandle =
    !trimmed ||
    trimmed === UNSUPPORTED ||
    trimmed === mediaId ||
    isUrl(trimmed) ||
    isBareId(trimmed);

  return isHandle ? label : trimmed;
};
