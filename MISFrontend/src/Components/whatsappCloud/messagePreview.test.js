import { describe, expect, it } from 'vitest';
import { getConversationPreview, getMessageText } from './messagePreview';

// The chat list used to print a media message's raw text field, which for an
// uncaptioned image is the Meta media id (Metabsp's parseIncoming falls back to
// `mediaNode.id`) or, for provider-hosted media, the file URL. Rows read
// "🖼️ 1090036290170293" where a person is scanning for a conversation.

describe('getConversationPreview', () => {
  it('names the attachment when an image has no caption', () => {
    expect(
      getConversationPreview({ messageType: 'image', body: '1090036290170293', mediaId: '1090036290170293' })
    ).toBe('Photo');
  });

  it('names the attachment when the text is the hosted media URL', () => {
    expect(
      getConversationPreview({
        messageType: 'image',
        body: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
      })
    ).toBe('Photo');
  });

  it('names the attachment when there is no text at all', () => {
    expect(getConversationPreview({ messageType: 'document', body: '' })).toBe('Document');
  });

  it('prefers a real caption over the attachment kind', () => {
    expect(
      getConversationPreview({ messageType: 'image', body: 'Proof for order 812', mediaId: '109003629' })
    ).toBe('Proof for order 812');
  });

  it('uses the caption field when the body is the media id', () => {
    expect(
      getConversationPreview({
        messageType: 'image',
        body: '1090036290170293',
        mediaId: '1090036290170293',
        caption: 'Final artwork',
      })
    ).toBe('Final artwork');
  });

  it('labels each media kind', () => {
    const preview = (messageType) => getConversationPreview({ messageType, body: '' });

    expect(preview('video')).toBe('Video');
    expect(preview('audio')).toBe('Voice message');
    expect(preview('sticker')).toBe('Sticker');
  });

  it('leaves text messages exactly as they were', () => {
    const message = { messageType: 'text', body: 'Order ready for pickup' };

    expect(getConversationPreview(message)).toBe('Order ready for pickup');
    expect(getConversationPreview(message)).toBe(getMessageText(message));
  });

  it('does not relabel a long number sent as an actual text message', () => {
    // Only media types get the treatment — a GST number typed into a chat is
    // still the thing the customer said.
    expect(getConversationPreview({ messageType: 'text', body: '27APDPY8000J1ZM' })).toBe('27APDPY8000J1ZM');
    expect(getConversationPreview({ messageType: 'text', body: '1090036290170293' })).toBe('1090036290170293');
  });

  it('reads a nested text body, as the previous helper did', () => {
    expect(getConversationPreview({ messageType: 'text', text: { body: 'hello' } })).toBe('hello');
  });
});
