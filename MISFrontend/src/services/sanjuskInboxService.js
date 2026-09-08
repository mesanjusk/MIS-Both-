import {
  fetchSanjuskInboxMessages,
  sendSanjuskInboxText,
  sendSanjuskInboxMedia,
} from './sanjuskService';
import { uploadToCloudinary } from './whatsappCloudService';

/**
 * A drop-in data source for MessagesPanel that is backed entirely by the
 * SanjuSK WhatsApp API configured under Admin → API — never the direct-Meta
 * account. It matches the shape MessagesPanel already expects from
 * whatsappCloudService (getMessages / sendTextMessage / sendMediaMessage), so
 * the same web-style inbox UI works unchanged against SanjuSK.
 */

const getMessages = () => fetchSanjuskInboxMessages({ limit: 100 });

const sendTextMessage = ({ to, body }) => sendSanjuskInboxText({ to, text: body });

/**
 * SanjuSK sends media by public link, not multipart upload, so the file is
 * pushed to Cloudinary first (the same host MIS already uses for WhatsApp
 * media) and the resulting URL is handed to the API.
 */
const sendMediaMessage = async (formData) => {
  const file = formData.get('file');
  const to = String(formData.get('to') || '');
  const type = String(formData.get('type') || 'image');
  const caption = String(formData.get('caption') || '');

  const link = await uploadToCloudinary({ file, type });
  if (!link) {
    throw new Error('Could not upload the attachment.');
  }

  return sendSanjuskInboxMedia({
    to,
    type,
    link,
    caption,
    filename: file?.name || '',
  });
};

export const sanjuskInboxService = {
  getMessages,
  sendTextMessage,
  sendMediaMessage,
};

export default sanjuskInboxService;
