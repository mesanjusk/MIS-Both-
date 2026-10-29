import { Stack, Typography } from '@mui/material';
import FileMessage from './FileMessage';
import ImageMessage from './ImageMessage';
import { getMediaCaption, getMediaUrl } from './mediaUtils';
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
  const caption = getMediaCaption(message);

  if (safeType === 'image') {
    return (
      <>
        <ImageMessage message={message} />
        {caption ? <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{caption}</Typography> : null}
      </>
    );
  }

  if (safeType === 'document') {
    return (
      <>
        <FileMessage message={message} />
        {caption ? <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{caption}</Typography> : null}
      </>
    );
  }

  if (safeType === 'video') {
    const mediaUrl = getMediaUrl(message);
    return mediaUrl ? <video controls style={{ maxHeight: 320, width: '100%', borderRadius: 12, backgroundColor: '#000' }}><source src={mediaUrl} /></video> : <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.8 }}>Video unavailable</Typography>;
  }

  if (safeType === 'audio') {
    const mediaUrl = getMediaUrl(message);
    return mediaUrl ? (
      <Stack spacing={0.5}>
        <audio controls preload="metadata" src={mediaUrl} style={{ width: '100%', minWidth: 210 }} />
        {caption ? <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{caption}</Typography> : null}
        <Typography component="a" href={mediaUrl} target="_blank" rel="noreferrer" variant="caption">
          Open or download voice note
        </Typography>
      </Stack>
    ) : <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.8 }}>Audio unavailable</Typography>;
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
