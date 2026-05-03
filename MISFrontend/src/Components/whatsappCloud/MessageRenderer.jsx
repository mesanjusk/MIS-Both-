import { Typography } from '@mui/material';
import FileMessage from './FileMessage';
import ImageMessage from './ImageMessage';
import PropTypes from 'prop-types';

const getTextFromMessage = (msg) => {
  if (typeof msg?.body === 'string' && msg.body.trim()) return msg.body;
  if (typeof msg?.text === 'string' && msg.text.trim()) return msg.text;
  if (typeof msg?.text?.body === 'string' && msg.text.body.trim()) return msg.text.body;
  if (typeof msg?.message === 'string' && msg.message.trim()) return msg.message;
  return '';
};

export default function MessageRenderer({ message, type }) {
  const safeType = String(type || '').toLowerCase();
  const text = getTextFromMessage(message);

  if (safeType === 'image') {
    return (
      <>
        <ImageMessage message={message} />
        {text ? <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</Typography> : null}
      </>
    );
  }

  if (safeType === 'document') {
    return (
      <>
        <FileMessage message={message} />
        {text ? <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</Typography> : null}
      </>
    );
  }

  if (safeType === 'video') {
    const mediaUrl = message?.mediaUrl || message?.video?.link || message?.url;
    return mediaUrl ? <video controls style={{ maxHeight: 320, width: '100%', borderRadius: 12, backgroundColor: '#000' }}><source src={mediaUrl} /></video> : <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.8 }}>Video unavailable</Typography>;
  }

  if (safeType === 'audio') {
    const mediaUrl = message?.mediaUrl || message?.audio?.link || message?.url;
    return mediaUrl ? <audio controls style={{ width: '100%' }}><source src={mediaUrl} /></audio> : <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.8 }}>Audio unavailable</Typography>;
  }

  return <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text || 'Unsupported message payload'}</Typography>;
}

MessageRenderer.propTypes = {
  message: PropTypes.object,
  type: PropTypes.string,
};

MessageRenderer.defaultProps = {
  message: null,
  type: 'text',
};
