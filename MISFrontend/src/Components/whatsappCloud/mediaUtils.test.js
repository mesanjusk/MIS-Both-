import { describe, expect, it } from 'vitest';
import { getMediaCaption, getMediaType, getMediaUrl } from './mediaUtils';

describe('WhatsApp media compatibility', () => {
  it('plays SanjuSK voice notes when the hosted URL is in message text', () => {
    const message = { type: 'voice', message: 'https://media.example.com/voice.ogg?sig=123' };
    expect(getMediaType(message)).toBe('audio');
    expect(getMediaUrl(message)).toBe('https://media.example.com/voice.ogg?sig=123');
    expect(getMediaCaption(message)).toBe('');
  });

  it('supports Meta-style nested audio and document links', () => {
    expect(getMediaUrl({ audio: { link: 'https://cdn.example.com/audio.opus' } }))
      .toBe('https://cdn.example.com/audio.opus');
    expect(getMediaUrl({ document: { url: 'https://cdn.example.com/file.pdf' } }))
      .toBe('https://cdn.example.com/file.pdf');
    expect(getMediaType({ mimeType: 'audio/ogg' })).toBe('audio');
  });

  it('prefers the dedicated media URL and shows only genuine captions', () => {
    const message = {
      type: 'image',
      mediaUrl: 'https://cdn.example.com/image.jpg',
      body: 'https://old.example.com/other.jpg',
      caption: 'Customer proof',
    };
    expect(getMediaUrl(message)).toBe('https://cdn.example.com/image.jpg');
    expect(getMediaCaption(message)).toBe('Customer proof');
  });

  it('does not render unsafe schemes as playback URLs', () => {
    expect(getMediaUrl({ type: 'audio', message: 'javascript:alert(1)' })).toBe('');
    expect(getMediaUrl({ type: 'image', mediaUrl: 'data:text/html,abc' })).toBe('');
  });
});
